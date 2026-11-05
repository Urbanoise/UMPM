import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import {
  rehomeOrphanedTasks,
  syncDeliverablesFromTasks,
  syncTaskFromDeliverable,
} from "@/lib/queries";
import {
  UNDO_COLUMNS,
  rowColumns,
  type RowChange,
  type UndoTable,
  type UndoValue,
} from "@/lib/undo";

type Fields = Record<string, UndoValue>;

// Without these the parameters of INSERT ... SELECT have no type to infer.
const INT_COLUMNS = new Set([
  "project_id",
  "color_slot",
  "sort_order",
  "tentative",
  "done",
]);

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null;
}

function isRowChange(row: Partial<RowChange> | null): row is RowChange {
  if (!row || !Number.isInteger(row.id)) return false;
  if (!Object.hasOwn(UNDO_COLUMNS, row.table ?? "")) return false;
  const table = row.table as UndoTable;
  const { from, to } = row;

  if (isFields(from) && isFields(to)) {
    const allowed: readonly string[] = UNDO_COLUMNS[table];
    const columns = Object.keys(to);
    return (
      columns.length > 0 &&
      columns.every((c) => allowed.includes(c) && Object.hasOwn(from, c))
    );
  }
  // A whole row coming back (`from` null) or going away (`to` null).
  const whole = from === null ? to : to === null ? from : undefined;
  if (!isFields(whole)) return false;
  const columns = Object.keys(whole);
  return (
    columns.length > 0 &&
    columns.every((c) => rowColumns(table).includes(c))
  );
}

function statement({ table, id, from, to }: RowChange) {
  const params: unknown[] = [];
  const param = (value: unknown) => `$${params.push(value)}`;
  const holds = (row: Fields) =>
    Object.keys(row)
      .map((c) => `${c} IS NOT DISTINCT FROM ${param(row[c])}`)
      .join(" AND ");

  if (from === null) {
    const columns = Object.keys(to!);
    const values = columns.map(
      (c) => `${param(to![c])}::${INT_COLUMNS.has(c) ? "int" : "text"}`
    );
    // The parent may have been deleted since, which is a skip and not an error.
    const parent =
      table === "projects" || table === "task_categories"
        ? ""
        : `WHERE EXISTS (SELECT 1 FROM projects WHERE id = ${param(to!.project_id)})`;
    return {
      text: `INSERT INTO ${table} (id, ${columns.join(", ")})
             SELECT ${param(id)}::int, ${values.join(", ")} ${parent}
             ON CONFLICT (id) DO NOTHING RETURNING id`,
      params,
    };
  }

  if (to === null) {
    // Children go first in the same transaction, so any left here are ones the
    // edit does not know about, and deleting the project would cascade to them.
    const noOtherChildren =
      table === "projects"
        ? `AND NOT EXISTS (SELECT 1 FROM tasks WHERE project_id = ${param(id)})
           AND NOT EXISTS (SELECT 1 FROM milestones WHERE project_id = ${param(id)})`
        : "";
    return {
      text: `DELETE FROM ${table} WHERE id = ${param(id)} AND ${holds(from)}
             ${noOtherChildren} RETURNING id`,
      params,
    };
  }

  const set = Object.keys(to)
    .map((c) => `${c} = ${param(to[c])}`)
    .join(", ");
  const same = Object.fromEntries(Object.keys(to).map((c) => [c, from[c]]));
  return {
    text: `UPDATE ${table} SET ${set} WHERE id = ${param(id)} AND ${holds(same)} RETURNING id`,
    params,
  };
}

/** A project is created before its rows and deleted after them; so is a category. */
function runOrder({ table, to }: RowChange) {
  const depth = ["task_categories", "projects", "tasks", "milestones"].indexOf(table);
  return to === null ? 10 - depth : depth;
}

// Writes the rows of an undo or redo: { rows: RowChange[] }. Each row is only
// written if it still holds the `from` values (for a deleted row, if its id is
// free). The dashboard is shared, so anything changed since (by a colleague, or
// a deleted row) is left alone and reported as skipped; undo never overwrites
// work it did not make. Rows are checked whole so a task can't end up with one
// date restored and not the other.
export async function POST(req: Request) {
  const body = await req.json();
  const rows: (Partial<RowChange> | null)[] = body?.rows;
  if (!Array.isArray(rows) || rows.length === 0 || !rows.every(isRowChange)) {
    return NextResponse.json({ error: "invalid rows" }, { status: 400 });
  }

  // `table` and the column names were checked by isRowChange.
  const ordered = [...(rows as RowChange[])].sort(
    (a, b) => runOrder(a) - runOrder(b)
  );
  const results = await transaction(ordered.map(statement));
  const written = ordered.filter((_, i) => results[i].length > 0);
  await rehomeOrphanedTasks();

  // A complete restore leaves linked pairs matching already. These matter when
  // one side of a pair was skipped, or a rename re-points a link.
  const updated = written.filter((r) => r.from && r.to);
  await syncDeliverablesFromTasks(
    updated.filter((r) => r.table === "tasks").map((r) => r.id)
  );
  await Promise.all(
    updated
      .filter((r) => r.table === "milestones")
      .map((r) => syncTaskFromDeliverable(r.id))
  );

  // A row back from deletion is the older side of its pair: it takes the dates
  // of the partner that stayed, which may have moved on in the meantime.
  const added = written.filter((r) => r.from === null);
  const addedTasks = added.filter((r) => r.table === "tasks").map((r) => r.id);
  const addedMilestones = added
    .filter((r) => r.table === "milestones")
    .map((r) => r.id);
  if (added.length > 0) {
    const pairs = await query<{ task_id: number; milestone_id: number }>(
      `SELECT t.id AS task_id, m.id AS milestone_id
         FROM tasks t
         JOIN milestones m ON m.project_id = t.project_id AND m.name = t.name
        WHERE t.id = ANY($1::int[]) OR m.id = ANY($2::int[])`,
      [addedTasks, addedMilestones]
    );
    await syncDeliverablesFromTasks(
      pairs
        .filter((p) => addedMilestones.includes(p.milestone_id))
        .map((p) => p.task_id)
    );
    await Promise.all(
      pairs
        .filter((p) => addedTasks.includes(p.task_id))
        .map((p) => syncTaskFromDeliverable(p.milestone_id))
    );
  }

  return NextResponse.json({
    ok: true,
    restored: written.length,
    skipped: rows.length - written.length,
  });
}
