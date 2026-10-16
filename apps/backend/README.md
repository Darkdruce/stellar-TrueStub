# Backend

Node/TypeScript backend for the ticket-resale platform.

## Running with docker-compose

The root `docker-compose.yml` builds this app (`apps/backend/Dockerfile`) as the
`backend` service alongside Postgres and Hasura:

```bash
cp .env.example .env   # at the repo root
yarn docker:up
curl http://localhost:4000/health   # → {"status":"ok","service":"truestub-backend"}
```

Every variable validated by `src/config/env.ts` is passed through by the
compose file. Empty values are treated as unset.

| Variable | Required | Notes |
| --- | --- | --- |
| `HASURA_GRAPHQL_ADMIN_SECRET` | yes | Shared with the `hasura` service. |
| `FIREBASE_ADMIN_PROJECT_ID` / `_CLIENT_EMAIL` / `_PRIVATE_KEY` | yes | Env validation fails without them; auth-protected routes (`/api/refunds`, `/api/transfers`, `/api/disputes`, `/api/saved-searches`, …) 401 every request without a real service-account key. |
| `DATABASE_URL`, `HASURA_GRAPHQL_URL` | set by compose | Point at the in-network `postgres` / `hasura` services. |
| `TRUSTLESS_WORK_API_KEY`, `TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET` | no | Refund execution and dispute resolution return 503 until set. |
| `TRUSTLESS_WORK_WEBHOOK_SECRET` | no | `POST /webhooks/escrow-status` rejects every delivery until set. |
| `TRUSTLESS_WORK_API_URL`, `STELLAR_NETWORK` | no | Default to testnet. |
| `SENTRY_DSN`, `CRITICAL_ALERT_WEBHOOK_URL` | no | Error tracking / refund-transfer failure alerts. |
| `CORS_ORIGINS`, `LOG_LEVEL`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | no | Defaults: `http://localhost:3000`, `info`, `900000`, `100`. |
| `EMAIL_PROVIDER`, `SENDGRID_API_KEY`, `NOTIFICATION_FROM_EMAIL` | no | Notification delivery. |

When a new required variable is added to `src/config/env.ts`, add it to the
`backend` service in `docker-compose.yml`, the root `.env.example`, and this
table.

## Database migrations

Migrations live in `src/db/migrations/` and are applied in filename order.

### Coordinating migration numbers across concurrent branches

Migration files are numbered sequentially (`001_…`, `002_…`, `003_…`). Because
the number is chosen by hand at authoring time, two branches opened around the
same time can independently pick the same "next" number — this is how the
duplicate `002` migration incident happened. The pre-commit hook and the CI
`--check-order` check catch the collision, but only after the fact, so the
process below exists to make collisions rare in the first place. With several
PRs in flight at once, assume someone else is picking a number right now.

#### Before opening a PR

1. **Refresh `main` and read the latest migration number.** Immediately before
   opening the PR (not when you started the branch):

   ```bash
   git fetch origin main
   git ls-tree --name-only origin/main src/db/migrations/ | sort | tail -n 5
   ```

   The highest number in that listing is the last one merged.
2. **Search open PRs for in-flight migrations.** A number that is not yet on
   `main` is still taken if another open PR claims it:

   ```bash
   gh pr list --state open --json number,title,files \
     --jq '.[] | select(.files[].path | startswith("apps/backend/src/db/migrations/"))'
   ```

   (Or browse the open PRs and check their changed files.) Collect every
   migration number claimed by an open PR.
3. **Pick the next free number** — one greater than the highest number found in
   steps 1 and 2, not merely one greater than what is on `main`. Zero-pad to
   three digits (`004_…`) so filename ordering stays correct.
4. **State the chosen number in the PR description**, e.g. "Adds migration
   `004_add_refund_status`; `003` is the latest on `main` and no open PR claims
   `004`." This makes the claim visible to the next contributor and lets a
   reviewer spot a collision before CI does.

#### If a collision is discovered

Do not renumber by editing the file in place on top of a stale base. Instead:

1. Rebase the branch onto the latest `main` (`git fetch origin main && git
   rebase origin/main`).
2. Rename the migration file to the next free number, using `git mv` so the
   rename is recorded, and update any references to the old filename (tests,
   docs, seed scripts).
3. Re-run the migration locally to confirm it still applies cleanly in the new
   position, then push and note the renumbering in the PR description.

The pre-commit hook rejects duplicate numbers locally, and CI runs the
migrations with `--check-order` to reject out-of-order or duplicate files. Treat
both as backstops: they will stop a bad merge, but they cannot stop two
contributors from wasting a review cycle on the same number.

### SafeTrust-era `hotels` rows (migration `002_rename_hotels_to_events.sql`)

Databases carried over from SafeTrust may contain a `public.hotels` table. The
migration renames it in place to `events` so existing rows survive. A rename
alone does **not** guarantee that the carried-over rows are meaningful in the
ticket-resale domain — hospitality-shaped rows renamed into an events table are
not automatically valid ticket-resale events.

#### Confirming whether legacy data exists

Run the following against each environment before/after applying the migration.
A fresh database (no SafeTrust history) returns zero rows and needs no further
action.

```sql
-- Pre-migration: does a legacy hotels table with real rows exist?
SELECT count(*) AS legacy_hotels_rows
FROM public.hotels;

-- Post-migration: how many rows came from the rename?
SELECT count(*) AS renamed_event_rows
FROM public.events;
```

If `legacy_hotels_rows` is `0` (or the `hotels` table does not exist), the
environment is fresh: there is nothing to verify or backfill.

#### Verification pass for environments with legacy rows

When legacy rows are present, verify that the renamed rows carry sensible
values for the ticket-resale domain rather than leftover hospitality data.
The checks below flag rows that look like hospitality records masquerading as
events. Any row returned by these queries must be reviewed (and either
backfilled or removed) before the environment is considered migrated.

```sql
-- 1. Rows missing the fields the ticket-resale domain requires.
SELECT id
FROM public.events
WHERE name IS NULL
   OR starts_at IS NULL
   OR venue IS NULL;

-- 2. Hospitality-shaped leftovers: rows whose name/description still read
--    like hotel inventory rather than a ticketed event.
SELECT id, name
FROM public.events
WHERE name ILIKE '%hotel%'
   OR name ILIKE '%room%'
   OR name ILIKE '%night stay%'
   OR name ILIKE '%check-in%';

-- 3. Rows with no ticket-resale signal at all (no price and no capacity).
SELECT id, name
FROM public.events
WHERE price IS NULL
  AND capacity IS NULL;
```

#### Backfill / remediation

- Rows that fail check 1 should be backfilled with the correct ticket-resale
  values, or deleted if they cannot be mapped to a real event.
- Rows that fail checks 2 or 3 are almost certainly SafeTrust hospitality data.
  They should be removed from `events` (or archived) rather than left in place,
  since they would otherwise surface as invalid events.
- Record the outcome of this pass (counts before/after) in the migration PR so
  the verification is documented for the environment it was run against.

If no environment reports legacy rows, document that finding here and no
backfill is required.
