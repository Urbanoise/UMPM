import type { Milestone, Project, Task } from "./types";

// A deliverable can be the endpoint of a task: `milestones.task_id` points at it,
// and the pair is two views of one commitment, whatever each is called. Most
// tasks have no deliverable. The deliverable is the canonical face of a pair: the
// deadlines panel lists only that one, and the two dates are kept in step
// server-side (see `syncDeliverablesFromTasks` / `syncTaskFromDeliverable` in
// lib/queries.ts).
export function deliverableOf(project: Project, task: Task) {
  return project.milestones.find((m) => m.task_id === task.id);
}

export function taskOf(project: Project, milestone: Milestone) {
  return project.tasks.find((task) => task.id === milestone.task_id);
}

/** The ids of the tasks in `project` that have a deliverable. */
export function linkedTaskIds(project: Project): Set<number> {
  return new Set(
    project.milestones.flatMap((m) => (m.task_id === null ? [] : [m.task_id]))
  );
}
