import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { categoryStatus } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

// Tasks point at a category by id, so renaming one touches no task rows.
export async function PATCH(req: Request, { params }: Params) {
  const id = Number((await params).id);
  const body = await req.json();
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const taken = await query(
    "SELECT 1 FROM task_categories WHERE lower(name) = lower($1) AND id <> $2",
    [name, id]
  );
  if (taken.length > 0) {
    return NextResponse.json({ error: "name already exists" }, { status: 400 });
  }
  await query("UPDATE task_categories SET name = $1 WHERE id = $2", [name, id]);
  return NextResponse.json({ ok: true });
}

// A deleted category's tasks fall back to "todo". None of them were done, so a
// linked deliverable is unaffected and needs no sync.
export async function DELETE(_req: Request, { params }: Params) {
  const id = Number((await params).id);
  await transaction([
    {
      text: "UPDATE tasks SET status = 'todo' WHERE status = $1",
      params: [categoryStatus(id)],
    },
    { text: "DELETE FROM task_categories WHERE id = $1", params: [id] },
  ]);
  return NextResponse.json({ ok: true });
}
