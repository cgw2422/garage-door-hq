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

This branch is the **foundation** — the specification's "get the foundation correct first"
step, plus the first working screens.

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first.** It covers the schema and its
relationships, the multi-tenant and authorization strategy, the inventory ledger, the
estimate/invoice versioning model, the Spring Calculator's safety boundary, the risks worth
knowing about, what is postponed from Phase 1 and why, and the phase plan.

**Working now**

- Multi-tenant Postgres schema (45 tables) with migration
- Tenant-scoped data access, server-side authorization, RBAC
- Email/password auth (Auth.js v5, bcrypt), DB-resolved roles, session invalidation
- Design tokens and a reusable mobile-first component system
- Today dashboard · Jobs list · Job detail (Job / Door / Photos / Notes) · Spring Calculator ·
  Truck Inventory · Customers · Money dashboard · More · dark marketing landing · login
- Append-only inventory ledger with rebuildable stock levels
- Estimate versioning with content hashing, so a signed document cannot silently change
- Spring matching against live truck and warehouse stock
- Installable PWA (manifest, icons, standalone display)
- Realistic demo company with a live day, low stock and an unpaid invoice
- 29 tests covering tenant isolation, the ledger, spring matching and money math

**Not built yet** — see the phase plan in the architecture doc. The largest remaining Phase 1
gap is object storage for photos.

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
```

---

## Deploying to Railway

1. Create a project and add the **PostgreSQL** plugin — it sets `DATABASE_URL`.
2. Set `AUTH_SECRET` (`openssl rand -base64 32`), `AUTH_URL` (your public origin) and
   `AUTH_TRUST_HOST=true`.
3. Build command `npm run build`, start command `npm start`.
4. Run `npm run db:deploy` on deploy to apply migrations.

Every configuration value is an environment variable; `.env.example` documents them all. No
secrets are committed.

---

## Layout

```
prisma/schema.prisma      the data model, heavily commented
prisma/seed.ts            demo company
docs/ARCHITECTURE.md      the proposal: schema, tenancy, phases, risks
src/app/(marketing)       public, dark brand surface
src/app/(auth)            login
src/app/(app)             the field application — light UI, requireSession() in the layout
src/components/ui         design system primitives
src/components/app        navigation and page shell
src/lib                   db, auth, session, tenancy, rbac, money, measure, numbering, audit
src/server                domain services: inventory ledger, springs, estimates, job queries
tests                     tenant isolation, ledger invariants, spring matching, money math
```

---

## Two rules worth repeating

**Tenant isolation.** Organization ids are resolved server-side from the session, never from a
URL or a request body, and `tenantDb()` injects the filter into every query. Authorization
happens in the action that does the work, not in the component that draws the button.

**No invented spring engineering.** The Spring Calculator matches measured springs against the
catalog and reports live stock — a database lookup. Calculating a spring from a door weight
refuses to answer until verified manufacturer data is registered, because a wrong answer puts
a technician under a loaded door. There is no placeholder arithmetic anywhere in that module.
