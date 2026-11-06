import type { Milestone, Project, Task } from "./types";
import { linkedTaskIds, taskOf } from "./linked";
import { daysBetween, shiftDate } from "./dates";
import { splitAssignees } from "./assignees";

export function seriesVar(slot: number) {
  return `var(--series-${((slot % 8) + 8) % 8})`;
}

/**
 * The date fields that give `task` a new deadline. The start moves by the same
 * amount, so the task keeps its duration and can never end before it begins.
 */
export function withDeadline(
  task: Task,
  date: string
): Pick<Task, "start_date" | "end_date"> {
  const { start_date: start, end_date: end } = task;
  return {
    start_date:
      start && end
        ? shiftDate(start, daysBetween(end, date))
        : start && start > date
          ? date
          : start,
    end_date: date,
  };
}

/** `p` with changes to one task, its linked deliverable following the date. */
export function withTaskChange(
  p: Project,
  taskId: number,
  fields: Partial<Task>
): Project {
  const task = p.tasks.find((x) => x.id === taskId);
  if (!task) return p;
  const end = fields.end_date;
  return {
    ...p,
    tasks: p.tasks.map((x) => (x.id === taskId ? { ...x, ...fields } : x)),
    milestones: end
      ? p.milestones.map((m) =>
          m.task_id === taskId ? { ...m, due_date: end } : m
        )
      : p.milestones,
  };
}

/**
 * `p` with a deliverable on a new date. A deliverable linked to a task moves as
 * that task does, so the pair stays one commitment with its duration intact.
 */
export function withDeliverableDate(
  p: Project,
  milestone: Milestone,
  date: string
): Project {
  const linked = taskOf(p, milestone);
  if (linked) return withTaskChange(p, linked.id, withDeadline(linked, date));
  return {
    ...p,
    milestones: p.milestones.map((m) =>
      m.id === milestone.id ? { ...m, due_date: date } : m
    ),
  };
}

/**
 * `p` moved along the calendar, as POST /api/projects/[id]/shift does it: open
 * work moves with the project, finished work keeps its real dates.
 */
export function shiftedProject(p: Project, days: number): Project {
  const move = (s: string | null) => s && shiftDate(s, days);
  return {
    ...p,
    start_date: shiftDate(p.start_date, days),
    end_date: shiftDate(p.end_date, days),
    tasks: p.tasks.map((x) =>
      x.status === "done"
        ? x
        : { ...x, start_date: move(x.start_date), end_date: move(x.end_date) }
    ),
    milestones: p.milestones.map((m) =>
      m.done ? m : { ...m, due_date: shiftDate(m.due_date, days) }
    ),
  };
}

/**
 * The assignee field after moving a task from one person to another; null means
 * the unassigned group. Anyone else sharing the task keeps it.
 */
export function reassigned(
  assignee: string | null,
  from: string | null,
  to: string | null
): string {
  const names = splitAssignees(assignee).filter((n) => n !== from);
  if (to && !names.includes(to)) names.push(to);
  return names.join(", ");
}

export type CalendarSpan = {
  key: string; // "m123" | "t456"
  kind: "milestone" | "task"; // "milestone" also marks a task with a deliverable
  name: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  done: boolean;
  project: Project;
  task?: Task; // the task to open; absent on a deliverable with no task
  milestone?: Milestone; // set on a deliverable with no task
};

/**
 * Everything with an end date, as a run of days. A
 * linked pair is the task here, because only the task knows when the work
 * starts; it keeps the "milestone" kind so it still reads as a deliverable. A
 * task with no start date is a single day, as on the Gantt.
 */
export function calendarSpans(projects: Project[]): CalendarSpan[] {
  const out: CalendarSpan[] = [];
  for (const p of projects) {
    const linked = linkedTaskIds(p);
    const dated = p.tasks.filter((task) => task.end_date);
    for (const m of p.milestones) {
      if (dated.some((task) => task.id === m.task_id)) continue; // drawn as its task below
      out.push({
        key: `m${m.id}`,
        kind: "milestone",
        name: m.name,
        start: m.due_date,
        end: m.due_date,
        done: !!m.done,
        project: p,
        milestone: m,
      });
    }
    for (const task of dated) {
      const end = task.end_date!;
      const start = task.start_date ?? end;
      out.push({
        key: `t${task.id}`,
        kind: linked.has(task.id) ? "milestone" : "task",
        name: task.name,
        start: start < end ? start : end,
        end,
        done: task.status === "done",
        project: p,
        task,
      });
    }
  }
  return out;
}

export type WeekSegment = {
  span: CalendarSpan;
  from: number; // first column, 0-6
  to: number; // last column, 0-6
  lane: number; // vertical slot in the week, 0 at the top
  continuesBefore: boolean; // the span runs on past the left end
  continuesAfter: boolean; // the span runs on past the right end
};

/** Which segments deserve the visible lanes: what ends here, then what starts. */
function segmentRank(s: Omit<WeekSegment, "lane">) {
  if (!s.continuesAfter) return 0;
  return s.continuesBefore ? 2 : 1;
}

/**
 * The parts of `spans` that fall in one calendar row, each placed in the first
 * lane where it overlaps nothing. `days` holds the row's seven dates, and a
 * span crossing into another row is cut at the edge and flagged as continuing.
 */
export function weekSegments(
  spans: CalendarSpan[],
  days: string[]
): WeekSegment[] {
  const columns = days.map((date, col) => ({ date, col }));
  const first = days[0];
  const last = days[days.length - 1];

  const parts = spans
    .filter((s) => s.start <= last && s.end >= first)
    .map((span) => {
      const inside = columns.filter(
        (c) => c.date >= span.start && c.date <= span.end
      );
      return {
        span,
        from: inside[0].col,
        to: inside[inside.length - 1].col,
        continuesBefore: span.start < first,
        continuesAfter: span.end > last,
      };
    })
    .sort(
      (a, b) =>
        segmentRank(a) - segmentRank(b) ||
        Number(b.span.kind === "milestone") -
          Number(a.span.kind === "milestone") ||
        a.from - b.from ||
        b.to - a.to ||
        a.span.key.localeCompare(b.span.key)
    );

  const taken: boolean[][] = []; // lane → column → occupied
  return parts.map((part) => {
    let lane = 0;
    for (; ; lane++) {
      taken[lane] ??= Array(7).fill(false);
      const row = taken[lane];
      let free = true;
      for (let c = part.from; c <= part.to; c++) if (row[c]) free = false;
      if (!free) continue;
      for (let c = part.from; c <= part.to; c++) row[c] = true;
      return { ...part, lane };
    }
  });
}
