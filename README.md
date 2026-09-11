# Garage Door HQ

Business management software for garage door repair and installation companies.

Not a generic CRM with garage-door words pasted on top. The application understands doors,
springs, openers, parts and truck inventory as first-class objects, so it can answer things
generic field-service software cannot:

> *This customer has a 16×7 Clopay door with a LiftMaster 87504 opener, a torsion system on
> .225 × 2" × 27" springs replaced two years ago — and Truck #2 has the correct replacements
> on board right now.*

One plan. **$39.99/month, everything included, no limits.**

---

## Status

**Phase 1a is complete**: the full field loop runs end to end.

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the data model, multi-tenant and
  authorization strategy, inventory ledger, estimate/invoice versioning, the Spring
  Calculator's safety boundary, risks, and the phase plan.
- [`docs/PHASE-1A.md`](docs/PHASE-1A.md) — what shipped, the shortcuts taken, and what is
  **not** production-ready. Read this before deploying anything.

**The workflow that works today**

new customer → property → Door Passport → job → on my way / arrived / start →
garage-door inspection → one-tap Good/Better/Best from a finding → itemized estimate →
customer selects and signs → complete the job → inventory deducted, Door Passport updated,
invoice generated → payment recorded → passport history shows what changed.

**Also working**

- Multi-tenant Postgres schema (47 tables), tenant-scoped data access, server-side RBAC
- Signup and progressive onboarding with a 14-day trial and referral attribution
- Solo mode: one user and one truck means nothing is ever asked twice
- Private photo capture on Cloudflare R2 — presigned uploads, authorized reads
- Append-only inventory ledger with rebuildable stock levels
- Signed estimates frozen by version and content hash
- Spring matching against live truck and warehouse stock (sizing still refused by design)
- Company settings: tax rate, optional labor costing, review destination
- Today · Jobs · Customers · Inventory · Money · Estimates · Invoices · Settings · Price Book
- Installable PWA, realistic demo company
- 65 tests plus a live browser end-to-end run of the whole workflow

---

## Running it

Requires Node 20+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env            # then set DATABASE_URL and AUTH_SECRET
openssl rand -base64 32         # value for AUTH_SECRET

npm run db:migrate              # create the schema
npm run db:seed                 # load the demo company
npm run dev
```

Open http://localhost:3000.

### Demo logins

Seeded by `npm run db:seed` (password configurable with `DEMO_PASSWORD`):

| Account | Email | Role |
| --- | --- | --- |
| Mike Delgado | `mike@precisiongaragedoor.test` | Owner |
| Tony Rivera | `tony@precisiongaragedoor.test` | Technician |
| Platform staff | `admin@garagedoorhq.test` | Platform admin |

Password: `GarageDoorHQ2026!`

The seed **resets the entire database** before loading. It refuses to run with
`NODE_ENV=production` unless `ALLOW_SEED_RESET=true`.

### Commands

```bash
npm run dev          # development server
npm run build        # prisma generate + next build
npm start            # production server (honours $PORT)
npm test             # vitest — needs DATABASE_URL
npm run typecheck    # tsc --noEmit
npm run lint
npm run db:migrate   # create/apply a dev migration
npm run db:deploy    # apply migrations (production)
npm run db:studio    # browse the database
npm run e2e          # live browser run of the whole field workflow
```

### The end-to-end run

```bash
npm run db:seed                    # the flow consumes real stock, so re-seed each time
npm run build && npm start &
npm run e2e                        # or: node scripts/e2e-flow.mjs http://127.0.0.1:3000
```

It drives a real Chromium at phone width through sign-in, customer creation, Door Passport,
job, inspection, tiered estimate, signature, completion, invoicing and payment, then asserts
the passport history and the inventory ledger. Screenshots land in `e2e-screenshots/`.

---

## Deploying to Railway

1. Create a project and add the **PostgreSQL** plugin — it sets `DATABASE_URL`.
2. Set `AUTH_SECRET` (`openssl rand -base64 32`), `AUTH_URL` (your public origin) and
   `AUTH_TRUST_HOST=true`.
3. Build command `npm run build`, start command `npm start`.
4. Run `npm run db:deploy` on deploy to apply migrations.
5. Create a **private** Cloudflare R2 bucket and set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`. Do not enable public access or an `r2.dev` domain —
   photos are served only through the app's authorized route. Without these the app falls back
   to local disk, which a container does not keep.

Every configuration value is an environment variable; `.env.example` documents them all. No
secrets are committed.

---

## Layout

```
prisma/schema.prisma      the data model, heavily commented
prisma/seed.ts            demo company
docs/ARCHITECTURE.md      the proposal: schema, tenancy, phases, risks
docs/PHASE-1A.md          what shipped in Phase 1a, shortcuts, and what is not production-ready
src/app/(marketing)       public, dark brand surface
src/app/(auth)            login
src/app/(app)             the field application — light UI, requireSession() in the layout
src/components/ui         design system primitives
src/components/app        navigation and page shell
src/lib                   db, auth, session, tenancy, rbac, money, measure, numbering, audit
src/server                domain services: storage, media, inventory ledger, springs,
                          estimates, inspections, invoices, doors, jobs, organizations
scripts/e2e-flow.mjs      live browser walkthrough of the whole field workflow
tests                     tenant isolation, ledger invariants, spring matching, money math,
                          estimate/signature guarantees, completion atomicity, storage, onboarding
```

---

## Three rules worth repeating

**Tenant isolation.** Organization ids are resolved server-side from the session, never from a
URL or a request body, and `tenantDb()` injects the filter into every query. Authorization
happens in the action that does the work, not in the component that draws the button.

**No invented spring engineering.** The Spring Calculator matches measured springs against the
catalog and reports live stock — a database lookup. Calculating a spring from a door weight
refuses to answer until verified manufacturer data is registered, because a wrong answer puts
a technician under a loaded door. There is no placeholder arithmetic anywhere in that module.

**Completing a job is one transaction.** Parts leaving the truck, the Door Passport gaining a
new spring system and a timeline entry, the invoice being generated from the signed option and
the job's costing being recalculated either all happen or none do. A partial completion would
leave a business with books it cannot trust.
