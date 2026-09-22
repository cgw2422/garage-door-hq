# Environments, releases and recovery

Three deployments, one of which holds real garage door companies' customers.
Everything here exists to keep the other two away from it.

```
  local              staging                          production
  ─────              ───────                          ──────────
  laptop /           staging.thegaragedoorhq.com         app.thegaragedoorhq.com
  Claude dev         test data only                   REAL CUSTOMERS

  own Postgres       own Postgres                     own Postgres
  local disk         own R2 bucket                    own R2 bucket
  no Stripe          Stripe TEST keys                 Stripe LIVE keys
  console email      email held back                  email sends
  APP_ENV=development  APP_ENV=staging                APP_ENV=production
```

**Staging never shares the production database.** Not a convention — separate
Railway services with separate `DATABASE_URL`s, and nothing in the repository
ever names a production host.

---

## 1. What the code does about it

One variable decides: `APP_ENV`, read in `src/lib/environment.ts`.

It **fails closed**. `APP_ENV` unset on a deployment means *staging*, not
production, because the two mistakes do not cost the same. A production
deployment that forgets the variable holds outbound email back and somebody
notices within the hour. A staging deployment mistaken for production emails
real homeowners about repairs that never happened, and nothing takes that back.
`/api/health` reports `environment.declared: false` when it was inferred.

What keys off it:

| Safeguard | Outside production | On production |
|---|---|---|
| Outbound email (`src/server/email/guard.ts`) | blocked, or redirected to one mailbox, or an allowlist — and subject-tagged `[GARAGE DOOR HQ STAGING]` | sent normally |
| Stripe live key (`sk_live_…`) | **refused** at the point the key is read | required |
| Demo installer, truncating seed | allowed | **refused** |
| Object storage keys | prefixed `staging/` | prefixed `production/` |
| UI | amber banner, amber icon, `— STAGING` in the title | nothing |

The email gate wraps the *driver*, not the send helper, so there is no path to
an outbound message that skips it.

### Staging email

Pick one. With neither set, staging sends nothing at all, which is the safe
default and usually what you want.

```bash
# Everything to one inbox, with the intended recipient named in the subject.
STAGING_EMAIL_REDIRECT_TO=you@yourdomain.com

# Or: only these addresses, everything else blocked.
STAGING_EMAIL_ALLOWLIST=you@yourdomain.com,@yourdomain.com
```

---

## 2. Railway setup

Three services, each with its own Postgres and its own variables.

### staging

- **Source**: this repository, branch `main`, auto-deploy **on**.
- **Database**: its own Railway Postgres.
- **Variables**:
  ```
  APP_ENV=staging
  APP_URL=https://staging.thegaragedoorhq.com
  NEXT_PUBLIC_APP_URL=https://staging.thegaragedoorhq.com
  AUTH_SECRET=<openssl rand -base64 32 — its own, not production's>
  DATABASE_URL=<Railway reference to the STAGING Postgres>
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_WEBHOOK_SECRET=whsec_...        # from a staging endpoint in Stripe
  R2_BUCKET=garagedoorhq-staging         # its own bucket
  STAGING_EMAIL_REDIRECT_TO=you@yourdomain.com
  ```

### production

- **Source**: this repository, branch **`production`**, auto-deploy **on**.
  Nothing pushes to that branch except the promotion workflow, so ordinary
  development never reaches customers.
- **Database**: its own Railway Postgres, with backups on (§5).
- **Variables**: the same names, production values, `APP_ENV=production`, and a
  **different** `AUTH_SECRET` — sharing one would make a staging session token
  valid on production.

### Both

- `DEMO_SEED_TOKEN` — set only while loading the demo, then remove. On
  production the demo installer refuses regardless.
- Do **not** set `AUTH_URL`. Auth.js treats it as authoritative for redirects,
  and a stale value sends people to a host that is not there.
- Do **not** set `ALLOW_LOCAL_APP_URL` on a deployment. It exists for a local
  production build.

### Custom domains

`staging.thegaragedoorhq.com` → staging service. `app.thegaragedoorhq.com` →
production service. Set `APP_URL` to match; a mismatch mails customers links to
the wrong host.

---

## 3. The release process

```
  code change
      ↓  push / merge to main
  CI: typecheck · lint · isolation · authorization · auth ·
      integrity · build · migration scan · dependency audit
      ↓  green
  staging deploys automatically
      ↓  you test it on your phone
  Actions → "Promote to production" → paste the commit, type PROMOTE
      ↓
  production branch moves to that exact commit
      ↓
  Railway deploys · prisma migrate deploy runs · health check
```

**Promoting.** GitHub → Actions → *Promote to production* → Run workflow.

- `commit` — the SHA you tested on staging. It is shown on every staging deploy
  in Railway, and `git log` has it.
- `confirm` — type `PROMOTE`.
- `allow_destructive_migration` — leave off unless the migration report flagged
  something and you have a fresh backup.

The workflow refuses a commit that is not an ancestor of `main`, refuses one
whose checks did not pass, re-runs the migration scan against what production is
actually about to receive, tags the release, moves the `production` branch, and
polls `/api/health` until production answers — asserting that it really is the
production environment, that `APP_ENV` was declared, that storage is R2 and that
email is configured.

To require a second pair of eyes: repository **Settings → Environments →
production → Required reviewers**. The workflow already targets that environment.

**A normal push cannot reach production.** CI runs, staging deploys, production
stays where it is.

---

## 4. Rolling back

GitHub → Actions → *Roll back production* → Run workflow.

- `tag` — a previous `release-…` tag. They are in the Releases tab and in the
  summary of every promotion.
- `confirm` — type `ROLLBACK`.

Production goes back to that commit and the health check runs. The summary
names any migrations the database is still carrying, because **a rollback does
not undo a migration**:

- **Additive migration** (new table, new nullable column, new enum value) — a
  clean rollback. The old code ignores what it does not know about.
- **Destructive migration** (dropped column, changed type) — the old code will
  look for something that is gone. Restore from a backup instead (§5).

This is why the promotion workflow makes you tick a box for a destructive
migration: it is the one change that cannot be undone by going backwards.

### If you cannot wait for a workflow

Railway → production service → **Deployments** → the last good one →
**Redeploy**. Same result, faster, no git. Then run the rollback workflow
afterwards so the `production` branch matches what is actually deployed.

---

## 5. Backups and recovery

### What Railway gives you

Railway Postgres supports scheduled backups per database. **Turn them on for
production before the first real customer.** Railway → production Postgres →
Backups → daily, retention as long as the plan allows.

Railway's backups are a starting point, not a strategy: they live in the same
account as the thing they protect. So also take an independent dump.

### Independent dump

```bash
# Anywhere with psql 16 and the production DATABASE_URL, off the Railway account.
pg_dump "$PRODUCTION_DATABASE_URL" --format=custom --no-owner --no-acl \
  --file="gdhq-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Run daily. Keep 30 days. Store somewhere that is not Railway and not the laptop
that holds the credentials — an R2 bucket in a different account, or S3 with
object lock so a compromised key cannot delete history.

### Restoring

**Never restore into the live database.** Restore beside it, check it, then cut
over.

```bash
# 1. New, empty database. Railway → New → Database → PostgreSQL.
# 2. Restore into it.
pg_restore --dbname "$RECOVERY_DATABASE_URL" --no-owner --no-acl --clean --if-exists \
  gdhq-20260915T030000Z.dump

# 3. Check it is really the data you want.
psql "$RECOVERY_DATABASE_URL" -c '
  SELECT (SELECT count(*) FROM "Organization")  AS orgs,
         (SELECT count(*) FROM "Customer")      AS customers,
         (SELECT count(*) FROM "Job")           AS jobs,
         (SELECT count(*) FROM "Invoice")       AS invoices,
         (SELECT max("createdAt") FROM "Job")   AS newest_job;'

# 4. Point production at it: change DATABASE_URL on the production service.
# 5. Redeploy. `prisma migrate deploy` brings the restored schema up to the
#    running code on boot.
# 6. node scripts/health-check.mjs https://app.thegaragedoorhq.com --expect production
```

Keep the damaged database. Do not delete it until the restore is confirmed —
it may hold rows written after the backup that have to be re-entered by hand.

### "A deployment corrupted production data" — what to actually do

1. **Stop the bleeding.** Roll back the application first (§4). Whatever is
   writing bad rows stops writing them.
2. **Find the moment.** The `AuditLog` table records who did what and when, and
   `EstimateVersion` holds a frozen snapshot of every signed document. Between
   them you can usually name the window without a restore.
3. **Decide the blast radius.** One company, or all of them?
   - **One company** — restore the dump into a *recovery* database (above) and
     copy that tenant's rows back with `organizationId` as the filter. Every
     table that matters carries it. Slower, but nobody else loses a day's work.
   - **All of them** — full cutover to the restored database, and everything
     written since the backup is gone. Say so, in writing, to every affected
     company, with the timestamp.
4. **Write it down.** What broke, what was lost, what was restored. A company
   whose invoice vanished will ask, and "we think" is not an answer.

### What is *not* in a database backup

Photos and signature images live in R2, not Postgres. Enable **object
versioning** on the production bucket so a delete is recoverable. A database
restore that references an object that was deleted gives a broken image, not an
error — the row will still be there.

### Restore drill

Do this once before beta and once a quarter. A backup nobody has restored is a
hypothesis.

```bash
pg_dump "$PRODUCTION_DATABASE_URL" --format=custom --no-owner --no-acl --file=drill.dump
pg_restore --dbname "$DRILL_DATABASE_URL" --no-owner --no-acl --clean --if-exists drill.dump
# then the row counts above, against both, and compare.
```

**Production data must not be restored into staging** unless it is sanitised
first — staging's email guard blocks outbound mail, but real names, addresses
and phone numbers still end up somewhere with weaker access control.

---

## 6. Migrations

Production runs `prisma migrate deploy` on boot (`npm start`). It applies
pending migrations in order and does nothing else — it never resets, never
invents a diff, never drops what the files do not tell it to.

Never run against production:

- `prisma migrate reset` — drops everything.
- `prisma db push` — makes the schema match `schema.prisma` by whatever means,
  including dropping a column.
- `npm run db:seed` — truncates every table. It refuses on `APP_ENV=production`.

Before a release:

```bash
npm run check:migrations                    # every migration
node scripts/check-migrations.mjs --only "$(git diff --name-only \
  origin/production...HEAD -- prisma/migrations | cut -d/ -f3 | sort -u | paste -sd,)"
```

CI runs this on every push and puts the report in the job summary. A
`DESTRUCTIVE` finding fails the check until it is explicitly acknowledged.

### Writing a migration that can be rolled back

Prefer two releases to one:

1. **Add**, deploy, backfill. New column nullable, code writes both old and new.
2. **Remove** the old column in a later release, once nothing reads it.

Between the two, a rollback is free. In one release, it is a restore.

---

## 7. Loading the demo

```bash
# Staging only — production refuses.
curl -X POST "https://staging.thegaragedoorhq.com/api/admin/seed-demo?replace=1" \
  -H "x-seed-token: $DEMO_SEED_TOKEN"
```

Remove `DEMO_SEED_TOKEN` afterwards. With it unset the route 404s.

---

## 8. Checking where you are

```bash
node scripts/health-check.mjs https://app.thegaragedoorhq.com --expect production
node scripts/health-check.mjs https://staging.thegaragedoorhq.com --expect staging
```

Or just look: staging has an amber bar across the top, an amber icon on the
home screen and `— STAGING` in the tab. Production has none of it.
