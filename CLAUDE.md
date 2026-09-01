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
```

There is no test framework in this project. Verify changes by running `npm run dev`
and exercising the UI or the API (`curl http://localhost:3000/api/projects`).

`DATABASE_URL` must be set — locally in `.env.local` (copy `.env.example`), on
Vercel by the Neon integration. `ANTHROPIC_API_KEY` is needed only by the
contract upload route; everything else runs without it. `scripts/setup-db.mjs`
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
source of truth. Project reordering is the one optimistic update
(`Dashboard.reorder`).

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

**Tasks linked to deliverables.** A task and a milestone ("deliverable" in the
UI) with the same `name` inside the same project are one commitment shown twice.
The link is by name only — there is no foreign key. `lib/linked.ts` detects it
client-side; `syncDeliverablesFromTasks` / `syncTaskFromDeliverable` in
`lib/queries.ts` keep the dates in step server-side. Any route that writes
`tasks.end_date`, `tasks.name`, `milestones.due_date` or `milestones.name` must
call the matching sync helper afterwards (a rename can re-point the link, so
name changes trigger a re-sync too).

**API route conventions.** All handlers live under `app/api/`. PATCH bodies are
partial: a key that is `undefined` is left alone, a present-but-empty value
clears the column. `SET` clauses are built by whitelisting known keys and
positioning placeholders — follow that shape, never interpolate values. Routes
return `{ ok: true }`, `{ id }` (201 on create), or `{ error }` with 400/404.

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
share one name (that is what links them — see above); and dates must come back
as `YYYY-MM-DD` because that is how the whole app stores them. `normalize()` in
the same file then widens the project window to contain every extracted date,
which the Gantt assumes. The uploaded file is never persisted.

**Gantt.** `components/Gantt.tsx` is hand-written SVG with no chart library:
module constants at the top control geometry (`ROW_H`, `GUTTER`, …), a linear
`x(t)` maps epoch ms to pixels over an auto-computed date range, width comes
from a `ResizeObserver`, and the selected project expands to show its dated
tasks as sub-rows. It also implements pointer-based drag reordering that calls
back into `Dashboard.reorder`.

## Notes

- `data/` is gitignored (holds `seed.json`, the old `timelines.db`) — nothing
  there is available to a fresh clone.
- No authentication: anyone with the URL can read and edit. Deploys are on
  Vercel from `main`.
- Contract uploads are capped at 4 MB (`MAX_UPLOAD_BYTES`) because Vercel caps a
  serverless request body at ~4.5 MB, and the extract route sets
  `maxDuration = 300`, which Vercel clamps to 60s on a Hobby plan.
- `lib/presets.ts` mirrors a deliverables list from the separate STSPortal
  project (`STSPortal/src/ProposalPortal.jsx`) and is kept in sync by hand.
