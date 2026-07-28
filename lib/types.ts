export type ProjectStatus = "planned" | "active" | "on-hold" | "done";
export type TaskStatus = "todo" | "in-progress" | "done";

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
export const TASK_STATUSES: TaskStatus[] = ["todo", "in-progress", "done"];
