import { NextResponse } from "next/server";
import { runDailyNotifications } from "@/lib/notifications";

export const maxDuration = 60;

// Called once a day by Vercel Cron (vercel.json), which sends CRON_SECRET as a
// bearer token. The site has no login, so without the secret this refuses to
// run. `?dry=1` reports what would be sent, and sends and records nothing.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  return NextResponse.json({ dryRun, ...(await runDailyNotifications(dryRun)) });
}
