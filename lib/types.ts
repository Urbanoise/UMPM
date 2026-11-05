export type ProjectStatus = "planned" | "active" | "on-hold" | "done";
export type BuiltinTaskStatus = "todo" | "in-progress" | "done";
/** A built-in status, or `cat-<id>` for a row of task_categories. */
export type TaskStatus = string;

export interface Milestone {
  id: number;
  project_id: number;
  name: string;
  due_date: string; // YYYY-MM-DD
  done: number; // 0 | 1
}

export interface Task {
  id: number;
  project_id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: TaskStatus;
  assignee: string | null;
  note: string | null;
}

export interface TaskCategory {
  id: number;
  name: string;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: ProjectStatus;
  responsible: string | null;
  color_slot: number; // 0..7, fixed at creation
  sort_order: number | null; // null until the first drag reorder
  tentative: number; // 0 | 1 — start date not yet confirmed (e.g. awaiting contract)
  milestones: Milestone[];
  tasks: Task[];
}

export const PROJECT_STATUSES: ProjectStatus[] = [
  "planned",
  "active",
  "on-hold",
  "done",
];
export const TASK_STATUSES: BuiltinTaskStatus[] = [
  "todo",
  "in-progress",
  "done",
];

export const categoryStatus = (id: number): TaskStatus => `cat-${id}`;

/** The category a status refers to, or null for a built-in status. */
export function categoryIdOf(status: unknown): number | null {
  const match = typeof status === "string" && /^cat-(\d{1,9})$/.exec(status);
  return match ? Number(match[1]) : null;
}
