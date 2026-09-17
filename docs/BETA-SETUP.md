# Setting up the private beta

Everything that has to happen **outside this repository**, in order, with the
exact clicks where I know them.

Nothing here asks you to paste a secret into a chat, a file or a commit. Every
secret goes straight from the service that issued it into a Railway variable,
and nowhere else.

**Rough time:** 3–4 hours across two sittings, plus a day of waiting for DNS
and Stripe verification.

**Before you start, have:** a Railway account, a Cloudflare account, a Stripe
account, and control of the DNS for `garagedoorhq.com`.

---

## The order that avoids rework

1. Domains (DNS is slow — start it first) → §11
2. Railway staging service + database → §1, §3
3. Cloudflare R2 staging bucket → §6
4. Email provider + domain verification → §7
5. Deploy staging, check `/admin/system` → §13
6. Railway production service + database → §2, §3
7. R2 production bucket → §6
8. Stripe product, price, webhooks, Connect → §8, §9, §10
9. Production backups → §4
10. Restore test → §5
11. Work `docs/PRIVATE-BETA-CHECKLIST.md`

---

## 1. Railway — staging service

1. Railway → **New Project** → name it `garage-door-hq`.
2. **New** → **GitHub Repo** → `cgw2422/garage-door-hq`.
3. The service appears. **Settings** → rename to `staging`.
4. **Settings → Source**: branch `main`, **Auto Deploy ON**. This is the branch
   ordinary development merges into; every merge redeploys staging and nothing
   else.
5. **Settings → Build**: leave the Nixpacks default. `npm run build` and
   `npm start` are both in `package.json`; `npm start` runs
   `prisma migrate deploy` before starting, which is what applies migrations.
6. **Settings → Networking → Generate Domain** for now. The custom domain comes
   in §11.

Do not set variables yet — the database in §3 provides one of them.

---

## 2. Railway — production service

Same project, second service, so they share nothing but a name.

1. **New** → **GitHub Repo** → the same repository.
2. **Settings** → rename to `production`.
3. **Settings → Source**: branch **`production`**, **Auto Deploy ON**.

   This is the whole deployment-safety story. Nothing writes to that branch
   except the *Promote to production* workflow, so merging to `main` deploys
   staging and leaves customers alone.

   The branch does not exist yet. Create it once, from a commit you have tested:
   GitHub → **Branches** → **New branch** → name `production`, from `main`.
   After that, only the workflow moves it.
4. **Settings → Networking → Generate Domain** for now.

### Require a second look before production deploys (recommended)

GitHub → repository **Settings → Environments → New environment** → name it
`production` → tick **Required reviewers** → add yourself. The promotion
workflow already targets that environment, so it will now pause for approval.

---

## 3. Two PostgreSQL databases

**They must be separate.** This is the one item on this page with no acceptable
shortcut.

For each service:

1. Railway project → **New** → **Database** → **Add PostgreSQL**.
2. Rename them `staging-db` and `production-db` so a glance tells them apart.
3. On the **staging** service → **Variables** → **New Variable** →
   **Add Reference** → `staging-db` → `DATABASE_URL`.
4. On the **production** service → the same, referencing `production-db`.

Using Railway's reference syntax rather than pasting the URL means the
credential never exists in your clipboard, your notes or this repository.

**Check it:** open `/admin/system` on each once deployed. The Database row says
how many companies it holds. If staging and production report the same count
after you have created a company on only one of them, they are the same
database — stop and fix that before anything else.

---

## 4. Production database backups

Railway → **production-db** → **Backups**.

1. **Enable scheduled backups.**
2. Daily. Retention as long as your plan allows (30 days if offered).
3. Note the schedule; you will record it in a variable in §12.

Railway's backups live in the same account as the thing they protect, so also
take one independent copy:

```bash
# From your own machine, with the production DATABASE_URL in your shell —
# not in a file, not in this repo.
pg_dump "$PRODUCTION_DATABASE_URL" --format=custom --no-owner --no-acl \
  --file="gdhq-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Put that dump somewhere that is **not Railway** — an R2 bucket in a different
Cloudflare account, or S3 with object lock. Weekly is enough alongside
Railway's daily.

---

## 5. Restore test — the one people skip

A backup nobody has restored is a hypothesis. Do this once now and once a
quarter.

1. Railway → **New → Database → Add PostgreSQL**. Call it `restore-test`.
2. Copy its connection string into your shell as `RECOVERY_DATABASE_URL`.
3. Restore the dump from §4 into it:

   ```bash
   pg_restore --dbname "$RECOVERY_DATABASE_URL" --no-owner --no-acl \
     --clean --if-exists gdhq-20260917T030000Z.dump
   ```

4. Prove it is the data you expect:

   ```bash
   psql "$RECOVERY_DATABASE_URL" -c '
     SELECT (SELECT count(*) FROM "Organization") AS orgs,
            (SELECT count(*) FROM "Customer")     AS customers,
            (SELECT count(*) FROM "Job")          AS jobs,
            (SELECT count(*) FROM "Invoice")      AS invoices,
            (SELECT max("createdAt") FROM "Job")  AS newest_job;'
   ```

   Compare against the same query on production. They should match except for
   anything written since the dump.

5. **Delete `restore-test`** when you are satisfied.
6. Record the date in `BACKUP_LAST_VERIFIED_RESTORE` (§12). `/admin/system`
   turns the Backups row green only when both that and `BACKUP_SCHEDULE` are
   set, and asks for another after about four months.

**Never restore production data into staging** unless it is sanitised first.
Staging's email guard stops outbound mail, but real names, addresses and phone
numbers would still be sitting somewhere with weaker access control.

---

## 6. Cloudflare R2 — two buckets

1. Cloudflare dashboard → **R2** → **Create bucket** → `gdhq-staging`.
2. **Create bucket** → `gdhq-production`.
3. Leave both **private**. There is no public access setting to turn on; the
   application brokers every read through `/api/files/...` and hands out
   120-second presigned URLs.
4. **R2 → Manage R2 API Tokens → Create API Token**:
   - Permissions: **Object Read & Write**
   - Specify bucket: `gdhq-staging`
   - Create, then copy the **Access Key ID** and **Secret Access Key**
     **straight into the Railway staging variables** (§12). The secret is shown
     once.
5. Repeat with a **separate token** scoped to `gdhq-production`, into the
   production variables. Two tokens, not one — a staging leak must not reach
   production objects.
6. **Enable versioning on `gdhq-production`**: bucket → **Settings** →
   **Object versioning** → enable. A database restore that points at a deleted
   object gives a broken image, not an error, and versioning is what makes that
   recoverable.
7. Your **Account ID** is in the R2 sidebar. The endpoint is
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

---

## 7. Email provider and domain

Resend is the simpler of the two the application supports.

1. [resend.com](https://resend.com) → **Domains** → **Add Domain** →
   `garagedoorhq.com`.
2. Resend shows DNS records — an MX and two or three TXT (SPF, DKIM, and a
   DMARC suggestion). Add every one at your DNS provider.
3. Wait for **Verified**. Usually minutes, sometimes hours.
4. **API Keys → Create API Key**:
   - One for staging, permission **Sending access**.
   - One for production, the same.
   - Copy each straight into the matching Railway variable.
5. Decide the from-address. `no-reply@garagedoorhq.com` is conventional.
   Garage door companies' own messages go out from this address wearing *their*
   name and with their address as reply-to, which is how a small company sends
   branded mail without setting up its own domain.

**Deliverability, worth the ten minutes:** add a DMARC record —
`_dmarc.garagedoorhq.com TXT "v=DMARC1; p=none; rua=mailto:you@garagedoorhq.com"`.
Start at `p=none`, watch the reports, tighten later.

---

## 8. Stripe — the $39.99 product

1. Stripe dashboard. **Check the Test/Live toggle before every step below.**
2. **Live mode** → **Product catalogue** → **Add product**:
   - Name: `Garage Door HQ`
   - Description: `Everything, one price. Unlimited doors, customers, jobs and estimates.`
   - Pricing: **Recurring**, **$39.99**, **Monthly**, USD
   - Save.
3. Open the price → copy the **Price ID** (`price_...`) → production variables
   as `STRIPE_PRICE_ID_STANDARD`.
4. **Test mode** → repeat the whole thing → that price id goes in the **staging**
   variables. Different ids; do not mix them.
5. **Developers → API keys**:
   - Live **Secret key** (`sk_live_...`) → production only.
   - Test **Secret key** (`sk_test_...`) → staging only.
   - The **Publishable key** is public by design and goes in
     `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

   The application **refuses to start with a live key outside production**, so a
   mix-up in this direction fails loudly rather than charging somebody.

---

## 9. Stripe webhooks

Two endpoints, one per environment. Without these, someone can pay and their
account never activates.

1. **Developers → Webhooks → Add endpoint**.
2. **Production** (live mode):
   - URL: `https://app.garagedoorhq.com/api/webhooks/stripe`
   - Events:
     ```
     checkout.session.completed
     customer.subscription.created
     customer.subscription.updated
     customer.subscription.deleted
     customer.subscription.paused
     customer.subscription.resumed
     invoice.paid
     invoice.payment_failed
     invoice.payment_succeeded
     payment_intent.succeeded
     charge.refunded
     account.updated
     ```
   - Add endpoint → reveal the **Signing secret** (`whsec_...`) → production
     variable `STRIPE_WEBHOOK_SECRET`.
3. **Staging** (test mode): the same events, URL
   `https://staging.garagedoorhq.com/api/webhooks/stripe`, its own signing
   secret into the staging variable.

The endpoint verifies that signature over the exact request bytes before
parsing anything, and records every event id under a unique constraint, so a
replay or a retry does nothing twice.

**Check it:** Stripe → the endpoint → **Send test webhook**. You should see a
200. A 503 means `STRIPE_WEBHOOK_SECRET` is not set.

---

## 10. Stripe Connect — how garage door companies get paid

This is how a homeowner's invoice payment reaches the garage door company's own
bank account rather than yours. See `docs/PAYMENT-MODEL.md` for why it is built
this way.

1. **Connect → Get started** → choose **Standard** accounts.
2. **Connect → Settings**:
   - Fill in your business details, support email and a statement descriptor.
     Connected companies see these during onboarding.
   - **Branding**: your logo and colour, so a technician recognises the flow.
   - **Redirects**: add `https://app.garagedoorhq.com/settings/payments` and the
     staging equivalent.
3. **Connect webhooks**: if you register a separate Connect endpoint, put its
   signing secret in `STRIPE_CONNECT_WEBHOOK_SECRET`. If you use one endpoint
   for both, leave that variable unset — the application falls back to
   `STRIPE_WEBHOOK_SECRET`.
4. Stripe will ask for your own business verification before live Connect
   works. **Start this early**; it can take a day or two.

---

## 11. Domains

DNS first, because it is the slowest thing here.

1. Railway → **staging** service → **Settings → Networking → Custom Domain** →
   `staging.garagedoorhq.com`. Railway shows a CNAME target.
2. Railway → **production** service → the same → `app.garagedoorhq.com`.
3. At your DNS provider:
   ```
   staging.garagedoorhq.com   CNAME   <target Railway shows>
   app.garagedoorhq.com       CNAME   <target Railway shows>
   ```
4. Wait for Railway to show the certificate as issued.
5. Set `APP_URL` and `NEXT_PUBLIC_APP_URL` on each service to match, exactly,
   with `https://` and no trailing slash. Every link that leaves the building
   is built from this.

---

## 12. Every environment variable

Railway → service → **Variables**. Paste each secret directly from the service
that issued it.

Legend: **required** · *recommended* · optional

### STAGING

| Variable | Value | Where it comes from |
|---|---|---|
| **`APP_ENV`** | `staging` | Type it. The most important variable here. |
| **`DATABASE_URL`** | reference | §3 — Add Reference → `staging-db` |
| **`AUTH_SECRET`** | 32 random bytes | `openssl rand -base64 32` — **different from production's** |
| **`APP_URL`** | `https://staging.garagedoorhq.com` | §11 |
| **`NEXT_PUBLIC_APP_URL`** | the same | §11 |
| *`STORAGE_DRIVER`* | `r2` | Type it |
| *`R2_ACCOUNT_ID`* | Cloudflare account id | §6 |
| *`R2_ACCESS_KEY_ID`* | staging token | §6 |
| *`R2_SECRET_ACCESS_KEY`* | staging token | §6 — shown once |
| *`R2_BUCKET`* | `gdhq-staging` | §6 |
| *`RESEND_API_KEY`* | staging key | §7 |
| *`EMAIL_FROM_ADDRESS`* | `no-reply@garagedoorhq.com` | §7 |
| *`EMAIL_FROM_NAME`* | `Garage Door HQ` | Type it |
| **`STAGING_EMAIL_REDIRECT_TO`** | your own inbox | Type it — **or** `STAGING_EMAIL_ALLOWLIST` |
| *`STRIPE_SECRET_KEY`* | `sk_test_...` | §8 — **test key only** |
| *`STRIPE_PRICE_ID_STANDARD`* | test `price_...` | §8 |
| *`STRIPE_WEBHOOK_SECRET`* | staging `whsec_...` | §9 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | §8 — public by design |
| `PLATFORM_ADMIN_EMAIL` | your address | Type it |
| `DEMO_PASSWORD` | something you choose | So the demo does not use the repo's password |
| `DEMO_SEED_TOKEN` | 32 random chars | Only while loading the demo. **Remove afterwards.** |
| `TRIAL_DAYS` | `14` | Type it |

**Do not set on staging:** `AUTH_URL`, `ALLOW_LOCAL_APP_URL`,
`ALLOW_SEED_RESET`, any `sk_live_` key.

### PRODUCTION

| Variable | Value | Where it comes from |
|---|---|---|
| **`APP_ENV`** | `production` | Type it. Without it, outbound email is held back. |
| **`DATABASE_URL`** | reference | §3 — Add Reference → `production-db` |
| **`AUTH_SECRET`** | 32 random bytes | `openssl rand -base64 32` — **its own, never staging's** |
| **`APP_URL`** | `https://app.garagedoorhq.com` | §11 |
| **`NEXT_PUBLIC_APP_URL`** | the same | §11 |
| **`STORAGE_DRIVER`** | `r2` | Type it |
| **`R2_ACCOUNT_ID`** | Cloudflare account id | §6 |
| **`R2_ACCESS_KEY_ID`** | production token | §6 |
| **`R2_SECRET_ACCESS_KEY`** | production token | §6 — shown once |
| **`R2_BUCKET`** | `gdhq-production` | §6 |
| **`RESEND_API_KEY`** | production key | §7 |
| **`EMAIL_FROM_ADDRESS`** | `no-reply@garagedoorhq.com` | §7 |
| **`EMAIL_FROM_NAME`** | `Garage Door HQ` | Type it |
| *`EMAIL_SUPPORT_ADDRESS`* | `support@garagedoorhq.com` | Reply-to on platform mail |
| **`STRIPE_SECRET_KEY`** | `sk_live_...` | §8 |
| **`STRIPE_PRICE_ID_STANDARD`** | live `price_...` | §8 |
| **`STRIPE_WEBHOOK_SECRET`** | production `whsec_...` | §9 |
| *`STRIPE_CONNECT_WEBHOOK_SECRET`* | Connect `whsec_...` | §10 — omit to reuse the above |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | §8 — public by design |
| **`PLATFORM_ADMIN_EMAIL`** | your address | Type it |
| *`BACKUP_SCHEDULE`* | e.g. `Daily 03:00 UTC, 30 days, Railway + weekly dump to R2` | §4 |
| *`BACKUP_LAST_VERIFIED_RESTORE`* | e.g. `2026-09-17` | §5 |
| `TRIAL_DAYS` | `14` | Type it |

**Never set on production:** `AUTH_URL`, `ALLOW_LOCAL_APP_URL`,
`ALLOW_SEED_RESET`, `DEMO_SEED_TOKEN` (the demo installer refuses production
regardless), `STAGING_EMAIL_*`, any `sk_test_` key.

### Where secrets belong, in one line each

| Secret | Lives only in |
|---|---|
| Database URLs | Railway, as a **reference** to the database service |
| `AUTH_SECRET` | Railway variables, one per environment |
| R2 keys | Railway variables — two tokens, one per bucket |
| Resend key | Railway variables, one per environment |
| Stripe secret keys | Railway variables — live on production only |
| Stripe webhook secrets | Railway variables, one per endpoint |
| `DEMO_SEED_TOKEN` | Railway staging, temporarily, then deleted |

None of them belong in this repository, a `.env` file you commit, a chat
message, a screenshot or a password manager note you paste from.

---

## 13. First deploy, and reading the result

1. Merge something to `main`. Staging deploys.
2. Sign in as `PLATFORM_ADMIN_EMAIL` → **/admin/system**.
3. Work down the list until every row is Ready — or honestly not applicable.
   Each row names the variable to set; none of them show a value.
4. Create the `production` branch (§2), then **Actions → Promote to production**
   → paste the commit → type `PROMOTE`.
5. `/admin/system` on production. Same exercise. Production is stricter: local
   disk and no email provider both read as **Wrong** there, because both mean
   real customers lose something.

Then work `docs/PRIVATE-BETA-CHECKLIST.md`, which is about *proving* each of
these rather than configuring it.

---

## Loading the demo company on staging

```bash
curl -X POST "https://staging.garagedoorhq.com/api/admin/seed-demo?replace=1" \
  -H "x-seed-token: <the DEMO_SEED_TOKEN you set>"
```

Then **delete `DEMO_SEED_TOKEN`** from the staging variables. With it unset the
route 404s. On production the demo installer refuses outright, whatever token
is presented.

---

## If something is wrong

| Symptom | Almost always |
|---|---|
| Sign-in returns a JSON "server configuration" error | `AUTH_SECRET` is not set. Note: not `NEXTAUTH_SECRET`. |
| Sign-in redirects to localhost | `AUTH_URL` is set. Delete it. |
| Customer links point at the wrong host | `APP_URL` is wrong, or `NEXT_PUBLIC_APP_URL` changed without a rebuild. |
| Photos vanish after a deploy | `STORAGE_DRIVER` is not `r2`. |
| Nobody receives email | No provider key, or the domain is not verified. |
| Staging sends no email | Working as designed. Set `STAGING_EMAIL_REDIRECT_TO`. |
| Subscriptions never activate | `STRIPE_WEBHOOK_SECRET` is missing; the endpoint answers 503. |
| Everything works but says STAGING | `APP_ENV` is unset on production. |

`/api/health` answers the same questions without a login, and
`node scripts/health-check.mjs https://app.garagedoorhq.com --expect production`
turns it into a pass or a fail.
