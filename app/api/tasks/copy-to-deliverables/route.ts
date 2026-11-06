import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Turn selected tasks into deliverables of the same project, carrying the name
// and end date across. Body is { ids: number[] }.
//
// Each new deliverable is linked to its task (see lib/linked.ts), so the two
// dates stay in step from then on. Tasks with no end date are skipped —
// milestones.due_date is NOT NULL — as are tasks that already have a deliverable
// or whose project has one of that name, which keeps the action safe to press
// twice.
export async function POST(req: Request) {
  const body = await req.json();
  const ids: unknown = body?.ids;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.some((x) => !Number.isInteger(x))
  ) {
    return NextResponse.json(
      { error: "ids must be a non-empty array of task ids" },
      { status: 400 }
    );
  }

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const created = await query<{ id: number }>(
    `INSERT INTO milestones (project_id, name, due_date, done, task_id)
     SELECT t.project_id, t.name, t.end_date,
            CASE WHEN t.status = 'done' THEN 1 ELSE 0 END, t.id
       FROM tasks t
      WHERE t.id IN (${placeholders})
        AND t.end_date IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM milestones m
           WHERE m.task_id = t.id
              OR (m.project_id = t.project_id AND m.name = t.name)
        )
     RETURNING id`,
    ids
  );

  return NextResponse.json({
    created: created.length,
    skipped: ids.length - created.length,
  });
}
