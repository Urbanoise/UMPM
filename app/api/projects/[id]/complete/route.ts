import { NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { projectExists } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

// Close out a whole project at once: the project, every task and every
// deliverable are marked done in one all-or-nothing transaction. Names and
// dates are untouched, so no deliverable/task sync is needed.
export async function POST(_req: Request, { params }: Params) {
  const id = Number((await params).id);
  if (!(await projectExists(id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await transaction([
    { text: "UPDATE projects SET status = 'done' WHERE id = $1", params: [id] },
    {
      text: "UPDATE tasks SET status = 'done' WHERE project_id = $1",
      params: [id],
    },
    {
      text: "UPDATE milestones SET done = 1 WHERE project_id = $1",
      params: [id],
    },
  ]);
  return NextResponse.json({ ok: true });
}
