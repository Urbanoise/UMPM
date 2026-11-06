# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev                 # dev server on http://localhost:3000
npm run build               # production build (also the type check that matters)
npm start                   # serve the production build
npm run lint                # eslint (flat config, eslint-config-next)
npx tsc --noEmit            # type check on its own

npm run db:setup            # create the Postgres schema (idempotent)
npm run db:setup -- --seed  # schema + import data/seed.json (skipped if projects has rows)
npm run people:import       # load the staff directory from Emails.xlsx (gitignored)
```

There is no test framework in this project. Verify changes by running `npm run dev`
and exercising the UI or the API (`curl http://localhost:3000/api/projects`).

**There is no development database.** `DATABASE_URL` in `.env.local` is the same
Neon instance the deployed site uses, so anything written while testing locally
shows up on the real dashboard immediately. Give test rows obviously disposable
names, delete them in the same session, and re-read the project list afterwards
to confirm the cleanup rather than assuming it worked. Check what a destructive
query matches before running it.

`DATABASE_URL` must be set — locally in `.env.local` (copy `.env.example`), on
Vercel by the Neon integration. `ANTHROPIC_API_KEY` is needed only by the
contract upload route, and `SMTP_USER`, `SMTP_PASS` and `CRON_SECRET` only by email
notifications; everything else runs without them. `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `AUTH_SECRET` and `PM_EMAILS` are needed to sign in, and
without them the site runs read-only. `scripts/setup-db.mjs`
reads `.env.local` itself via `process.loadEnvFile`; Next.js loads it for the app.

## Architecture

Single-page dashboard: one Postgres-backed data model (projects → milestones +
tasks) rendered as a custom SVG Gantt chart plus analytics panels, with all
editing done through JSON API routes.

**Data flow.** `app/page.tsx` renders `components/Dashboard.tsx`, a client
component that is the single owner of state. It fetches `GET /api/projects`
once, holds the whole `Project[]` (each project with its `milestones` and
`tasks` nested), and passes slices to every panel. Every mutation is a `fetch`
to an API route followed by `refresh()` — a full re-fetch of `/api/projects`.
There is no client cache, no SWR/React Query, and no server-component data
loading; keep new features on this pattern rather than introducing a second
source of truth. The optimistic updates are project reordering (`Dashboard.reorder`) and everything
that goes through `Dashboard.commit`: drag results and status changes from the
board and list. A failed `commit` restores the previous state and shows a toast.

**Database layer.** `lib/db.ts` wraps `@neondatabase/serverless` (Postgres over
HTTP, no pool) and exposes `query` / `queryOne` / `transaction`; the client is
lazily created and cached on `globalThis` so importing the module during
`next build` never needs `DATABASE_URL`. Always use `$1, $2 …` placeholders.
`lib/queries.ts` holds the composite reads and the cross-table sync helpers.
`scripts/setup-db.mjs` is the only place the schema is defined — there are no
migrations, so a schema change means editing that file *and* applying the
change to existing databases by hand.

**Dates are TEXT.** `start_date` / `end_date` / `due_date` are `YYYY-MM-DD`
strings in Postgres and in TypeScript, which is why string comparison
(`end_date < start_date`) is used for validation and ordering. Booleans are
`INTEGER` 0/1 (`done`, `tentative`) — a legacy of the original SQLite database.
Parse with `parseDate` from `lib/dates.ts` (appends `T00:00:00` for local time),
never `new Date(str)` directly.

**Task notes.** `tasks.note` is free text, edited in `TaskFormModal` and shown by `TaskNote` in the project panel, board and list. The calendar, deadlines and work overview reach it by opening that form; the Gantt shows no notes. Notes stay out of the Gantt export, which can go to clients.

**Task categories.** `tasks.status` is TEXT: one of `TASK_STATUSES`, or `cat-<id>`
for a row of `task_categories` (`lib/types.ts`). Everything else is built on the
rule that any status other than `done` is open, so a custom category needs no
special handling in the completion, overdue or sync logic; `isStarted` in
`lib/taskStatus.ts` counts one as started for the Gantt fill and the overview.
Order, labels and colours come from that same file: categories sit between the
built-in open statuses and Done, oldest first, and take their colour from their id.
`AddCategoryForm` is the one way to create a category, behind both the Board and
List toolbar button and the Categories dialog; adding is not an undo step.
`Dashboard` reads them alongside the projects as one snapshot. Deleting a category
moves its tasks to `todo`; a deliverable with no task only ever offers `todo` and
`done`. Write statuses through `isTaskStatus`, not `TASK_STATUSES`, except in
contract import, which only uses the built-ins.

**Tasks linked to deliverables.** `milestones.task_id` makes a deliverable the
endpoint of a task, and the two are then one commitment shown twice, even with
different names. A task has at most one deliverable (unique index), most tasks
have none, and deleting the task leaves the deliverable unlinked. It is set from
the deliverable's row in the project panel, where linking moves the deliverable
to the task's end date. A task and deliverable created under one name link
themselves (`linkSameNamed`), which is how contract import links; a later rename
changes nothing. `lib/linked.ts` reads the link client-side; `syncDeliverablesFromTasks` / `syncTaskFromDeliverable` in
`lib/queries.ts` keep the dates and completion (task status `done` ⇔ milestone
`done = 1`) in step server-side. Any route that writes `tasks.end_date`,
`tasks.status`, `milestones.due_date`, `milestones.done` or `milestones.task_id`
must call the matching sync helper afterwards (`/api/restore` does too).

**API route conventions.** All handlers live under `app/api/`. PATCH bodies are
partial: a key that is `undefined` is left alone, a present-but-empty value
clears the column. `SET` clauses are built by whitelisting known keys and
positioning placeholders — follow that shape, never interpolate values. Routes
return `{ ok: true }`, `{ id }` (201 on create), or `{ error }` with 400/404.

**Email notifications.** `lib/notifications.ts` mails people about assignments
and about deadlines `REMINDER_WORKING_DAYS` working days away (`lib/workdays.ts`
holds Georgia's non-working days). Nothing reacts to individual edits: what is owed
comes from comparing the open work with the `notifications` table, which records
what went out per person and item, so bulk edits, contract import, undo and retries
need no special cases, and a moved deadline earns a new reminder because its row
includes the date. Assignments never mail by themselves, so that testing on the
dashboard reaches nobody: they wait in `OutboxModal` (`/api/notifications`) until a
PM sends or dismisses them, together or with a row's ✕, and one that is changed back
just leaves the list. A person gets one mail per project: Send takes along any
reminder owed on that person's project and records it, so the daily run doesn't
repeat it, but a reminder never starts a mail on Send. No
route that writes tasks should send mail. Reminders are automatic:
`/api/cron/notifications` runs daily from `vercel.json` (05:00 UTC, 09:00 in
Tbilisi) and takes `?dry=1` to report without sending or recording. Only a task's assignees are mailed, so
an unassigned task or a deliverable with no linked task mails nobody, and `responsible`
plays no part. A tentative project mails nobody either: the daily run records what it
would have sent, so confirming it sends no catch-up. Names missing from the directory
are in the run's report.

Assignees are free text, so `personFinder` in `lib/people.ts` matches them against
the `people` table in any spelling from the workbook, ignoring the Georgian
nominative `ი`, and an ambiguous name resolves to nobody. The repository is public:
real addresses belong in `people` and `Emails.xlsx` (gitignored), never in code or
in an API response; `/api/people` returns first names only. Sending needs
`SMTP_USER` and `SMTP_PASS`, which are set on Vercel and deliberately not in
`.env.local`, so local development mails nobody and records nothing even though it
shares the production database. `MAIL_TEST_TO` sends everything to one inbox and
records nothing. `db:setup` marks existing assignments as already notified when it
creates the table, in one transaction, so switching mail on sends no backlog.

**Access.** Guests read everything without logging in; only project managers sign
in, with Google, and there is one role. `proxy.ts` is the only enforcement: it
refuses every request that isn't a GET or HEAD unless it carries a valid session, so
a new write route is covered automatically, but **a GET must never change anything**.
The exceptions are signing out, and `/api/cron/notifications`, which is a GET behind
its own bearer token. `lib/session.ts` holds the HMAC-signed cookie, so there is no
session table, and fails closed without `AUTH_SECRET`. PMs are the `PM_EMAILS`
variable, not a column or a constant: the repository is public, it needs no schema
change, and it is read per request, so removing an address ends that session.
`lib/googleAuth.ts` runs the OAuth code flow. There is deliberately no auth library:
next-auth 5 is still in beta and doesn't accept this project's nodemailer version.

In the client, `useCanEdit` (`lib/access.ts`) decides which controls to show. It
defaults to false, and any new edit control must check it. That is presentation only.
Guests keep `TaskFormModal` with its fields locked, because it is the only place
several panels show a task's note.

**i18n and theme** are both client-side `useSyncExternalStore` stores backed by
`localStorage` with a custom window event to broadcast changes: `lib/i18n.tsx`
(`lang` key, Georgian `ka` is the default, `en` second) and `lib/theme.ts`
(`theme` key: unset follows the OS `prefers-color-scheme`, an explicit
`light`/`dark` overrides it, and the resolved value is mirrored onto
`<html data-theme>`). New UI strings go into the `STRINGS` map in
`lib/i18n.tsx` with both `ka` and `en` — `t()` is
typed against its keys, so a missing entry is a type error. Georgian month and
weekday names are hardcoded in `lib/dates.ts` because some browsers ship no
Georgian ICU data. `lib/useUiLang.ts` is a separate, narrower reader of
`<html lang>` used by components that only need `"ge" | "en"`.

**Styling.** Tailwind v4 (`@import "tailwindcss"` in `app/globals.css`, no
config file). Colours come from CSS custom properties defined on `:root` and
`:root[data-theme="dark"]` and exposed to Tailwind through `@theme inline`
(`text-ink-2`, `border-edge`, `bg-surface`, …). Chart and status colours are
read as raw vars (`var(--series-3)`, `var(--status-critical)`); the eight
`--series-N` slots are indexed by `projects.color_slot`. Reusable classes
`.card`, `.btn`, `.btn-primary`, `.btn-danger` are in `globals.css`. The palette
is the STS brand (red `#db4536`, amber `#f2a50a`, green `#099c57`).

**Contract import.** `lib/contract.ts` sends an uploaded agreement to Claude
(`claude-opus-5`, adaptive thinking, `effort: "high"`) and gets back a project
plan validated against a zod schema via `client.beta.messages.parse` +
`zodOutputFormat`. The Anthropic client is lazily cached on `globalThis` for the
same reason as the Postgres one. The flow is deliberately two-step and the split
matters: `POST /api/contracts/extract` reads the file and **writes nothing**,
returning a draft for the review modal; `POST /api/contracts/create` saves the
draft a human corrected, and re-validates it from scratch rather than trusting
it because Claude produced it. Read the `claude-api` skill before touching the
API call — the request shape has drifted (no `budget_tokens`, no prefill,
`output_config.format` not `output_format`).

Three things in the system prompt exist to satisfy constraints elsewhere in the
codebase, so keep them in step: undated deliverables must become tasks
(`milestones.due_date` is NOT NULL); a stage and the document it produces must
share one name (that is what links them on import — see above); and dates must come back
as `YYYY-MM-DD` because that is how the whole app stores them. `normalize()` in
the same file then widens the project window to contain every extracted date,
which the Gantt assumes. The uploaded file is never persisted.

**Gantt.** `components/Gantt.tsx` is hand-written SVG with no chart library:
module constants at the top control geometry (`ROW_H`, `BAR_H`, …), a linear
`x(t)` maps epoch ms to pixels over an auto-computed date range, width comes
from a `ResizeObserver`, and the selected project expands to show its dated
tasks as sub-rows, a linked task with the deliverable's diamond at its end, then one
sub-row per unlinked deliverable (the same rows as the export). It also implements pointer-based drag reordering that calls
back into `Dashboard.reorder`. The name and due date columns can be dragged wider
or narrower; `lib/ganttColumns.ts` remembers the widths per browser and clamps
them so the timeline always keeps some room.

**Views.** The first card on the dashboard renders Gantt, Board or List over the
same `timelineProjects`, so the project filter and "show past" apply to all of
them (the stat tiles follow the project filter too, but not "show past"); the choice is remembered per browser by `lib/viewMode.ts`. `BoardView`
holds tasks only, one column per status or category, because a deliverable has no in-progress
state. `ListView` groups tasks plus any deliverable with no matching task under
each status, the chosen sort applying inside each group, and
gives a linked pair the task's row. `CalendarView` is a permanent panel further
down, not one of the views; it follows the project filter but not "show past", and draws each item as a bar
over its start-to-end days (`calendarSpans` / `weekSegments` in
`lib/workItems.ts`), so a linked pair is the task there too, marked as a
deliverable, because only the task has a start date.

**Drag and drop.** Pointer events in the Gantt (it is SVG), HTML5 drag events
everywhere else. What a drag changes: Gantt bars move or resize dates, deliverable
diamonds move their date, calendar bars move by whole days, board cards change
status, list rows change status between groups, work-overview tasks change
assignee. Moving a task's deadline shifts its
start too, keeping its duration (`withDeadline`), and a deliverable linked to a
task moves through that task. Dragging a project bar calls
`POST /api/projects/[id]/shift`, which moves open tasks and deliverables with it
but leaves finished ones on their real dates, and asks first; dragging a project's
edge changes only the project's own dates. `lib/workItems.ts` holds these rules so
the Gantt's live preview, the optimistic update and the saved result agree. Rows
that are sorted automatically (order inside a board column or list group,
deadlines, project health) are
deliberately not draggable: there is no stored order for a drag to change.

**Undo.** Ctrl+Z / Ctrl+Y (and the header buttons) undo edits and deletes.
Saves go through `track` in `Dashboard`, which reads the projects and task
categories from the server before and after, and keeps the field-level difference (`lib/undo.ts`)
rather than an opposite action, because the server rules touch more than the
edited row. `POST /api/restore` writes those values back, row by row, only where
the row still holds what the edit left there, so a colleague's later change is
skipped and reported, never overwritten. A deleted row returns with its original
id, so older undo steps still apply to it; redoing a project delete is refused
while the project holds rows the edit doesn't know about, because the delete would
cascade to them. Saves and undos share one serial queue.
The keys match on `e.code` because a Georgian layout reports `ზ` for Z. Any new
edit must run inside `track` (through `commit`, or passed down as a prop) or it
silently can't be undone. Creating rows is not undoable, and the history is per
tab and lost on reload.

## Notes

- `data/` is gitignored (holds `seed.json`, the old `timelines.db`) — nothing
  there is available to a fresh clone.
- Anyone with the URL can read everything (see Access). Deploys are on Vercel from
  `main`.
- Contract uploads are capped at 4 MB (`MAX_UPLOAD_BYTES`) because Vercel caps a
  serverless request body at ~4.5 MB, and the extract route sets
  `maxDuration = 300`, which Vercel clamps to 60s on a Hobby plan. Measured
  extraction on one-page test contracts: 66s for Georgian `.docx`, 16s for
  English PDF — so the Hobby ceiling is a real risk on longer documents, and
  raising `effort` or the document length makes it worse.
- `lib/presets.ts` mirrors a deliverables list from the separate STSPortal
  project (`STSPortal/src/ProposalPortal.jsx`) and is kept in sync by hand.
