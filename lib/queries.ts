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
