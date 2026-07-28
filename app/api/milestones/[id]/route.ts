import { NextResponse } from "next/server";
import { query } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const id = Number((await params).id);
  const body = await req.json();
  const fields: Record<string, unknown> = {};
  if (body.name !== undefined) fields.name = String(body.name).trim();
  if (body.due_date !== undefined) fields.due_date = body.due_date;
  if (body.done !== undefined) fields.done = body.done ? 1 : 0;
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }
  const values = Object.values(fields);
  const set = Object.keys(fields)
    .map((k, i) => `${k} = $${i + 1}`)
    .join(", ");
  await query(`UPDATE milestones SET ${set} WHERE id = $${values.length + 1}`, [
    ...values,
    id,
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const id = Number((await params).id);
  await query("DELETE FROM milestones WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
