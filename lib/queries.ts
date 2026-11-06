import { query, queryOne } from "./db";
import { TASK_STATUSES, categoryIdOf } from "./types";
import type { Milestone, Project, Task } from "./types";

type ProjectRow = Omit<Project, "milestones" | "tasks">;

export async function getAllProjects(): Promise<Project[]> {
  const [projects, milestones, tasks] = await Promise.all([
    query<ProjectRow>(
      "SELECT * FROM projects ORDER BY COALESCE(sort_order, 1000000000), start_date, id"
    ),
    query<Milestone>("SELECT * FROM milestones ORDER BY due_date, id"),
    // NULLS FIRST: undated tasks sort ahead of dated ones, as they did on SQLite.
    query<Task>("SELECT * FROM tasks ORDER BY start_date NULLS FIRST, id"),
  ]);
  return projects.map((p) => ({
    ...p,
    milestones: milestones.filter((m) => m.project_id === p.id),
    tasks: tasks.filter((t) => t.project_id === p.id),
  }));
}

export async function projectExists(id: number): Promise<boolean> {
  return !!(await queryOne("SELECT 1 FROM projects WHERE id = $1", [id]));
}

/** A built-in status, or a custom category that still exists. */
export async function isTaskStatus(status: unknown): Promise<boolean> {
  if ((TASK_STATUSES as unknown[]).includes(status)) return true;
  const id = categoryIdOf(status);
  if (id === null) return false;
  return !!(await queryOne("SELECT 1 FROM task_categories WHERE id = $1", [id]));
}

/**
 * Undo can write a task back into a category a colleague has deleted since. A
 * task with no matching column would vanish from the board, so it goes to "todo".
 */
export async function rehomeOrphanedTasks() {
  await query(
    `UPDATE tasks SET status = 'todo'
      WHERE status LIKE 'cat-%'
        AND status NOT IN (SELECT 'cat-' || id FROM task_categories)`
  );
}

// A task and the deliverable pointing at it through milestones.task_id are one
// commitment seen twice (see lib/linked.ts), so a date or completion written on
// either side propagates to the other. Both helpers run right after the row they follow has
// been updated.
//
// Completion maps task status 'done' <-> milestones.done = 1. Un-ticking a
// deliverable reopens a finished task as 'in-progress'; a task that is not done
// is left at whatever not-done status it already has.
//
// A task whose end date is cleared keeps the deliverable's date rather than
// propagating: milestones.due_date is NOT NULL, so there is nothing to write.
export async function syncDeliverablesFromTasks(taskIds: number[]) {
  if (taskIds.length === 0) return;
  const placeholders = taskIds.map((_, i) => `$${i + 1}`).join(", ");
  await query(
    `UPDATE milestones m
        SET due_date = COALESCE(t.end_date, m.due_date),
            done     = CASE WHEN t.status = 'done' THEN 1 ELSE 0 END
       FROM tasks t
      WHERE t.id IN (${placeholders})
        AND m.task_id = t.id
        AND (m.due_date IS DISTINCT FROM COALESCE(t.end_date, m.due_date)
             OR m.done <> CASE WHEN t.status = 'done' THEN 1 ELSE 0 END)`,
    taskIds
  );
}

export async function syncTaskFromDeliverable(milestoneId: number) {
  await query(
    `UPDATE tasks t
        SET end_date = m.due_date,
            status   = CASE WHEN m.done = 1 THEN 'done'
                            WHEN t.status = 'done' THEN 'in-progress'
                            ELSE t.status END
       FROM milestones m
      WHERE m.id = $1
        AND t.id = m.task_id
        AND (t.end_date IS DISTINCT FROM m.due_date
             OR (m.done = 1) <> (t.status = 'done'))`,
    [milestoneId]
  );
}

/**
 * A task and a deliverable created under one name are the same commitment, so
 * new rows link themselves; contract import relies on this. Only creation calls
 * it (one name, or a whole new project), so an unlinked pair stays unlinked.
 */
export async function linkSameNamed(projectId: number, name?: string) {
  await query(
    `WITH pair AS (
       SELECT MIN(m.id) AS milestone_id, MIN(t.id) AS task_id
         FROM milestones m
         JOIN tasks t ON t.project_id = m.project_id AND t.name = m.name
        WHERE m.project_id = $1
          AND ($2::text IS NULL OR m.name = $2)
          AND m.task_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM milestones x WHERE x.task_id = t.id)
        GROUP BY m.name
     )
     UPDATE milestones SET task_id = pair.task_id
       FROM pair
      WHERE milestones.id = pair.milestone_id`,
    [projectId, name ?? null]
  );
}

/**
 * Where a newly created project lands: its colour slot (fixed at creation, so a
 * project keeps its colour as others come and go) and its position at the end of
 * the current ordering. Shared by the manual create form and contract import.
 */
export async function nextProjectPlacement(): Promise<{
  color_slot: number;
  sort_order: number;
}> {
  const row = (await queryOne<{ max_id: number; max_order: number }>(
    "SELECT COALESCE(MAX(id), 0) AS max_id, COALESCE(MAX(sort_order), -1) AS max_order FROM projects"
  ))!;
  return { color_slot: row.max_id % 8, sort_order: row.max_order + 1 };
}
