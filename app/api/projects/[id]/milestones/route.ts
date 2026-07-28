import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { projectExists } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const projectId = Number((await params).id);
  if (!(await projectExists(projectId))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { name, due_date } = await req.json();
  if (!name?.trim() || !due_date) {
    return NextResponse.json(
      { error: "name and due_date are required" },
      { status: 400 }
    );
  }
  const row = await queryOne<{ id: number }>(
    "INSERT INTO milestones (project_id, name, due_date) VALUES ($1, $2, $3) RETURNING id",
    [projectId, name.trim(), due_date]
  );
  return NextResponse.json({ id: row!.id }, { status: 201 });
}
