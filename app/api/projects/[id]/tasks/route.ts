import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { projectExists } from "@/lib/queries";
import { TASK_STATUSES } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const projectId = Number((await params).id);
  if (!(await projectExists(projectId))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { name, start_date, end_date, status, assignee } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const row = await queryOne<{ id: number }>(
    `INSERT INTO tasks (project_id, name, start_date, end_date, status, assignee)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      projectId,
      name.trim(),
      start_date || null,
      end_date || null,
      TASK_STATUSES.includes(status) ? status : "todo",
      assignee?.trim() || null,
    ]
  );
  return NextResponse.json({ id: row!.id }, { status: 201 });
}
