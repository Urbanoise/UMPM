import { NextResponse } from "next/server";
import { z } from "zod";
import { queryOne, transaction } from "@/lib/db";
import { nextProjectPlacement } from "@/lib/queries";
import { PROJECT_STATUSES, TASK_STATUSES } from "@/lib/types";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const trimmed = z.string().trim().min(1);

// What the review step sends back. It is close to the extracted draft, but this
// is user-edited data arriving over the wire like any other request body, so it
// is validated here on its own terms rather than trusted because Claude produced
// it. `notes` and `confidence` are review aids and are not persisted.
const Body = z.object({
  name: trimmed,
  description: z.string().trim().nullish(),
  start_date: DATE,
  end_date: DATE,
  status: z.enum(PROJECT_STATUSES as [string, ...string[]]).default("planned"),
  responsible: z.string().trim().nullish(),
  tentative: z.boolean().default(false),
  deliverables: z
    .array(z.object({ name: trimmed, due_date: DATE }))
    .default([]),
  tasks: z
    .array(
      z.object({
        name: trimmed,
        start_date: DATE.nullish(),
        end_date: DATE.nullish(),
        status: z.enum(TASK_STATUSES as [string, ...string[]]).default("todo"),
        assignee: z.string().trim().nullish(),
      })
    )
    .default([]),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    // Name the offending field: the review form validates before sending, so a
    // rejection here means a malformed row and the path is what identifies it.
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".");
    return NextResponse.json(
      { error: issue ? [where, issue.message].filter(Boolean).join(": ") : "invalid project" },
      { status: 400 }
    );
  }
  const draft = parsed.data;
  if (draft.end_date < draft.start_date) {
    return NextResponse.json(
      { error: "end_date must be on or after start_date" },
      { status: 400 }
    );
  }

  const { color_slot, sort_order } = await nextProjectPlacement();
  const project = await queryOne<{ id: number }>(
    `INSERT INTO projects (name, description, start_date, end_date, status, responsible, color_slot, sort_order, tentative)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      draft.name,
      draft.description || null,
      draft.start_date,
      draft.end_date,
      draft.status,
      draft.responsible || null,
      color_slot,
      sort_order,
      draft.tentative ? 1 : 0,
    ]
  );
  const id = project!.id;

  // One round trip, all-or-nothing: a contract import either lands complete or
  // leaves an empty project behind rather than half a schedule.
  await transaction([
    ...draft.deliverables.map((d) => ({
      text: "INSERT INTO milestones (project_id, name, due_date, done) VALUES ($1, $2, $3, 0)",
      params: [id, d.name, d.due_date],
    })),
    ...draft.tasks.map((t) => ({
      text: `INSERT INTO tasks (project_id, name, start_date, end_date, status, assignee)
             VALUES ($1, $2, $3, $4, $5, $6)`,
      params: [
        id,
        t.name,
        t.start_date || null,
        t.end_date || null,
        t.status,
        t.assignee || null,
      ],
    })),
  ]);

  return NextResponse.json(
    {
      id,
      deliverables: draft.deliverables.length,
      tasks: draft.tasks.length,
    },
    { status: 201 }
  );
}
