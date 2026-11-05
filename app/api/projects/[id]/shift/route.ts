import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { projectExists, syncDeliverablesFromTasks } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

const shifted = (column: string) =>
  `${column} = to_char(${column}::date + $1::int, 'YYYY-MM-DD')`;

// Move a whole project along the calendar by { days }. Open tasks and
// deliverables travel with it; finished ones keep the dates they really
// happened on. All-or-nothing, so a project is never left half moved.
export async function POST(req: Request, { params }: Params) {
  const id = Number((await params).id);
  if (!(await projectExists(id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { days } = await req.json();
  if (!Number.isInteger(days) || days === 0) {
    return NextResponse.json(
      { error: "days must be a non-zero integer" },
      { status: 400 }
    );
  }
  await transaction([
    {
      text: `UPDATE projects SET ${shifted("start_date")}, ${shifted("end_date")} WHERE id = $2`,
      params: [days, id],
    },
    {
      text: `UPDATE tasks SET ${shifted("start_date")}, ${shifted("end_date")}
              WHERE project_id = $2 AND status <> 'done'`,
      params: [days, id],
    },
    {
      text: `UPDATE milestones SET ${shifted("due_date")}
              WHERE project_id = $2 AND done = 0`,
      params: [days, id],
    },
  ]);
  const open = await query<{ id: number }>(
    "SELECT id FROM tasks WHERE project_id = $1 AND status <> 'done'",
    [id]
  );
  await syncDeliverablesFromTasks(open.map((row) => row.id));
  return NextResponse.json({ ok: true });
}
