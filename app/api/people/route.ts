import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Names only, for the assignee pickers. Addresses never leave the server: the
// site has no login. The table is empty, or missing on a database that has not
// been set up yet, and the pickers then just offer the names already in use.
export async function GET() {
  try {
    const rows = await query<{ first_name: string }>(
      "SELECT first_name FROM people ORDER BY first_name"
    );
    return NextResponse.json(rows.map((r) => r.first_name));
  } catch {
    return NextResponse.json([]);
  }
}
