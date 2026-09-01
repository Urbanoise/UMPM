import { NextResponse } from "next/server";
import { queryOne, transaction } from "@/lib/db";
import { getAllProjects, nextProjectPlacement } from "@/lib/queries";
import { PROJECT_STATUSES } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getAllProjects());
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, description, start_date, end_date, status, responsible, tentative } =
    body;
  if (!name?.trim() || !start_date || !end_date) {
    return NextResponse.json(
      { error: "name, start_date and end_date are required" },
      { status: 400 }
    );
  }
  if (end_date < start_date) {
    return NextResponse.json(
      { error: "end_date must be on or after start_date" },
      { status: 400 }
    );
  }
  const { color_slot, sort_order } = await nextProjectPlacement();
  const row = await queryOne<{ id: number }>(
    `INSERT INTO projects (name, description, start_date, end_date, status, responsible, color_slot, sort_order, tentative)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      name.trim(),
      description?.trim() || null,
      start_date,
      end_date,
      PROJECT_STATUSES.includes(status) ? status : "planned",
      responsible?.trim() || null,
      color_slot,
      sort_order,
      tentative ? 1 : 0,
    ]
  );
  return NextResponse.json({ id: row!.id }, { status: 201 });
}

// Persist a full drag-and-drop ordering of projects: body is { order: number[] }
// listing every project id in the desired display order.
export async function PUT(req: Request) {
  const body = await req.json();
  const order = body?.order;
  if (
    !Array.isArray(order) ||
    order.some((x) => !Number.isInteger(x))
  ) {
    return NextResponse.json(
      { error: "order must be an array of project ids" },
      { status: 400 }
    );
  }
  await transaction(
    order.map((id: number, i: number) => ({
      text: "UPDATE projects SET sort_order = $1 WHERE id = $2",
      params: [i, id],
    }))
  );
  return NextResponse.json({ ok: true });
}
