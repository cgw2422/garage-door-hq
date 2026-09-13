# Deploying Garage Door HQ

Written for Railway, because that is where this is going first. Nothing here is
Railway-specific except the variable-reference syntax.

## The two that bite first

### "There was a problem with the server configuration"

`/api/auth/callback/credentials` answering with

```json
{"message":"There was a problem with the server configuration. Check the server logs for more information."}
```

means **`AUTH_SECRET` is unset or empty**. Auth.js checks it before it does
anything else and refuses the whole request. Generate one with `openssl rand
-base64 32` and set it.

Two ways to get this wrong that look like setting nothing at all: an empty
value (`.env.example` ships `AUTH_SECRET=""` for you to fill in), and the v4
name `NEXTAUTH_SECRET`, which this version does not read.

The app now catches this before Auth.js does: sign-in returns you to the login
screen with a sentence naming the variable, and the logs carry one line saying
the same. `GET /api/health` reports it too.

### Signing in lands on localhost

Signing in on the deployed site and landing on
`localhost:3000/api/auth/callback/credentials` — "this site can't be reached" —
means `AUTH_URL` is set to a localhost address.

Auth.js treats `AUTH_URL` as authoritative for its own redirects. It does not
matter that the browser asked `https://your-app.up.railway.app`; if `AUTH_URL`
says `http://localhost:3000`, that is where sign-in sends the browser.

**Do not set `AUTH_URL` on a deployment.** The app sets `trustHost`, so the
origin is read from the request. `AUTH_URL` exists for local development, and
only when you are not on port 3000.

`NEXT_PUBLIC_APP_URL` is a different variable with a different job, and it
*must* be set. It builds every link that leaves the building: the estimate a
homeowner taps, the invitation a technician opens, the page Stripe returns to
after a payment. Left at localhost it does not crash anything — it emails
customers a link to their own machine — so `appBaseUrl()` refuses to build one
in production rather than send it.

One catch, worth knowing before it wastes an afternoon: `NEXT_PUBLIC_` values
are **inlined when the app is built**, server code included. Setting
`NEXT_PUBLIC_APP_URL` on a running deployment changes nothing until the next
build. Railway exposes service variables to the build, so setting it there and
redeploying is enough — but if you ever need to change the address without a
rebuild, set **`APP_URL`** instead. It is read at run time and takes
precedence.

## Variables

### Required

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — reference the Postgres service, don't paste the string |
| `AUTH_SECRET` | `openssl rand -base64 32` — not `NEXTAUTH_SECRET`, and not blank |
| `AUTH_TRUST_HOST` | `true` |
| `NEXT_PUBLIC_APP_URL` | the public address, e.g. `https://app.garagedoorhq.com` (baked at build time) |
| `APP_URL` | optional; the same address, read at run time, and wins over the baked one |
| `NEXT_PUBLIC_APP_NAME` | `Garage Door HQ` |

Do **not** set `PORT`; Railway injects it and `npm start` reads it. Do **not**
set `AUTH_URL`. Do **not** ever set `ALLOW_SEED_RESET` — it is the flag that
lets `db:seed` truncate every table in production.

### Storage — set before anyone takes a photo

Without `R2_*` the app falls back to local disk, and a container filesystem is
erased on every redeploy. Photos would disappear silently.

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

The bucket must be **private**: no public access, no `r2.dev` domain. Reads are
brokered by the app at `/api/files/photos/[id]` after an authorization check,
which is the whole point.

### Email — set before promising a customer anything

`RESEND_API_KEY` or `POSTMARK_SERVER_TOKEN`, plus `EMAIL_FROM_ADDRESS` and
`EMAIL_FROM_NAME`. The from-address domain must be verified (SPF/DKIM) with the
provider.

Without one of these the app logs messages instead of sending them and says so
on screen. It never records a message as delivered that was not.

### Stripe — set before charging anyone

`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_STANDARD`, `STRIPE_WEBHOOK_SECRET`, and
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

Point the Stripe webhook endpoint at `https://<your-domain>/api/webhooks/stripe`
and copy its signing secret into `STRIPE_WEBHOOK_SECRET`. The webhook is the
source of truth for subscription and payment state; a browser reaching a
success page is not, and is never treated as one.

Customer payments run on Stripe Connect Standard — each garage door company
connects its own Stripe account. See [PAYMENT-MODEL.md](PAYMENT-MODEL.md) for
why, and for who owns refunds, disputes and fees.

### Worth setting

`TRIAL_DAYS` (default 14), `PLATFORM_ADMIN_EMAIL`, `DEMO_PASSWORD`,
`EMAIL_SUPPORT_ADDRESS`.

## Migrations

`npm start` runs `prisma migrate deploy` before starting the server. Prisma
takes an advisory lock, so multiple replicas starting together are safe, and a
failed migration stops the container rather than serving against a schema it
does not have.

That means a container that will not start is often a migration that could not
run: check that `DATABASE_URL` resolves. `npm run start:local` skips the
migration step when you want the server without it.

## Checking a deployment

`GET /api/health` answers 200 when the deployment can work and 503 when it
cannot, with a body naming what is wrong:

```json
{
  "ok": false,
  "required": { "database": "ok", "authSecret": "missing", "appUrl": "ok" },
  "optional": { "storage": "local", "email": "not configured", "stripe": "not configured" }
}
```

It reports presence only — never a key, a URL or a value — and needs no
session, because the failure it exists to explain is one where nobody can sign
in. The three `required` checks decide `ok`; the `optional` ones are states the
product supports and says so on screen, so they never make it 503.

It also works as a platform health check.

## Loading the demo company

The demo company — Precision Garage Door Services, with a 39-item price book,
spring inventory, Door Passports with service history, jobs, a signed estimate
and an unpaid invoice — is useful for seeing the product with something in it.
It is a tenant like any other: it sees no other company's data, and other
companies never see it.

`npm run db:seed` is **not** the way to load it on a deployment. That one
truncates every table first, which is right for a laptop and the end of
someone's business anywhere else. Two safe paths share the same data and none
of that behaviour. Both refuse if the demo company is already there, and
neither ever deletes anything.

**Over HTTP**, which needs nothing installed:

1. Set `DEMO_SEED_TOKEN` to a long random string (24 characters minimum —
   `openssl rand -base64 32`) and let it redeploy.
2. `curl -X POST -H "x-seed-token: <the token>" https://<your-domain>/api/admin/seed-demo`
3. Unset `DEMO_SEED_TOKEN`.

With the variable unset or too short the route answers 404 to everything, so
it does not exist unless you decide it does. It is POST-only, so a link
preview or a crawler cannot fire it, and rate limited either way.

**From a terminal with the database reachable** (`railway run`, or `psql`
access): `npm run db:demo`. It is idempotent, so it is safe to leave in a start
command.

Sign in as `mike@precisiongaragedoor.test` with `DEMO_PASSWORD` (default
`GarageDoorHQ2026!` — set `DEMO_PASSWORD` before loading on anything public).
`tony@…` is the technician, so you can see the role difference.

## After the first deploy

1. Open `/api/health` and confirm `"ok": true`.
2. Open the site, sign up, and confirm you land on `/today` — not on localhost.
3. Send yourself an estimate and check the link in the email opens the portal.
4. Check `/settings/billing` reports the trial and its end date.
5. Trigger a test event from the Stripe dashboard and confirm it is recorded.
