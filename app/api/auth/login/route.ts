import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { googleAuthUrl, STATE_COOKIE, STATE_SECONDS } from "@/lib/googleAuth";

export async function GET(req: NextRequest) {
  const { origin, protocol } = req.nextUrl;
  const state = randomBytes(32).toString("base64url");
  const url = googleAuthUrl(origin, state);
  if (!url) return NextResponse.redirect(`${origin}/?signin=failed`);

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: protocol === "https:",
    path: "/api/auth",
    maxAge: STATE_SECONDS,
  });
  return res;
}
