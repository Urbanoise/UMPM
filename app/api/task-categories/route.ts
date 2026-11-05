import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import type { TaskCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    await query<TaskCategory>("SELECT * FROM task_categories ORDER BY id")
  );
}

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const row = await queryOne<{ id: number }>(
    `INSERT INTO task_categories (name)
     SELECT $1::text
      WHERE NOT EXISTS (SELECT 1 FROM task_categories WHERE lower(name) = lower($1::text))
     RETURNING id`,
    [name]
  );
  if (!row) {
    return NextResponse.json({ error: "name already exists" }, { status: 400 });
  }
  return NextResponse.json({ id: row.id }, { status: 201 });
}
