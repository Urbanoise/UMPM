import { NextResponse } from "next/server";
import { z } from "zod";
import { mailEnabled } from "@/lib/mail";
import {
  dismissAssignments,
  pendingAssignments,
  sendAssignments,
} from "@/lib/notifications";

export const maxDuration = 60;

const Body = z.object({
  action: z.enum(["send", "dismiss"]),
  items: z
    .array(z.object({ task_id: z.number().int(), name: z.string().min(1) }))
    .min(1),
});

// The assignment emails waiting for a PM. Addresses never appear here, because
// the dashboard reads this. A database without the tables yet has nothing to
// offer, which must not stop the dashboard loading.
export async function GET() {
  try {
    return NextResponse.json({
      ...(await pendingAssignments()),
      mailEnabled: mailEnabled(),
    });
  } catch {
    return NextResponse.json({
      items: [],
      unknownPeople: [],
      mailEnabled: false,
    });
  }
}

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const { action, items } = body.data;
  if (action === "dismiss") {
    return NextResponse.json({ dismissed: await dismissAssignments(items) });
  }
  if (!mailEnabled()) {
    return NextResponse.json({ error: "mail is not set up" }, { status: 409 });
  }
  const { sent, failed } = await sendAssignments(items);
  if (failed.length > 0) console.error("assignment mail failed", failed);
  return NextResponse.json({ sent: sent.length, failed: failed.length });
}
