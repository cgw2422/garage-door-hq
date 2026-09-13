# Deploying Garage Door HQ

Written for Railway, because that is where this is going first. Nothing here is
Railway-specific except the variable-reference syntax.

## The one that bites first

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
in production rather than send it. It is a `NEXT_PUBLIC_` variable, so it is
read at build time as well as run time: set it before the build, and redeploy
after changing it.

## Variables

### Required

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — reference the Postgres service, don't paste the string |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | `true` |
| `NEXT_PUBLIC_APP_URL` | the public address, e.g. `https://app.garagedoorhq.com` |
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

## After the first deploy

1. Open the site, sign up, and confirm you land on `/today` — not on localhost.
2. Send yourself an estimate and check the link in the email opens the portal.
3. Check `/settings/billing` reports the trial and its end date.
4. Trigger a test event from the Stripe dashboard and confirm it is recorded.
