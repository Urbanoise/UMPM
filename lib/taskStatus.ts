import type { StrKey } from "./i18n";
import {
  TASK_STATUSES,
  categoryIdOf,
  categoryStatus,
  type BuiltinTaskStatus,
  type TaskCategory,
  type TaskStatus,
} from "./types";
import { seriesVar } from "./workItems";

type T = (key: StrKey) => string;

const BUILTIN_COLORS: Record<BuiltinTaskStatus, string> = {
  todo: "var(--text-muted)",
  "in-progress": "var(--status-good)",
  done: "var(--series-3)",
};

// Every series slot except the two that In progress and Done already use.
const CATEGORY_SLOTS = [0, 2, 4, 5, 6, 7];

/** Column and group order. Custom categories sit between the open work and done. */
export function statusOrder(categories: TaskCategory[]): TaskStatus[] {
  return [
    ...TASK_STATUSES.filter((s) => s !== "done"),
    ...categories.map((c) => categoryStatus(c.id)),
    "done",
  ];
}

/**
 * Whether work on a task has begun, which is what the Gantt's solid fill and the
 * overview's in-progress share mean. Being in a custom category counts.
 */
export function isStarted(status: TaskStatus) {
  return status !== "todo" && status !== "done";
}

export function statusLabel(
  status: TaskStatus,
  categories: TaskCategory[],
  t: T
) {
  const id = categoryIdOf(status);
  if (id === null) return t(`tstatus_${status as BuiltinTaskStatus}`);
  return categories.find((c) => c.id === id)?.name ?? t("tstatus_todo");
}

/** The colour is derived from the id, so a category keeps it through a rename. */
export function statusColor(status: TaskStatus) {
  const id = categoryIdOf(status);
  return id === null
    ? BUILTIN_COLORS[status as BuiltinTaskStatus]
    : seriesVar(CATEGORY_SLOTS[id % CATEGORY_SLOTS.length]);
}
