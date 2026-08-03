import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { syncDeliverablesFromTasks } from "@/lib/queries";
import { TASK_STATUSES } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const id = Number((await params).id);
  const body = await req.json();
  const fields: Record<string, unknown> = {};
  if (body.name !== undefined) fields.name = String(body.name).trim();
  if (body.start_date !== undefined) fields.start_date = body.start_date || null;
  if (body.end_date !== undefined) fields.end_date = body.end_date || null;
  if (body.status !== undefined && TASK_STATUSES.includes(body.status))
    fields.status = body.status;
  if (body.assignee !== undefined)
    fields.assignee = body.assignee?.trim() || null;
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }
  const values = Object.values(fields);
  const set = Object.keys(fields)
    .map((k, i) => `${k} = $${i + 1}`)
    .join(", ");
  await query(`UPDATE tasks SET ${set} WHERE id = $${values.length + 1}`, [
    ...values,
    id,
  ]);
  // A rename can link the task to a different deliverable, so re-sync on that too.
  if (fields.end_date !== undefined || fields.name !== undefined) {
    await syncDeliverablesFromTasks([id]);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const id = Number((await params).id);
  await query("DELETE FROM tasks WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
