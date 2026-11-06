import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionEmail } from "@/lib/session";

// Tells the dashboard whether to show editing controls. Only ever returns the
// caller's own address, and null to a guest.
export async function GET(req: NextRequest) {
  return NextResponse.json(
    { email: sessionEmail(req.cookies.get(SESSION_COOKIE)?.value) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
