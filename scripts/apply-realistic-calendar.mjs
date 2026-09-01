// One-off: push the "Realistic Calendar" column H (Realistic Due Date) from
// Batumi_Traffic_Study_Project_Calendar.xlsx onto project 5 (Batumi Model
// Update). Deliverables and tasks share a name, so both sides get the same
// date — the same invariant syncDeliverablesFromTasks maintains.
//
//   node scripts/apply-realistic-calendar.mjs           # show the diff
//   node scripts/apply-realistic-calendar.mjs --write   # apply it
import { neon } from "@neondatabase/serverless";

process.loadEnvFile(".env.local");
const sql = neon(process.env.DATABASE_URL);

const PROJECT_ID = 5;
const WRITE = process.argv.includes("--write");

// Deliverable code -> realistic due date (column H). D0, D2.1 and D2.2 already
// match the portal and are omitted. O1 stays off the portal: it is an optional
// service, only delivered if the Employer requests it.
const DUE = {
  // M1 was set to 2026-08-06 from the sheet, then moved to 2026-08-13 on the
  // portal. The portal is the later word, so this script no longer touches it.
  Mx: "2027-06-17", // task only — Mx has no deliverable row
  "D5.1": "2026-11-17",
  D3: "2027-02-17",
  D4: "2027-03-17",
  D1: "2027-04-17",
  "D5.2": "2027-04-17",
  "D9.1": "2027-04-17",
  D8: "2027-05-17",
  D6: "2027-06-17",
  D7: "2027-06-17",
  "D9.2": "2027-06-17",
};

// Start dates the column H due dates do not settle on their own. D7's new due
// date lands ahead of its old start; the rest would otherwise collapse to a
// single day. All five run two months up to their deliverable.
const START = {
  D7: "2027-05-17",
  D4: "2027-01-17",
  "D9.1": "2027-02-17",
  D8: "2027-03-17",
  "D9.2": "2027-04-17",
};

const code = (name) => name.split(" — ")[0];

const [milestones, tasks] = await Promise.all([
  sql`SELECT id, name, due_date FROM milestones WHERE project_id = ${PROJECT_ID}`,
  sql`SELECT id, name, start_date, end_date FROM tasks WHERE project_id = ${PROJECT_ID}`,
]);

const edits = [];
for (const m of milestones) {
  const due = DUE[code(m.name)];
  if (due && m.due_date !== due) {
    edits.push({ kind: "deliverable", row: m, field: "due_date", from: m.due_date, to: due });
  }
}
for (const t of tasks) {
  const c = code(t.name);
  if (DUE[c] && t.end_date !== DUE[c]) {
    edits.push({ kind: "task", row: t, field: "end_date", from: t.end_date, to: DUE[c] });
  }
  if (START[c] && t.start_date !== START[c]) {
    edits.push({ kind: "task", row: t, field: "start_date", from: t.start_date, to: START[c] });
  }
}

for (const e of edits) {
  console.log(
    `${e.kind.padEnd(11)} ${String(e.row.id).padStart(3)}  ${e.field.padEnd(10)} ` +
      `${String(e.from ?? "—").padEnd(12)} -> ${e.to}  ${e.row.name}`
  );
}
console.log(`\n${edits.length} change(s)`);

// Codes in the sheet that the portal has no row for, so nothing silently drops.
const known = new Set([...milestones, ...tasks].map((r) => code(r.name)));
const missing = Object.keys(DUE).filter((c) => !known.has(c));
if (missing.length) console.log(`not on the portal: ${missing.join(", ")}`);

if (!WRITE) {
  console.log("\ndry run — re-run with --write to apply");
} else {
  await sql.transaction(
    edits.map((e) =>
      e.kind === "deliverable"
        ? sql`UPDATE milestones SET due_date = ${e.to} WHERE id = ${e.row.id}`
        : e.field === "end_date"
          ? sql`UPDATE tasks SET end_date = ${e.to} WHERE id = ${e.row.id}`
          : sql`UPDATE tasks SET start_date = ${e.to} WHERE id = ${e.row.id}`
    )
  );
  console.log("\napplied");
}
