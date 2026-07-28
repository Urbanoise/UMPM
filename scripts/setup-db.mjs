// Creates the Postgres schema, and optionally imports a dump of the old local
// SQLite database.
//
//   node scripts/setup-db.mjs           # schema only
//   node scripts/setup-db.mjs --seed    # schema + import data/seed.json
//
// Reads DATABASE_URL from the environment, falling back to .env.local.
// Safe to re-run: the schema is created IF NOT EXISTS, and seeding is skipped
// when the projects table already has rows.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — DATABASE_URL is expected to be in the environment already.
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (put it in .env.local)");
  process.exit(1);
}
const sql = neon(url);

await sql`
  CREATE TABLE IF NOT EXISTS projects (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'planned',
    responsible TEXT,
    color_slot  INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER,
    tentative   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS milestones (
    id         SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    due_date   TEXT NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS tasks (
    id         SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    start_date TEXT,
    end_date   TEXT,
    status     TEXT NOT NULL DEFAULT 'todo',
    assignee   TEXT
  )
`;
console.log("schema ready");

if (process.argv.includes("--seed")) {
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM projects`;
  if (count > 0) {
    console.log(`skipping seed — projects already has ${count} row(s)`);
  } else {
    const seed = JSON.parse(readFileSync("data/seed.json", "utf8"));
    for (const p of seed.projects) {
      await sql.query(
        `INSERT INTO projects (id, name, description, start_date, end_date, status, responsible, color_slot, sort_order, tentative, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          p.id,
          p.name,
          p.description,
          p.start_date,
          p.end_date,
          p.status,
          p.responsible,
          p.color_slot,
          p.sort_order,
          p.tentative,
          p.created_at,
        ]
      );
    }
    for (const m of seed.milestones) {
      await sql.query(
        "INSERT INTO milestones (id, project_id, name, due_date, done) VALUES ($1, $2, $3, $4, $5)",
        [m.id, m.project_id, m.name, m.due_date, m.done]
      );
    }
    for (const t of seed.tasks) {
      await sql.query(
        `INSERT INTO tasks (id, project_id, name, start_date, end_date, status, assignee)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [t.id, t.project_id, t.name, t.start_date, t.end_date, t.status, t.assignee]
      );
    }
    // Rows were inserted with their original ids, so the SERIAL sequences are
    // still at 1 and would collide on the next insert. Fast-forward them.
    for (const table of ["projects", "milestones", "tasks"]) {
      await sql.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'),
                       COALESCE((SELECT MAX(id) FROM ${table}), 1))`,
        [table]
      );
    }
    console.log(
      `seeded ${seed.projects.length} projects, ${seed.milestones.length} milestones, ${seed.tasks.length} tasks`
    );
  }
}
