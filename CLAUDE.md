# PEKİYİ Mobilya — Internal Export System

## Purpose

Internal web system for PEKİYİ Mobilya, a sofa/sofabed furniture factory in Kayseri, Turkey,
used by the export department. It replaces the current Excel-based workflow.

Planned modules (built incrementally, one step at a time):

- Customers
- Product catalog
- Orders
- Proforma invoices
- Production (manufacturing) sheets
- Loading control sheets
- Print labels (barcode/QR)
- Customer file, payments, order status, dashboard
- Commercial invoice & packing list
- Leads CRM

Every document-producing module must support PDF and Excel export. Initial scale: 3 concurrent
users.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased build plan.

## Stack

- Package manager: pnpm (workspace with a single `web` package)
- Frontend: Next.js (App Router), TypeScript strict mode, Tailwind CSS, shadcn/ui
- i18n: next-intl, locales `tr` (default), `ar`, `en`, locale prefix always in the URL
- Backend: lives inside the Next.js app. PostgreSQL 16 via Docker Compose, Drizzle ORM +
  drizzle-kit (postgres-js driver), Better Auth for authentication
- Validation: zod, for every input to a server action or route handler

## Permanent conventions

- **All DB access happens only on the server** — server components, server actions, route
  handlers — never from a client component. The Drizzle client (`web/db/index.ts`) has a
  `server-only` guard.
- **Every server action and route handler**: validate input with zod → check auth/role with
  `requireUser()`/`requireRole(...)` (`web/lib/auth/session.ts`) → run the query. In that order.
- **Drizzle migrations are generated files committed to git.** Run `pnpm db:generate` after
  changing a schema file under `web/db/schema/`, commit the generated migration, then
  `pnpm db:migrate` to apply it. Never run `drizzle-kit push` against a real (shared/production)
  database — only `generate` + `migrate`.
- **Monetary values are stored as `numeric`/`decimal` columns, never `float`/`real`** — avoids
  floating-point rounding errors in prices, totals, and invoice amounts.
- **Optimistic locking for editable records (design now, implement starting Phase 3):** tables
  that users can edit concurrently (orders, proformas, etc.) get an integer `version` column.
  Updates are `UPDATE ... SET ..., version = version + 1 WHERE id = $1 AND version = $2`; a zero
  row count means someone else changed the record first — surface a "this record was changed by
  someone else" message in the UI rather than silently overwriting.
- **Audit log (design now, implement starting Phase 1):** a single `audit_log` table (`user_id`,
  `entity`, `entity_id`, `action`, `before` JSONB, `after` JSONB, `created_at`) written from one
  shared helper that every mutating server action calls — not ad hoc inserts scattered across
  actions.
- **File uploads:** stored on local disk under a configurable `UPLOAD_DIR`, behind the storage
  helper (`web/lib/storage`, one folder per kind: models, company, customers, orders), so the app
  can switch to S3-compatible storage later without touching callers. Delete replaced/removed
  images with `removeImages` / `settleImages` (`web/lib/uploads.ts`), which keep files an issued
  document still mentions; `pnpm files:cleanup` removes orphans.
- **No hardcoded UI strings.** Every visible string goes through next-intl, with translations
  added to `web/messages/tr.json`, `ar.json`, and `en.json` at the same time.
- **RTL-safe styling only, everywhere — including `web/components/ui/`.** Use Tailwind logical
  utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`, `border-s`,
  `border-e`, `rounded-s`, `rounded-e`). Never use physical-direction classes (`ml-`, `mr-`,
  `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `border-l`, `border-r`, `rounded-l`,
  `rounded-r`) anywhere in `web/`. `components.json` has `"rtl": true`, so the shadcn CLI
  generates components with logical classes already — **any newly added shadcn component must be
  added through this CLI (`pnpm dlx shadcn@latest add <name>`) with that setting in place**, not
  copy-pasted from upstream docs/examples. `pnpm lint` runs
  `web/scripts/check-logical-classes.mjs`, which fails the build if a physical-direction class
  shows up anywhere under `web/`.
  - One narrow, intentional exception the checker allows: components that accept an explicit
    literal `side` ("left" | "right") — `Sidebar`, `Sheet`, dropdown/tooltip positioners — use
    `left-`/`right-` utilities gated behind a `data-[side=left]:` / `data-[side=right]:` (or
    `group-data-[side=...]:`) modifier. That modifier selects on the literal side the component
    was told to render on (a geometry decision we make explicitly, e.g. `AppSidebar` picking
    `side="right"` for Arabic), not on reading direction, so it isn't a logical-class bug — it's
    what shadcn's own `--rtl` generator produces. Don't try to "fix" these.
- **Server Components by default.** Only add `"use client"` when a component needs interactivity,
  state, or browser APIs.
- **TypeScript strict; no `any`.** If a type is genuinely unknown, use `unknown` and narrow it.
- **Auth tokens never reach client JS.** The Better Auth session token lives only in an httpOnly
  cookie, set server-side via the `nextCookies()` plugin (`web/lib/auth/auth.ts`). `web/proxy.ts`
  only checks whether that cookie is *present* (fast, no DB hit); the real session check against
  the database happens in the protected layout (`web/app/[locale]/(app)/layout.tsx`) and in every
  server action/route handler via `requireUser()`/`requireRole()`.
- **Seeds are insert-only** (`ON CONFLICT DO NOTHING` by natural key). Never make a seed update
  existing rows — users edit seeded values in the app.
- **Production never receives price data.** Anything the production role can reach reads
  through `web/lib/orders/production-queries.ts` (explicit column lists, tested SQL).
- **Order rows keep their identity.** Order lines/pieces/fabrics are saved by diff
  (`syncOrderLines` in `web/lib/orders/persist.ts`), never delete + re-insert: other tables
  (loading ticks) will reference them.
- **Issued documents are immutable.** `document_issues` rows are only ever inserted (a DB trigger
  refuses updates of the frozen columns and deletes); a change to the order means a new revision.
- **Money/rate/CBM math uses `web/lib/domain/decimal.ts`** (decimal.js), never JS numbers.
- **Phones are stored in E.164** (`normalizePhone` in `web/lib/domain/phone.ts`, read in the
  customer's country) and shown with `formatPhone`. **Search and duplicate checks fold Turkish
  letters** (`web/lib/domain/text-fold.ts`; the SQL side uses the same `FOLD_FROM`/`FOLD_TO`).
- **Documents are rendered from one view model.** A document's PDF and Excel both come from the
  view model built from the frozen snapshot (or, for a draft, the snapshot built the same way from
  the live order); renderers decide layout, never content. Document labels live in
  `web/messages/documents/*.json`, not in the UI messages. Fonts are bundled
  (`web/lib/documents/fonts`) and embedded — rendering never touches the network.
- **Countries are ISO-2 codes; names come from `Intl.DisplayNames`** in the UI language, flags
  from `/api/flags/<code>` (SVG — Windows can't render flag emoji). Never store country names.
- **Every step adds/updates e2e tests in `web/e2e/` and must pass `pnpm check`** (lint + tsc +
  unit + e2e) before it is done. See "Tests" below.
- **Never run browser tests (or any test) against the dev database** (`DATABASE_URL`). Tests use
  `DATABASE_URL_TEST` only, and the e2e run starts its own server — no throwaway Playwright
  scripts in temp folders against `pnpm dev`.
- Each step of work ends with a git commit.

## Tests

- `pnpm test` — vitest unit tests (`*.test.ts` next to the code). DB-backed ones use
  `DATABASE_URL_TEST` (created + migrated by `web/test/vitest-global-setup.ts`) and roll back.
- `pnpm test:e2e` — Playwright (`web/e2e/*.spec.ts`), installed Chrome (`channel: "chrome"`, no
  browser downloads). `web/e2e/global-setup.ts` creates/wipes `pekiyi_test`, migrates, seeds it
  with `SEED_FIXTURES=true SEED_TEST_USERS=true` and the fixed accounts in
  `web/e2e/support/accounts.ts`, builds the app into `web/.next-e2e` (so it never clashes with
  `pnpm dev`), starts it on **port 3100** and stops it afterwards. If 3100 is taken the run fails
  instead of killing anything. `E2E_SKIP_BUILD=1` reuses the last build when only tests changed.
- Specs share one seeded DB and run serially; give created records unique names
  (`uniqueSuffix()`). Every spec fails on React hydration errors (auto fixture).
- `pnpm check` — lint + `tsc --noEmit` + unit + e2e. Must be green at the end of every step.

## Safety

- **Never kill, stop, or restart processes you did not start yourself in the current session.**
  If a port you need is already in use, tell the user and ask what to do — do not assume it's
  safe to free it up.
- **Never modify or delete anything outside this repository.**
- **Never leave background services you started (databases, test servers, etc.) running after
  you finish.** Stop them yourself and tell the user you did.

## Project layout

```
/
├── docker-compose.yml        PostgreSQL 16
├── .env.example              documents every required env var
├── web/                      Next.js app
│   ├── app/[locale]/         routes, locale-prefixed; (app) group is the authenticated shell
│   │   └── api/auth/[...all]/route.ts   Better Auth HTTP handler
│   ├── db/
│   │   ├── schema/           Drizzle schema, one file per domain; index.ts re-exports
│   │   ├── migrations/       generated migrations, committed to git
│   │   ├── index.ts          server-only Drizzle client
│   │   ├── seed.ts           first admin user + reference data (+ fixtures), insert-only
│   │   ├── seed/             seed modules (JSON loader, reference data, fixtures, label templates)
│   │   ├── seed-data/        pekiyi-seed-data.json, extracted from the real Excel files
│   │   └── seed-check.ts     proves re-seeding never overwrites app edits
│   ├── drizzle.config.ts
│   ├── i18n/                 next-intl routing/navigation/request config
│   ├── lib/auth/             Better Auth config, session/role helpers (requireUser, requireRole)
│   ├── lib/domain/           pure business functions (totals, pricing, numbering…), no DB
│   ├── lib/orders/           order data access: persist.ts (numbering + one-unit save by diff),
│   │                         queries, editor.ts (grid state ↔ payload/domain), audit-diff,
│   │                         price-guard, custom-columns, issue.ts (proforma snapshot/fingerprint),
│   │                         history.ts; production-queries.ts is the price-free path
│   ├── lib/customers/        customer queries, form options, client-safe constants
│   ├── lib/documents/        generated documents: languages/file names, formatting + labels
│   │                         (messages/documents/*.json), Chromium PDF service (pdf.ts), bundled
│   │                         fonts; proforma/: snapshot parser, view-model.ts (the one function both
│   │                         outputs use), html.ts (PDF template), excel.ts, service.ts (cached
│   │                         issued files, draft preview)
│   ├── actions/              server actions (login/logout, future mutations)
│   ├── components/           shared UI; components/ui/ is shadcn-generated
│   ├── messages/             tr.json, ar.json, en.json (UI); documents/{tr,en,ar}.json (document labels)
│   ├── scripts/              check-logical-classes.mjs (RTL class lint, run by `pnpm lint`),
│   │                         files-cleanup.ts (`pnpm files:cleanup`)
│   ├── e2e/                  Playwright specs, global setup (test DB + server on :3100), support/
│   ├── test/                 test-DB helpers shared by vitest and Playwright
│   └── proxy.ts              locale negotiation + fast session-cookie presence check
├── docs/ROADMAP.md, docs/DOMAIN.md
└── README.md
```

## Useful commands

- `pnpm db:up` / `pnpm db:down` — start/stop PostgreSQL via Docker Compose
- `pnpm db:generate` — generate a Drizzle migration from `web/db/schema/`, after editing it
- `pnpm db:migrate` — apply committed migrations to the running Postgres instance
- `pnpm db:studio` — open Drizzle Studio against the running database
- `pnpm db:seed` — create the first admin user from `SEED_ADMIN_*` env vars and insert missing
  reference data; `SEED_FIXTURES=true` adds the sample customers/orders. Insert-only, never
  overwrites
- `pnpm db:seed:check` — re-seeds over edited values and asserts nothing was overwritten (runs
  against `DATABASE_URL_TEST`, never the dev database)
- `pnpm files:cleanup` — list uploads nothing references (older than 24 h); `--apply` deletes them
- `pnpm dev` — run the Next.js dev server (`web/`)
- `pnpm test` / `pnpm test:e2e` / `pnpm check` — unit / browser / everything (see "Tests")
