import type { Project, Task } from "./types";

// A task and a deliverable that carry the same name inside the same project are
// two views of one commitment — the Batumi deliverables, for instance, exist as
// both. The deliverable is the canonical face of it: the calendar draws only
// that one, and the two dates are kept in step server-side (see
// `syncDeliverablesFromTasks` / `syncTaskFromDeliverable` in lib/queries.ts).
export function deliverableNames(project: Project): Set<string> {
  return new Set(project.milestones.map((m) => m.name));
}

export function hasDeliverable(project: Project, task: Task): boolean {
  return deliverableNames(project).has(task.name);
}
