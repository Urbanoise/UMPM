import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import {
  syncDeliverablesFromTasks,
  syncTaskFromDeliverable,
} from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const id = Number((await params).id);
  const body = await req.json();
  const fields: Record<string, unknown> = {};
  if (body.name !== undefined) fields.name = String(body.name).trim();
  if (body.due_date !== undefined) fields.due_date = body.due_date;
  if (body.done !== undefined) fields.done = body.done ? 1 : 0;
  if (body.task_id !== undefined) {
    const taskId = body.task_id === null ? null : Number(body.task_id);
    if (taskId !== null) {
      const task = await queryOne<{ taken: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM milestones x WHERE x.task_id = t.id AND x.id <> m.id
         ) AS taken
           FROM tasks t
           JOIN milestones m ON m.project_id = t.project_id
          WHERE t.id = $1 AND m.id = $2`,
        [taskId, id]
      );
      if (!task || task.taken) {
        return NextResponse.json(
          { error: "task is in another project or already has a deliverable" },
          { status: 400 }
        );
      }
    }
    fields.task_id = taskId;
  }
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
  // On linking the task's schedule wins, and the deliverable lands on its end
  // date; the second sync only matters for a task that had no end date yet.
  if (typeof fields.task_id === "number") {
    await syncDeliverablesFromTasks([fields.task_id]);
  }
  if (
    fields.due_date !== undefined ||
    fields.task_id !== undefined ||
    fields.done !== undefined
  ) {
    await syncTaskFromDeliverable(id);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const id = Number((await params).id);
  await query("DELETE FROM milestones WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
