import { query, queryOne } from "./db";
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

// Tasks and deliverables that share a name within a project are one commitment
// seen twice (see lib/linked.ts), so a date written on either side propagates to
// the other. Both helpers run right after the row they follow has been updated.
//
// A task whose end date is cleared is left alone rather than propagated:
// milestones.due_date is NOT NULL, so there is nothing to write.
export async function syncDeliverablesFromTasks(taskIds: number[]) {
  if (taskIds.length === 0) return;
  const placeholders = taskIds.map((_, i) => `$${i + 1}`).join(", ");
  await query(
    `UPDATE milestones m
        SET due_date = t.end_date
       FROM tasks t
      WHERE t.id IN (${placeholders})
        AND m.project_id = t.project_id
        AND m.name = t.name
        AND t.end_date IS NOT NULL
        AND m.due_date IS DISTINCT FROM t.end_date`,
    taskIds
  );
}

export async function syncTaskFromDeliverable(milestoneId: number) {
  await query(
    `UPDATE tasks t
        SET end_date = m.due_date
       FROM milestones m
      WHERE m.id = $1
        AND t.project_id = m.project_id
        AND t.name = m.name
        AND t.end_date IS DISTINCT FROM m.due_date`,
    [milestoneId]
  );
}
