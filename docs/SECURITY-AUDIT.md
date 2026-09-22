# Pre-beta security and production-readiness audit

**Date:** 15 September 2026
**Scope:** the whole application, its deployment, and everything it can reach
**Method:** attack it, then fix what got through

---

## Verdict

# READY FOR LIMITED PRIVATE BETA

Not ready for open production. The difference is not a list of unfixed
vulnerabilities — there are none outstanding at blocker level — it is that
three pieces of operational infrastructure have been *specified and scripted
here but not yet stood up by a human with access to Railway and Cloudflare*:
the separate staging and production services, the production backup schedule,
and a restore that has actually been performed. Those cannot be done from
inside a repository. Until they are, "we have backups" is a plan, not a fact,
and a private beta with a handful of companies you can phone is the right size
of risk.

**What justifies "limited private beta":**

- Tenant isolation is enforced at the data layer and verified by 43 direct
  cross-tenant attempts plus a browser-driven run; nothing gets through.
- Every vulnerability this audit found is fixed, and each fix is held down by
  the test that found it.
- Money is never taken from the browser: prices, tax and totals are computed
  server-side from the price book, signed documents are frozen and hashed, and
  a signed estimate does not move when the price book does.
- Staging cannot email a real homeowner or charge a real card, structurally
  rather than by convention.
- A normal development push can no longer change what customers are using.

**What stops it being "ready for production":** §11.

---

## 1. What was found, and what happened to it

Eight issues. All eight are fixed. Severity is "what would this have cost a
real garage door company", not CVSS.

### 1.1 Cross-tenant price book disclosure — **was BLOCKER, fixed**

`addCatalogItemToEstimate` resolved the catalog on the raw Prisma client
instead of the tenant-scoped one. Company A could post Company B's
`priceBookItemId` alongside their own estimate id and have B's line copied onto
A's estimate — name, description, SKU, unit price **and unit cost**.

The parent check passed (the estimate was A's), so nothing looked wrong. It is
exactly the nested-relationship IDOR the brief names: a valid parent does not
make an arbitrary child id safe.

*Impact:* a competitor's flat-rate pricing and their margin, read through a
write.
*Fix:* the catalog lookup is scoped in `appendLinesTx` — the single function
every priced line passes through — and an id that resolves to nothing is now an
error rather than a silently shorter estimate.
*Held by:* `tests/security-cross-tenant.test.ts` → "cannot pull another
company's catalog line onto its own estimate".

### 1.2 Cross-tenant inventory corruption — **was HIGH, fixed**

`postLedgerMoves` never checked that the locations named in a move belonged to
the posting organization, and `adjustStock` passed a caller-supplied
`locationId` straight in. An inbound adjustment created a `StockLevel` row and
an `InventoryTransaction` against another company's truck.

An outbound move happened to be blocked by the "not enough stock" check — by
accident, not by design, which is why the test now exercises both directions.

*Impact:* another company's stock counts silently wrong; a technician arrives
without the part.
*Fix:* `assertLocationsOwned` in `postLedgerMovesTx`, the only door into the
ledger.
*Held by:* "cannot move stock in or out of another company's location", and
"cannot complete its own job against another company's location or catalog".

### 1.3 Job completion was not idempotent under concurrency — **was HIGH, fixed**

`completeJob` re-read the job inside its transaction to stop a double tap. At
Postgres's default READ COMMITTED isolation a `SELECT` takes no lock, so two
concurrent requests both saw `IN_PROGRESS`, both deducted the parts, and both
raised an invoice. The existing test passed because it ran the two
*sequentially*.

*Impact:* the customer is invoiced twice and the truck is debited twice, from
one double tap on a slow connection. This is the single most likely of these to
have happened in normal use.
*Fix:* the transaction now *claims* the job with a conditional `UPDATE`, which
does take a row lock. The second transaction waits, then matches no rows.
*Held by:* "deducts each part exactly once, even when the request arrives twice
at once" — two real `completeJob` calls racing.

### 1.4 Account enumeration by login timing — **was HIGH, fixed**

`authorize()` spent "comparable time" on a missing account by comparing against
`$2a$12$invalidinvalid…` — which is not a valid bcrypt hash. bcrypt rejected it
in microseconds.

Measured: **302 ms** for an existing account, **0.0 ms** for one that does not
exist. A 30,000× difference from a single request. The comment described a
defence the code did not implement.

*Impact:* an attacker enumerates which addresses are customers, which feeds
credential stuffing and targeted phishing.
*Fix:* `verifyAgainstDecoy()` compares against a real bcrypt hash at the same
work factor, computed once at module load.
*Held by:* `tests/security-auth.test.ts` — both paths must exceed 20 ms and be
within 3× of each other.

### 1.5 Foreign job type and assignee on a new job — **was MEDIUM, fixed**

`createJob` validated the customer, the address and the door, but not
`jobTypeId` or `assignedToId`. A job could be created holding a foreign key
into another company's rows, putting their job-type name and their employee's
name on this company's screen.

*Fix:* both validated through the scoped client, matching what `assignJob`
already did.

### 1.6 Tenant scoping redirected instead of narrowing — **was MEDIUM, fixed**

`Organization` is scoped by `id` — the same column a caller filters on — so the
spread overwrote the requested id with the caller's own. `findUnique({ where: {
id: theirOrg } })` returned *your* organization. Not a disclosure, but a query
that answers a question nobody asked is a bug waiting to become one.

*Fix:* a foreign id is replaced with one that cannot exist, so reads find
nothing and writes refuse. Narrowing only ever narrows.

### 1.7 `javascript:` URL in a customer-facing email — **was LOW, fixed**

A company's review-destination URL is rendered in an `href` in an email to
their own customers. `z.string().url()` accepts `javascript:alert(1)` — it is a
well-formed URL. Escaping stops attribute break-out and does nothing about the
scheme.

*Fix:* scheme allowlist at the settings form, and `safeUrl()` in the email
layout as the second line.

### 1.8 Part cost shown to technicians — **was LOW (confidentiality), fixed**

Found by the browser run, not by the service tests, because it is not an
authorization bug: the price book list, the truck screen and a part's own page
showed `cost $x` to anyone with `pricebook:read`, which technicians have by
design so they can build an estimate.

This is a business-confidentiality judgement rather than a vulnerability, and
reasonable companies differ. The conservative reading won: cost is now behind
`reports:financial`, the permission that already gates the money dashboard.
Technicians still see the sell price, which is what they need in a driveway.

---

## 2. What was tested

### Automated — 532 tests across 41 files

| Suite | What it proves |
|---|---|
| `security-cross-tenant.test.ts` (31) | Company A against Company B on every org-owned model: read, create, update, delete, and nested-id IDOR |
| `security-authorization.test.ts` (14) | OWNER / ADMIN / OFFICE / TECHNICIAN, privilege escalation, platform-staff separation |
| `security-auth.test.ts` (8) | Login timing, bcrypt cost and salting, cookie flags, JWT contents |
| `security-integrity.test.ts` (13) | Server-side pricing, quantity bounds, tax bounds, signed-snapshot immutability, payment bounds, concurrent completion |
| `security-web.test.ts` (20) | XSS, raw SQL, upload sniffing, storage-key traversal, headers, redirects |
| `environment.test.ts` (25) | Fail-closed environment, email gate, Stripe key mode, production refusals |
| `tenancy.test.ts`, `authorization.test.ts` | The scoping client itself; a source scan proving every action and route handler checks who is asking |
| `password-reset.test.ts` (14), `rate-limit.test.ts` (10) | Token expiry, single use, session invalidation; per-scope, per-subject, concurrent limits |
| `webhooks.test.ts` (17), `customer-payments.test.ts` (15) | Signature verification, replay, idempotency, cross-tenant webhook refusal |
| `completion.test.ts`, `inventory.test.ts`, `documents.test.ts`, `estimates.test.ts` | Ledger invariants, transactional completion, frozen documents |

### Adversarial browser run — `npm run adversarial`

Two companies signed up through the real screens, plus a technician and a
customer on a private link. **43 attempts, 43 refused.** On a phone viewport and
a desktop one.

- Company A typing Company B's `/customers/…`, `/properties/…`, `/doors/…`,
  `/jobs/…`, `/jobs/…/inspection`, `/jobs/…/complete`, `/estimates/…`,
  `/present/…`, the estimate PDF route, the photo route, `/admin` → all 404 or
  redirected.
- Search by name, phone and address → no link to the other company's records.
- Signed out → every authenticated route sends you to sign in; the photo route
  answers 401.
- A technician → team, billing, money and platform admin refused; the price
  book readable but with no way to change a price and no cost shown.
- Guessed portal tokens (`aaa…`, zeroes, `../../../etc/passwd`, `null`) → the
  same refusal page for every one, with no document behind it.
- Presentation Mode → handover screen first; no cost/margin/stock/SKU wording;
  no navigation; a back gesture stays inside the presentation.
- Session cookie → `httpOnly`, `SameSite=Lax`, invisible to page JavaScript, and
  an edited token is rejected.
- Page source → no secret, key or connection string.

### Full product walkthrough — `npm run e2e`

53 steps: partner attribution → signup → onboarding → pricing → invite → stock
→ customer → Door Passport → schedule → inspection → estimate → Presentation
Mode → email → customer signs on their own phone → completion → inventory →
passport history → invoice → payment → review request → search → PDFs → trial
expiry → Stripe webhooks → platform admin. Green against a staging build.

### By hand

- Login timing measured directly (§1.4).
- Secrets scanned across the working tree (284 files) and **every blob in every
  commit** (966 file versions).
- `npm audit` on the production dependency tree.
- Every raw SQL statement read.
- Every `'use server'` action and route handler enumerated and its guard read.

---

## 3. What each area looks like now

### Multi-tenancy — **strong**

Two independent layers. `tenantDb(organizationId)` injects the tenant filter
into the `where` of every read and write and the `data` of every create, for all
34 models that carry `organizationId` (verified against the schema — no model
is missing from the list). The organization id itself is resolved server-side
from the user's active membership on every request, and is never read from a
URL, a form field or a request body.

The 9 child models with no tenant column of their own — estimate options and
items, inspection items, springs, package items, door events, job parts,
invoice items, estimate versions — are reachable only through a scoped parent,
and every service that takes one of their ids by hand re-checks ownership. That
is where §1.1 and §1.2 lived; both are now checked at a choke point rather than
per caller.

### Authorization — **strong**

A permission table, checked in the service that does the work. Hiding a button
is never the control. The role tests call services directly with a session
carrying each role, which is what a technician gets by replaying a server
action. No escalation path was found: nobody can promote themselves, an admin
cannot mint or touch an owner, the last owner cannot be demoted, and a
deactivated member stops having a session at all because the session resolves
from an *active* membership.

`PLATFORM_ADMIN` is a separate axis from the company role. Platform staff hold
no membership, so they never pick up a tenant; a company owner has
`platformRole: NONE` and cannot reach `/admin`.

### Authentication — **good**

bcrypt cost 12, salted. Session is a JWT carrying identity only — no
organization, no role — so a revoked membership or a demotion takes effect on
the next request rather than at token expiry. `sessionEpoch` bumps on password
reset and invalidates live sessions. Cookie is `httpOnly`, `SameSite=Lax`,
`__Secure-` prefixed and `Secure` in production. Login is rate limited on both
the address and the account. Reset tokens are 256-bit, stored only as SHA-256,
expire in an hour, work once (conditional update, so a race cannot use one
twice), and revoke every sibling token.

CSRF: mutations are Next.js Server Actions, which are POST-only with an origin
check, and the cookie is `SameSite=Lax`. `form-action 'self'` in the CSP stops
a form posting off-site.

### Customer links — **strong**

The token *is* the credential and is treated as one: 256 bits from a CSPRNG,
base64url, stored only as a SHA-256 hash, expiring, revocable, and superseded
when a new link is issued. Every link names exactly one document; resolving it
yields a tenant context scoped to that organization and that document id only.
No organization, customer or document id ever appears in a customer URL.
Unknown, expired and revoked all answer identically, so probing teaches
nothing. The portal actions re-resolve the token every time and take the
document id from the link, never from the form.

### Presentation Mode — **good, with a stated limit**

Costs, margins, SKUs, stock and internal notes are not hidden with CSS — they
are never selected. It is its own route group with no navigation, and leaving
takes a deliberate two-tap technician action. A back gesture is now held inside
the presentation.

*The honest limit:* the technician's session is live in that browser. A
determined person holding the device can type a URL. The back-gesture guard
fixes the accident, not the intent, and the real control is that the technician
is standing next to them. A stronger version — a short-lived presentation token
that suspends the session — is in §10.

### Files and photos — **strong**

Private bucket, no public URL. Every read is brokered: session, then
tenant-scoped lookup, then a 120-second presigned GET or a streamed body. Keys
are `environment/org/<id>/folder/<yyyymm>/<uuid>.<ext>` — nothing sequential,
nothing derived from a record. Uploads are presigned, size-capped, type-checked
against an allowlist, and after the bytes land the leading bytes are sniffed
and the row is rejected if they disagree with what was declared. SVG is
deliberately not an accepted image type: it is a script container. Upload is
rate limited per user.

### Money — **strong**

No price ever comes from the browser. The client sends an item id and a
quantity; everything else is read from the price book and recomputed
server-side. Option totals are recalculated from their own lines after every
change — a test tampers with the stored total directly and watches the server
overwrite it. Quantities are bounded in the service. Tax is bounded 0–50% and
applied server-side. `$499 → $4.99` has nowhere to enter.

Signing freezes an `EstimateVersion` with a canonical JSON snapshot and a
SHA-256 hash, and the signature points at that version and that hash. Raising a
price afterwards does not move the signed document — tested by multiplying the
price by ten and re-rendering.

### Payments — **strong**

No card number touches this system. Stripe Checkout and Stripe Connect handle
the card; the schema has no column a PAN could be written to. Webhook
signatures are verified over the raw bytes before anything is parsed as
trusted. Every event id is inserted under a unique constraint before any
business logic runs, so a replay, a retry after our own 500, and Stripe's
at-least-once delivery all stop there. Amounts are reconciled against the
invoice; client-reported payment status is never trusted — only the webhook
marks an invoice paid.

### Input handling — **good**

No `dangerouslySetInnerHTML`, no `innerHTML =`, no `document.write`, no `eval`
anywhere in `src`. React escapes JSX. Email HTML escapes every interpolation
and now checks URL schemes. All raw SQL is parameterized; the two
`$executeRawUnsafe` calls interpolate table names read from Postgres's own
catalog and bind the tenant id. Storage keys are constructed server-side from a
fixed extension table. No redirect takes its destination from a request.

### Headers — **good**

CSP with `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`,
`base-uri 'self'`, `form-action 'self'`. HSTS, `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, no
`X-Powered-By`. `/api/files/*` is `private, no-store`.

`script-src` carries `'unsafe-inline' 'unsafe-eval'`, which Next.js requires
without a nonce pipeline on every route. See §10.

### Errors and logging — **good**

Users see only wording this codebase wrote. Domain errors are recognised from
an explicit allowlist; everything else becomes one generic sentence while the
real error is logged. A test keeps the allowlist in step with the error classes
that actually exist. `AuditLog` records who did what, including platform-staff
actions against a company.

### Rate limiting — **good**

Postgres-backed fixed windows, so it survives a restart and is shared across
instances. Login (per address *and* per account), signup, password reset
request and confirm, portal tokens, uploads, invitations, and sensitive
mutations. Tested for concurrency — ten simultaneous attempts do not buy extra
budget.

---

## 4. Environment separation

| | development | staging | production |
|---|---|---|---|
| Database | local | own | own |
| Storage | local disk | own bucket, `staging/` prefix | own bucket, `production/` prefix |
| Stripe | none | test keys (live keys **refused**) | live keys |
| Email | console log | blocked / redirected / allowlisted, subject-tagged | sends |
| Demo installer, truncating seed | allowed | allowed | **refused** |
| UI | amber banner | amber banner, amber icon, `— STAGING` title | nothing |

One variable, `APP_ENV`, read in `src/lib/environment.ts`. **It fails closed:**
unset on a deployment means staging, never production, because a production
deployment that forgets it holds email back for an hour while a staging
deployment mistaken for production emails real homeowners permanently.
`/api/health` reports the environment and whether it was declared or inferred.

The email gate wraps the *driver*, not the send helper, so there is no path to
an outbound message that skips it — including the password-reset path, which
talks to the driver directly for a user who has no organization yet.

Full setup, variable by variable: `docs/ENVIRONMENTS.md`.

---

## 5. Deployment: a push no longer changes production

**Before:** production auto-deployed from the default branch. Any push changed
what customers were using.

**Now:**

```
push / merge to main
   ↓  CI: typecheck · lint · isolation · authorization · auth · integrity ·
          build · migration scan · dependency audit
staging deploys automatically
   ↓  you test it on your phone
Actions → "Promote to production" → paste the commit, type PROMOTE
   ↓
production branch moves to that exact commit → Railway deploys → health check
```

Production deploys only from the `production` branch, which nothing writes
except the promotion workflow. The workflow refuses a commit that is not an
ancestor of `main`, refuses one whose checks did not pass, re-runs the migration
scan, tags the release, and then polls `/api/health` until production answers —
asserting it really is production, that `APP_ENV` was declared, that storage is
R2 and that email is configured.

Rollback is one dispatch with a release tag, and its summary names any
migrations the database will still be carrying.

Procedures in full: `docs/ENVIRONMENTS.md` §3 and §4.

---

## 6. Database safety

`npm start` runs `prisma migrate deploy` — applies pending migrations in order,
never resets, never invents a diff. `migrate reset` and `db push` appear
nowhere in any deployment path. The truncating seed refuses `APP_ENV=production`
outright, with no escape hatch, and requires an explicit opt-in anywhere else
that is deployed.

`scripts/check-migrations.mjs` reads every migration and names what can lose or
block data — drops, truncates, deletes, type changes, and the
`SET NOT NULL` / `CREATE UNIQUE INDEX` pair that fails a deployment when the
data does not already comply. It also refuses migration directories that do not
sort in the order they were written, which would be skipped silently on a
deployed database. CI runs it against exactly what this release adds to
production's schema and puts the report in the job summary; a destructive
finding fails until acknowledged.

**Recovery** is documented as a procedure, not a promise:
`docs/ENVIRONMENTS.md` §5 covers the backup schedule, an independent dump off
the Railway account, restoring into a *separate* database and cutting over,
what to do when a deployment corrupts data (roll back first, then scope the
blast radius — per-tenant restore is possible because every table that matters
carries `organizationId`), what is *not* in a database backup (R2 objects —
enable versioning), and a quarterly restore drill.

---

## 7. Secrets

Scanned the working tree (284 tracked files) and **every blob in every commit**
(966 file versions) for Stripe keys, AWS/R2 credentials, Resend and Postmark
tokens, GitHub and Slack tokens, private key blocks, Postgres URLs with
passwords, and assigned values for `AUTH_SECRET`, `DEMO_SEED_TOKEN` and
friends.

**Nothing found. No rotation required.** `.env` has never been committed;
`.env.example` holds only placeholders.

The only `NEXT_PUBLIC_*` values are `APP_NAME`, `APP_URL` and
`STRIPE_PUBLISHABLE_KEY` — all public by design. The adversarial run also
checks the rendered HTML for key prefixes and connection strings and finds
none.

`scripts/scan-secrets.mjs` reports what and where, never the value, so it is
safe to run in CI.

---

## 8. Dependencies

**Production tree: 0 advisories**, after pinning two transitive packages
forward through `overrides`:

| Package | Was | Now | Advisories closed |
|---|---|---|---|
| `postcss` (via `next`) | 8.4.31 | 8.5.28 | 4 HIGH — XSS via unescaped `</style>`, three source-map path traversals |
| `deepmerge-ts` (via `prisma`) | 7.1.5 | 8.0.2 | 1 HIGH — stack exhaustion |

Both were verified after the bump: `prisma generate`, `prisma migrate deploy`,
a production build and the full test suite. `npm audit --omit=dev
--audit-level=high` is a CI gate, so a new high-severity advisory in a shipped
dependency fails the build.

**Development tree: 1 critical, 1 high, both in `vitest`/`vite`.** Not fixed,
deliberately. They are devDependencies — never installed on a deployment
(`npm ci --omit=dev`), never in the request path. The critical one requires
running `vitest --ui`, which nothing here does. The fix is vitest 2 → 5, three
majors, across 532 tests; the brief says not to blindly perform major upgrades
that could break the application, and this one would risk exactly that for no
production benefit. Tracked in §10 as a maintenance task with a real window,
not a beta blocker.

---

## 9. What is mocked or not production-ready

Named plainly, because "it works locally" is not the same as "it works".

| Thing | State |
|---|---|
| **Email delivery** | The provider abstraction is real (Resend, Postmark, console). No provider is configured in this environment, so every message is logged rather than sent. **Production needs `RESEND_API_KEY` or `POSTMARK_SERVER_TOKEN` and a verified sending domain with SPF/DKIM before beta** — the health check now fails production without it. |
| **Object storage** | The R2 driver is real and complete. This environment uses the local-disk driver, which does not survive a redeploy. **Production must set the R2 variables**; the health check fails production on local storage. |
| **Stripe** | Real integration, verified against signed webhook payloads in tests and in the E2E. Never exercised against a live Stripe account. **Do one real $39.99 subscription and one real customer invoice payment on staging with test keys, then one on production with live keys, before taking money from anyone else.** |
| **Stripe Connect payouts** | Onboarding and charge creation implemented; no real connected account has completed onboarding. |
| **SMS / push** | Not built. When added, it must go through an environment gate like the email one — the guard pattern is in `src/server/email/guard.ts`. |
| **Email delivery webhooks** | `DELIVERED` and `BOUNCED` are set only by a provider webhook. That endpoint is not built, so messages stop at `SENT`. Correct, but the timeline will never show a bounce. |
| **Backups** | Procedure documented and scripted. **No backup has been taken and no restore has been performed.** |
| **Staging and production services** | Specified variable by variable. **Not yet created.** |

---

## 10. Remaining risk

### HIGH — must be done before the first real company

Not vulnerabilities; missing infrastructure. Each one is a human action.

1. **Stand up the two Railway services** with separate databases, separate
   buckets, separate Stripe keys and separate `AUTH_SECRET`s
   (`docs/ENVIRONMENTS.md` §2).
2. **Turn on production backups** and take an independent dump off the Railway
   account (§5).
3. **Perform one restore** into a scratch database and compare row counts. A
   backup nobody has restored is a hypothesis.
4. **Configure an email provider** with a verified sending domain, and send one
   real estimate to yourself from staging and from production.
5. **Take one real payment end to end** on live keys.

### MEDIUM — during beta

6. **Presentation Mode is guarded, not sealed.** The technician's session is
   live in that browser. Consider a short-lived presentation token that
   suspends the session for the duration, so the device genuinely cannot reach
   the business while the customer holds it.
7. **Password-reset request timing.** A missing address returns in
   milliseconds; an existing one does a transaction and an email send. Much
   less crisp than the login oracle that was fixed, but real. A constant-time
   floor would close it.
8. **`script-src 'unsafe-inline' 'unsafe-eval'`.** Next.js needs it without a
   nonce pipeline on every route. It weakens the CSP as a second line against
   XSS — the first line (no raw HTML anywhere) is intact.
9. **`vitest`/`vite` advisories** in the dev tree (§8). Upgrade in a dedicated
   window with the suite green, not before beta.
10. **Rate limiting is per fixed window**, which allows up to 2× the limit
    across a boundary. Accepted for these limits; a sliding window if abuse
    appears.
11. **A user with memberships in two companies** always acts as the first one.
    Not reachable today (nothing creates a second membership), but it will be
    when a company invites someone who already has an account elsewhere. Needs
    an organization switcher before that ships.

### LOW — hardening

12. Two-factor authentication for OWNER and PLATFORM_ADMIN.
13. Alerting on the audit log — repeated 404s on other tenants' ids is what a
    probe looks like.
14. Field-level encryption for gate codes and access instructions, which is the
    most sensitive thing in the database.
15. R2 object versioning and lifecycle rules (§5 notes this; it is a console
    setting).
16. A documented data-retention and deletion policy, for when a company leaves.

---

## 11. Why not "READY FOR PRODUCTION"

Every code-level finding is fixed and held down by a test. The application
itself is in good shape.

What is not done is the part that cannot be done from a repository: the
environments are specified but not created, and the backups are scripted but
never taken or restored. Open production means companies you have never spoken
to, trusting this with the record of every job they do. That needs the five
HIGH items in §10 completed and observed working for a while, not just
configured.

A limited private beta — a handful of companies who know they are early, whose
data you can reconstruct, and who you can phone — is the right size of risk for
where this is. Do the five, run a month, then revisit.

---

## Appendix — running any of this yourself

```bash
npm test                       # 532 tests
npm run e2e                    # 53-step product walkthrough
npm run adversarial            # 43 attacks, all must be refused
npm run check:migrations       # what can lose data
npm run check:secrets          # working tree
node scripts/scan-secrets.mjs --history   # every commit
npm audit --omit=dev           # production dependencies
npm run check:health -- https://app.thegaragedoorhq.com --expect production
```
