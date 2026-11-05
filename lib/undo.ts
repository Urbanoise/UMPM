import type { Project, TaskCategory } from "./types";

// Undo works on what actually changed in the database, not on the action that
// changed it. Server rules rewrite more than the row that was edited (a linked
// deliverable follows its task, a shift skips finished work, un-ticking reopens
// a task as in-progress), so an "opposite action" would not get back to where
// it started. Comparing the data before and after an edit gives the exact field
// values to put back, for every kind of edit, through one route.

/** Runs a save so that its effect can be undone. Rows it creates are not tracked. */
export type TrackEdit = <T>(save: () => Promise<T>) => Promise<T>;

/** What undo may write. `id`, `project_id` and `color_slot` never change. */
export const UNDO_COLUMNS = {
  projects: [
    "name",
    "description",
    "start_date",
    "end_date",
    "status",
    "responsible",
    "tentative",
    "sort_order",
  ],
  tasks: ["name", "start_date", "end_date", "status", "assignee", "note"],
  milestones: ["name", "due_date", "done"],
  task_categories: ["name"],
} as const;

export type UndoTable = keyof typeof UNDO_COLUMNS;
export type UndoValue = string | number | null;
type Fields = Record<string, UndoValue>;

/** Everything a deleted row needs to come back as it was, apart from its id. */
export function rowColumns(table: UndoTable): string[] {
  const fixed: Record<UndoTable, string[]> = {
    projects: ["color_slot", "created_at"],
    tasks: ["project_id"],
    milestones: ["project_id"],
    task_categories: [],
  };
  return [...UNDO_COLUMNS[table], ...fixed[table]];
}

/**
 * One row's change. `to: null` means the row was deleted, with `from` holding
 * all of it; `from: null` is that in reverse, the row coming back. A restored row
 * keeps its id, so older undo steps that refer to it still work.
 */
export type RowChange = {
  table: UndoTable;
  id: number;
  name: string;
  from: Fields | null;
  to: Fields | null;
};

function diffRows<R extends { id: number; name: string }>(
  table: UndoTable,
  before: R[],
  after: R[]
): RowChange[] {
  const current = new Map(after.map((row) => [row.id, row]));
  const value = (row: R, column: string) =>
    (row as unknown as Fields)[column] ?? null;
  const changes: RowChange[] = [];
  for (const old of before) {
    const row = current.get(old.id);
    if (!row) {
      const whole = rowColumns(table).map((c) => [c, value(old, c)]);
      changes.push({
        table,
        id: old.id,
        name: old.name,
        from: Object.fromEntries(whole),
        to: null,
      });
      continue;
    }
    const from: Fields = {};
    const to: Fields = {};
    for (const column of UNDO_COLUMNS[table]) {
      const a = value(old, column);
      const b = value(row, column);
      if (a !== b) {
        from[column] = a;
        to[column] = b;
      }
    }
    if (Object.keys(to).length > 0)
      changes.push({ table, id: row.id, name: row.name, from, to });
  }
  return changes;
}

/** Every field that differs between two reads of the project list. */
export function diffProjects(before: Project[], after: Project[]): RowChange[] {
  return [
    ...diffRows("projects", before, after),
    ...diffRows(
      "tasks",
      before.flatMap((p) => p.tasks),
      after.flatMap((p) => p.tasks)
    ),
    ...diffRows(
      "milestones",
      before.flatMap((p) => p.milestones),
      after.flatMap((p) => p.milestones)
    ),
  ];
}

export function diffCategories(
  before: TaskCategory[],
  after: TaskCategory[]
): RowChange[] {
  return diffRows("task_categories", before, after);
}

export function reversed(changes: RowChange[]): RowChange[] {
  return changes.map((c) => ({ ...c, from: c.to, to: c.from }));
}

/** Names an edit for the toast; null when it only reordered projects. */
export function changeLabel(changes: RowChange[]): string | null {
  const named = changes.filter(
    (c) => !c.from || !c.to || Object.keys(c.to).join() !== "sort_order"
  );
  // A linked pair shares its name, so it counts as one thing.
  const names = [...new Set(named.map((c) => c.name))];
  if (names.length === 0) return null;
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
}
