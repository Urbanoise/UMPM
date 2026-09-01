# Project Timelines

Personal dashboard of all project timelines: start/end dates, milestones,
tasks and responsible people, drawn as a Gantt chart with a today line.

## Run

```bash
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

## Data

Stored in Postgres (Neon). The connection string comes from `DATABASE_URL` —
on Vercel it is injected by the Neon integration; locally, copy `.env.example`
to `.env.local` and paste the same value.

Create the tables once per database:

```bash
npm run db:setup            # schema only
npm run db:setup -- --seed  # schema + import data/seed.json
```

`data/seed.json` is the dump of the original local SQLite database, kept out of
git along with everything else in `data/`.

## Creating a project from a contract

**Upload contract** on the dashboard reads a signed agreement (PDF or Word
`.docx`, up to 4 MB) with Claude and proposes a project: dates, deliverables,
tasks and the assumptions it made. Nothing is saved until you have checked the
draft and pressed **Create project** — deadlines written as "within 30 days of
signature" are resolved against the contract's signing date, and that arithmetic
is worth verifying.

The uploaded file is read in memory and discarded; only the project you approve
is stored. Set `ANTHROPIC_API_KEY` in `.env.local` and in the Vercel project for
the button to work — the rest of the portal runs without it.

Scanned contracts work: Claude reads each PDF page as an image. Word files are
converted to plain text first, which loses table layout, so a `.docx` whose
schedule lives in a table is worth exporting to PDF instead.

## Deploying

The app is deployed on Vercel from the GitHub repo — every push to `main` ships.

1. Vercel → **Storage** → add a **Neon** Postgres database, connected to this
   project. That sets `DATABASE_URL` for all environments.
2. Run `npm run db:setup` against that database (locally, with the same
   `DATABASE_URL` in `.env.local`) to create the tables.

Note there is no authentication: anyone with the URL can read and edit.

## Stack

- Next.js (App Router) + React + Tailwind
- Neon serverless Postgres over HTTP (no connection pool to manage)
- Custom SVG Gantt — no chart library
- Claude (Opus 5) for reading uploaded contracts, via the Anthropic TypeScript SDK

## Structure

- `app/api/…` — CRUD route handlers for projects, milestones, tasks
- `lib/db.ts` — Postgres client + `query` / `queryOne` / `transaction` helpers
- `scripts/setup-db.mjs` — schema creation and one-off data import
- `components/Gantt.tsx` — the timeline chart
- `components/ProjectPanel.tsx` — per-project editing (milestones, tasks)
- `components/ProjectFormModal.tsx` — create/edit project form
- `lib/contract.ts` — the contract-reading prompt and its output schema
- `components/ContractUploadModal.tsx` — upload, then review the extracted draft
