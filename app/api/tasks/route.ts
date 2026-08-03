import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Bulk edit: apply the same start date, end date and/or assignee to several
// tasks at once. Body is { ids: number[], start_date?, end_date?, assignee? }.
// Only the keys that are present are written, so the caller can change one
// field and leave the rest of each task alone; a present-but-empty value
// clears that field (same convention as PATCH /api/tasks/[id]).
export async function PATCH(req: Request) {
  const body = await req.json();
  const ids: unknown = body?.ids;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.some((x) => !Number.isInteger(x))
  ) {
    return NextResponse.json(
      { error: "ids must be a non-empty array of task ids" },
      { status: 400 }
    );
  }

  const fields: Record<string, string | null> = {};
  if (body.start_date !== undefined) fields.start_date = body.start_date || null;
  if (body.end_date !== undefined) fields.end_date = body.end_date || null;
  if (body.assignee !== undefined)
    fields.assignee = body.assignee?.trim() || null;
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }
  if (
    fields.start_date &&
    fields.end_date &&
    fields.end_date < fields.start_date
  ) {
    return NextResponse.json(
      { error: "end_date must be on or after start_date" },
      { status: 400 }
    );
  }

  const values = Object.values(fields);
  const set = Object.keys(fields)
    .map((k, i) => `${k} = $${i + 1}`)
    .join(", ");
  const idPlaceholders = ids
    .map((_, i) => `$${values.length + i + 1}`)
    .join(", ");
  const rows = await query<{ id: number }>(
    `UPDATE tasks SET ${set} WHERE id IN (${idPlaceholders}) RETURNING id`,
    [...values, ...ids]
  );
  return NextResponse.json({ ok: true, updated: rows.length });
}
