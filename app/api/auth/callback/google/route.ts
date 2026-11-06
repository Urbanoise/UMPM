import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE, verifiedEmail } from "@/lib/googleAuth";
import {
  createSession,
  isPm,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from "@/lib/session";

function sameState(a: string | null, b: string | undefined) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(req: NextRequest) {
  const { origin, protocol, searchParams } = req.nextUrl;

  const finish = (outcome: "denied" | "failed" | null, session?: string) => {
    const res = NextResponse.redirect(
      outcome ? `${origin}/?signin=${outcome}` : `${origin}/`
    );
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth" });
    if (session) {
      res.cookies.set(SESSION_COOKIE, session, {
        httpOnly: true,
        sameSite: "lax",
        secure: protocol === "https:",
        path: "/",
        maxAge: SESSION_SECONDS,
      });
    }
    return res;
  };

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !sameState(state, req.cookies.get(STATE_COOKIE)?.value)) {
    return finish("failed");
  }

  let email: string | null;
  try {
    email = await verifiedEmail(code, origin);
  } catch {
    return finish("failed");
  }
  if (!email) return finish("failed");
  if (!isPm(email)) return finish("denied");

  const session = createSession(email);
  return session ? finish(null, session) : finish("failed");
}
