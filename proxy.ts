import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionEmail } from "@/lib/session";

// Guests may read everything and change nothing. This is the only check, and it
// denies by default, so a new write route is protected without doing anything.
// Sign-in itself is all GETs. Signing out has to work for a session that has just
// stopped being valid, and it only ever clears the caller's own cookie.
export function proxy(req: NextRequest) {
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    (req.method === "POST" && req.nextUrl.pathname === "/api/auth/logout")
  ) {
    return NextResponse.next();
  }
  if (sessionEmail(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  return NextResponse.json({ error: "sign in required" }, { status: 401 });
}

// Every path rather than just /api, so a write can't slip past on a path the
// pattern failed to anticipate.
export const config = {
  matcher: "/((?!_next/static|_next/image).*)",
};
