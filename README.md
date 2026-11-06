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

## Email notifications

People get an email about a new assignment once a PM approves it, and an automatic
reminder when a deadline is 3 working days away (weekends and Georgian public
holidays don't count). New assignments collect behind the **To send** button on the
dashboard, where a PM sends them or marks them not to be sent; they wait there until
someone does, and an assignment that is changed back disappears by itself. Several items for one person arrive as one email. Only a task's assignees
are emailed: unassigned tasks, deliverables with no linked task and tentative
projects send nothing, and confirming a tentative project sends no catch-up.

Names are matched against the staff directory. To change it, edit `Emails.xlsx`
and run `npm run people:import`. The workbook stays on this machine, because the
repository is public.

To switch it on:

1. Pick the Google Workspace mailbox that sends the mail (an existing one is
   fine; replies go to it), turn on 2-Step Verification for it, and create an
   app password.
2. Run `npm run db:setup`, then `npm run people:import`. Existing assignments
   are marked as already notified, so nobody receives a backlog.
3. In Vercel → Settings → Environment Variables, set `SMTP_USER`, `SMTP_PASS`,
   a long random `CRON_SECRET`, and `MAIL_TEST_TO` set to your own address. Then
   deploy.
4. Preview a run, which sends and records nothing:
   `curl -H "Authorization: Bearer $CRON_SECRET" "https://<site>/api/cron/notifications?dry=1"`
5. Assign yourself a task, press **To send**, and check the mail arrives. While
   `MAIL_TEST_TO` is set a sent item stays in the list, because nothing is recorded.
   Then remove `MAIL_TEST_TO` and redeploy.

The report lists `unknownPeople`: names on open tasks with no address.

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

## Sign-in

Anyone with the link can browse. Only project managers sign in, with Google, and
only they can change anything or send email.

1. In Google Cloud Console, from a Workspace account, create a project and set its
   OAuth audience to **Internal**.
2. Create a **Web application** client with these authorized redirect URIs:
   `https://<site>/api/auth/callback/google` and
   `http://localhost:3000/api/auth/callback/google`.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET` and `PM_EMAILS` in
   Vercel, and in `.env.local` to sign in locally. Without them the site is read-only.

To add or remove a project manager, edit `PM_EMAILS` in Vercel and redeploy. Real
addresses never go in the repository, because it is public.
