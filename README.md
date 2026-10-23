# PEKİYİ Mobilya — Internal System

Internal web system replacing the export department's Excel workflow (customers, product
catalog, orders, proforma invoices, production sheets, loading control sheets, print labels).

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+ (`npm install -g pnpm` if you don't have it)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose
  plugin on Linux)

## 1. Clone and configure environment variables

```bash
git clone <this-repo-url> pekiyi
cd pekiyi
cp .env.example .env
```

Edit `.env` and set real values for:

- `POSTGRES_PASSWORD`
- `DATABASE_URL` — update the password/host/port to match if you changed the defaults above
- `BETTER_AUTH_SECRET` — generate with:

  ```bash
  openssl rand -base64 32
  ```

- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` — the first admin account,
  created by `pnpm db:seed`

Leave the other variables at their defaults for local development.

## 2. Install dependencies

From the repo root (this is a pnpm workspace containing the `web` app):

```bash
pnpm install
```

## 3. Start PostgreSQL

```bash
pnpm db:up
```

To stop it: `pnpm db:down` (data persists in a named Docker volume between restarts).

## 4. Apply the database schema

```bash
pnpm db:migrate
```

This runs the committed Drizzle migrations against the running Postgres instance (creates the
Better Auth tables — `user`, `session`, `account`, `verification` — plus every business table
added since).

## 5. Create the first admin user

```bash
pnpm db:seed
```

Reads `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` from `.env` and creates that
account with the `admin` role. Safe to run again — it does nothing if the account already exists.

This system has **no public self-registration**. Every other user is created by an admin from
inside the app (Phase 1 — users management page).

### Optional: seed test users (local development only)

Set `SEED_TEST_USERS=true` in `.env` (plus `SEED_EXPORT_EMAIL`/`PASSWORD`/`NAME` and
`SEED_PRODUCTION_EMAIL`/`PASSWORD`/`NAME`) before running `pnpm db:seed` to also create one
`export`-role user (`preferredLocale: ar`) and one `production`-role user (`preferredLocale: tr`).
Idempotent, like the admin seed — safe to run again.

## 6. Run the Next.js app

```bash
pnpm dev
```

The app is at **http://localhost:3000**, and will redirect to `/tr` (the default locale). Log in
at `http://localhost:3000/tr/login` with the admin account you just seeded.

## Everyday commands

| Command            | What it does                                                           |
| ------------------- | ----------------------------------------------------------------------- |
| `pnpm db:up`        | Start PostgreSQL                                                       |
| `pnpm db:down`      | Stop PostgreSQL (data is kept)                                         |
| `pnpm dev`          | Run the Next.js dev server                                             |
| `pnpm db:generate`  | Generate a Drizzle migration from `web/db/schema/` — run after editing it |
| `pnpm db:migrate`   | Apply committed migrations to the running database                     |
| `pnpm db:studio`    | Open Drizzle Studio against the running database                      |
| `pnpm db:seed`      | Create the first admin user from `SEED_ADMIN_*` env vars (idempotent)  |

## Schema workflow

Drizzle schema files under `web/db/schema/` (one file per domain, e.g. `auth.ts`) are the single
source of truth for the database structure. After changing a schema file:

```bash
pnpm db:generate   # writes a new migration file under web/db/migrations/
pnpm db:migrate    # applies it to the running database
```

Commit the generated migration file together with the schema change. Never run `drizzle-kit push`
against a real (shared/production) database — only the generated `migrate` workflow.
# pekiyi
