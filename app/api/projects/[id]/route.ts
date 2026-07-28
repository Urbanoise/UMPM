import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { projectExists } from "@/lib/queries";
import { PROJECT_STATUSES } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const id = Number((await params).id);
  if (!(await projectExists(id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const body = await req.json();
  const fields: Record<string, unknown> = {};
  if (body.name !== undefined) fields.name = String(body.name).trim();
  if (body.description !== undefined)
    fields.description = body.description?.trim() || null;
  if (body.start_date !== undefined) fields.start_date = body.start_date;
  if (body.end_date !== undefined) fields.end_date = body.end_date;
  if (body.status !== undefined && PROJECT_STATUSES.includes(body.status))
    fields.status = body.status;
  if (body.responsible !== undefined)
    fields.responsible = body.responsible?.trim() || null;
  if (body.tentative !== undefined) fields.tentative = body.tentative ? 1 : 0;
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }
  const values = Object.values(fields);
  const set = Object.keys(fields)
    .map((k, i) => `${k} = $${i + 1}`)
    .join(", ");
  await query(`UPDATE projects SET ${set} WHERE id = $${values.length + 1}`, [
    ...values,
    id,
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const id = Number((await params).id);
  await query("DELETE FROM projects WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
