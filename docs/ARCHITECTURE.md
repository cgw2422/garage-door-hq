# Garage Door HQ — Architecture

This document answers items 3–12 of the specification's "What I want you to do first".
It describes the foundation that is now in the repository, the reasoning behind each
decision, and the things that are genuinely risky or unresolved.

The written specification is the functional source of truth. The approved branding and
mobile UI concept is the visual source of truth. Where the two disagree on behaviour,
the specification and safe engineering practice win.

---

## 1. Data model

### 1.1 The relationship that defines the product

```
ORGANIZATION  (the garage door company — the tenant boundary)
     │
     ├── USER ──< MEMBERSHIP >── (role: OWNER | ADMIN | OFFICE | TECHNICIAN)
     │
     └── CUSTOMER
              │
              └── PROPERTY                (a service address; a customer may have many)
                       │
                       └── DOOR           ← the Door Passport. A permanent physical asset.
                             ├── OPENER         (current + superseded history)
                             ├── SPRING SYSTEM  (current + superseded history)
                             │        └── SPRING  (wire, ID, length, wind, qty, cycles)
                             └── DOOR EVENT      (chronological passport timeline)
```

Jobs hang off this tree rather than owning it:

```
JOB ── customer (required)
    ├─ property (required)
    ├─ door     (optional — a service call may precede knowing which door)
    ├─ INSPECTION ──< INSPECTION ITEM
    ├─ ESTIMATE ──< ESTIMATE OPTION (Good/Better/Best) ──< ESTIMATE ITEM
    │        └─ ESTIMATE VERSION (immutable snapshot + content hash)
    ├─ INVOICE ──< INVOICE ITEM, and ──< PAYMENT
    ├─ JOB PART            (what actually came off the truck)
    ├─ SPRING MEASUREMENT  (what was measured, whether or not anything was sold)
    ├─ PHOTO / NOTE / VOICE NOTE / SIGNATURE
    └─ INVENTORY TRANSACTION (parts consumed)
```

Four decisions are worth defending explicitly.

**A door is a row, not a custom field.** `Door` has typed columns for width, height,
manufacturer, model, serial, material, track radius, headroom, weight and warranty dates.
This is the entire competitive premise: "16x7 Clopay with a LiftMaster 87504 on .225 × 2" × 27"
springs" is only answerable if those are queryable columns. A JSON blob of custom fields
could store the same characters and answer none of the questions.

**Openers and spring systems are versioned, not overwritten.** Replacing springs creates a
new `SpringSystem` and flips the old one's `isCurrent` to false. The door's history survives,
and "what did we put on this door two years ago, and did it last?" stays answerable. The same
pattern applies to `Opener`.

**A commercial building is the default shape, not a special case.** `Door.positionLabel`
("Receiving Door 3", "Bay 1") exists from day one, and nothing assumes a property has exactly
one door. The seed includes a four-door warehouse to keep that path honest.

**`Door.qrToken` exists now** even though nothing scans it yet. A QR sticker printed today
must still resolve in two years; generating the token later would mean reprinting labels.

### 1.2 Units and money

| Kind | Storage | Why |
| --- | --- | --- |
| Money | `Int` cents, columns suffixed `Cents` | No float rounding on invoices, ever |
| Tax rate | `Int` basis points (`725` = 7.25%) | Percentages stay exact |
| Wire size | `Decimal(6,4)` | `.2437` and `.2430` are different springs |
| Diameters / lengths | `Decimal(6,3)` / `Decimal(7,3)` | Half-inch spring lengths are normal |
| Inventory quantity | `Decimal(12,3)` | Cable is sold by the set, seal by the foot |

`src/lib/money.ts` is the only place cents become a string, and `src/lib/measure.ts` is the
only place a decimal becomes `.225 x 2" x 27"`.

### 1.3 The price book is also the parts master

`PriceBookItem` serves both quoting and inventory. A torsion spring has one SKU, one cost and
one selling price whether you are putting it on an estimate or counting it on a truck.
Splitting them into "catalog" and "part" tables guarantees drift between the price you quote
and the part you consume.

Spring attributes live in a separate `SpringSpec` table keyed to the item, with a compound
index on `(wireSize, insideDiameter, length, wind)`. That makes "find me a .225 × 2 × 27 left
hand" an indexed lookup instead of a string search over SKU text.

### 1.4 Readable identifiers

`NumberSequence` holds a per-organization counter per entity, incremented with
`UPDATE … RETURNING` inside the caller's transaction. Two technicians creating a job at the
same moment cannot be handed `Job #1043` twice. UUIDs remain the primary keys; they never
appear in the UI.

---

## 2. Multi-tenancy and authorization

### 2.1 Where the organization id comes from

Exactly one place: `getSession()` in `src/lib/session.ts`, which reads the authenticated
user's `Membership` row from the database on every request. No organization id is ever read
from a URL, a form field, a request body, or a JWT claim.

The session token carries **identity only** — user id and a session epoch. Role and
organization are resolved server-side per request, so a revoked membership or a demoted role
takes effect immediately rather than whenever a token happens to expire. Bumping
`User.sessionEpoch` (on password reset) invalidates every live session for that user.

### 2.2 How isolation is enforced

`tenantDb(organizationId)` returns a Prisma client extension that:

- injects `organizationId` into the `where` of every read, update and delete,
- stamps `organizationId` onto the `data` of every create — **overwriting** any value the
  caller supplied, so a forged tenant id in a payload cannot win,
- applies to `findUnique` too, using Prisma's extended-where support, so a guessed primary
  key returns `null` rather than another company's record.

`tests/tenancy.test.ts` builds two organizations and asserts all of the above, including that
`update` and `delete` against another tenant's primary key throw rather than silently
succeeding.

Child rows with no tenant column of their own (estimate items, inspection items, springs,
package items) are reachable only through their scoped parent. A second denormalized tenant
column on every child is a second thing that can drift out of sync.

`unscopedDb` exists for the handful of genuinely cross-tenant operations — signup, login,
platform admin, portal-token lookup — and every call site is expected to justify itself.

### 2.3 Permissions

`src/lib/rbac.ts` maps a permission string to the roles that hold it. Checks happen in the
server action or loader that does the work (`requirePermission('invoice:void')`), not in the
component that draws the button. The Money dashboard demonstrates this: a technician who
navigates directly to `/money` gets a refusal, not a blank screen.

**There is no middleware-based auth.** Route protection lives in the `(app)` layout's
`requireSession()` and in each action. Middleware is a UX convenience that runs on a different
runtime with different data access; making it the gate is how tenant leaks happen.

### 2.4 Defence in depth

Postgres row-level security keyed to a `SET LOCAL app.organization_id` is the natural second
layer, and it was evaluated properly in Phase 1b rather than deferred by reflex. The decision
is **not to adopt it yet**: it needs connection-level session state that Prisma's pooling does
not give a reliable place for, and the three paths that cross tenants by design — signup,
platform admin, and the account-less customer portal — would each need a policy exception.
The reasoning, and the specific conditions that would change the answer, are in
[RLS-EVALUATION.md](RLS-EVALUATION.md). The schema stays shaped for it.

What was built instead, in Phase 1b: the tenant-model list is now verified against
`schema.prisma` by a test, so a new table cannot silently fall out of scope (it found three
that had); the `Organization` row is scoped by `id`; and a static test walks every server
action and route handler insisting on an authorization gate, with public endpoints listed
individually and justified.

---

## 3. Application architecture

- **Next.js 15 App Router, React 19, TypeScript strict** (`noUncheckedIndexedAccess` on).
- **Server Components by default.** Screens load their own data. Client components are the
  exception and are named for what makes them interactive (`filter-tabs.tsx`, `search.tsx`).
- **Server Actions for mutations**, each beginning with `requireSession()` or
  `requirePermission()`.
- **Prisma 6 + PostgreSQL.**
- **Auth.js v5** with a credentials provider and bcrypt (work factor 12). Password hashing
  runs only in the Node runtime.
- **Tailwind CSS v4** with design tokens declared in `@theme` (`src/app/globals.css`).

Layering, strictly one-directional:

```
app/         screens, layouts, server actions   → may import components/, server/, lib/
components/  presentational, no data access     → may import lib/
server/      domain services (ledger, springs,  → may import lib/
             estimates, job queries)
lib/         db, auth, session, tenancy, rbac, money, measure, numbering, audit
```

A screen never talks to `prisma` directly; it uses `session.db` (already tenant-scoped) or a
service in `server/`.

### 3.1 Deployment

Built for Railway: `npm run build` runs `prisma generate` then `next build`; `npm start`
honours `$PORT`. Migrations deploy with `npm run db:deploy`. All configuration is
environment variables (`.env.example` documents every one). No secrets in the repo.

---

## 4. Route and page structure

```
(marketing)/                     dark brand surface, public
  /                              landing, pricing, positioning

(auth)/
  /login  /signup  /forgot-password  /reset-password

(onboarding)/                    progressive; never blocks the dashboard   [Phase 1 remainder]
  /welcome  /company  /profile

(app)/                           light field UI — requireSession() in the layout
  /today                         Today dashboard
  /jobs  /jobs/[id]              list + detail (tabs: Job · Door · Photos · Notes)
  /jobs/[id]/inspection          the walk-the-door checklist               [next]
  /jobs/[id]/estimates/new       Good/Better/Best builder                  [next]
  /jobs/[id]/complete            completion checklist                      [next]
  /customers  /customers/[id]
  /properties/[id]
  /doors/[id]                    Door Passport
  /estimates  /estimates/[id]    presentation + signature
  /invoices   /invoices/[id]
  /inventory                     My Truck · Usage · Restock
  /inventory/items/[id]  /inventory/adjust  /inventory/transfer
  /tools/spring-calculator
  /money                         Money dashboard
  /schedule                      day / week
  /more                          everything not in the tab bar
  /settings/*                    company, profile, team, price book, inventory locations

(portal)/                        customer-facing, no account
  /e/[token]                     view estimate, choose option, sign
  /i/[token]                     view invoice, pay

(platform)/                      PLATFORM_ADMIN only, protected server-side
  /admin  /admin/companies/[id]

api/auth/[...nextauth]           Auth.js handler
```

Mobile navigation is fixed at five destinations — Today, Jobs, Customers, Inventory, More —
and everything else lives behind More. The desktop sidebar exposes the same destinations plus
the screens that only make sense at a desk. It is the mobile product adapted upward, not a
separate admin console.

---

## 5. Inventory transaction architecture

`InventoryTransaction` is an **append-only ledger**. Rows are never updated or deleted; a
miscount is corrected by posting a compensating transaction. Quantities are always positive —
direction is expressed by `fromLocationId` / `toLocationId`, never by the sign of a number.

`StockLevel` is a materialized `(location, item) → quantity` row that exists purely so the
truck screen is one indexed read instead of a sum over the whole ledger. It is written in the
**same database transaction** as the ledger rows that moved it, and
`recomputeStockLevel()` can rebuild it from the ledger at any time — `tests/inventory.test.ts`
corrupts a cached quantity and proves the rebuild restores it.

```
RECEIPT      →  toLocation        (stock arrives from a supplier)
TRANSFER     →  from + to         (warehouse → truck, truck → truck)
CONSUMPTION  →  fromLocation      (parts used on a job)
RETURN       →  toLocation        (unused part comes back)
ADJUSTMENT   →  either            (damage, loss, correction — reason required)
COUNT        →  either            (physical count reconciliation)
```

Posting a move that would drive a location negative is refused by default. An entire batch is
atomic: if the second of two moves fails, the first is rolled back.

Recording parts used at job completion posts `CONSUMPTION` from the technician's own truck, so
`4 → 2` happens without anyone being asked which location.

**Smart restocking** is deliberately just minimum-stock alerts in Phase 1. The usage history
the later forecasting needs is already being written by every `CONSUMPTION` row.

---

## 6. Estimate and invoice architecture

### 6.1 Good / Better / Best

An `Estimate` owns two-to-three `EstimateOption` rows (`GOOD`, `BETTER`, `BEST`, or a single
`STANDARD`), each with its own line items and its own stored totals. The customer picks one on
the technician's phone; `Estimate.selectedOptionId` records the choice.

### 6.2 Two rules that protect the money

**Line items snapshot their price.** `EstimateItem` and `InvoiceItem` copy name, description,
SKU and unit price at the moment the line is added. The `priceBookItemId` foreign key is kept
for reporting and is never re-read to compute money. Raising a price tomorrow cannot change
what a customer agreed to today.

**Signed documents are frozen.** `EstimateVersion` stores a full canonical JSON snapshot plus
a SHA-256 `contentHash`. A `Signature` points at a version id and that hash. Editing an
accepted estimate produces a *new* version; the signed one remains byte-for-byte recoverable.
"The customer approved something different" becomes provable rather than a matter of trust.

### 6.3 Invoices and payments

`Invoice.balanceCents` is persisted (always `total − paid`) so "outstanding" and "past due"
queries stay index-friendly. `Payment` records method, amount and the processing fee, and
carries provider token fields that are null until a real processor is connected.

**No raw card data, ever.** The schema has room for a provider payment id, a card brand and
the last four digits returned by the processor. There is no column a PAN could be written to.
Manual recording (cash, check, card-taken-elsewhere) is the Phase 1 path; the abstraction is
shaped so Stripe slots in behind it.

---

## 7. The Spring Calculator — and what it will not do

This is the feature most likely to hurt someone, so the boundary is drawn in code
(`src/server/springs/calculator.ts`) rather than in a comment.

**Matching — implemented.** A technician enters wire size, inside diameter, length and wind.
The service returns catalog SKUs with exactly those specifications, annotated with live
quantities on their own truck and in every other location, sorted so what they can fit *today*
is first. A higher-cycle spring of the same physical size is returned flagged as an upgrade
rather than hidden. This is a database lookup and involves no engineering judgement.

**Sizing — deliberately not implemented.** Deriving a spring from a door weight, drum and
track radius (IPPT, cycle life, torsion↔extension conversion, high-cycle equivalents) is
withheld. `sizeSprings()` throws `SizingNotAvailableError` with a message that tells the
technician to measure the existing spring instead. There is no placeholder arithmetic anywhere
in the file, and the Spring Calculator screen says plainly that sizing is unavailable.

When verified manufacturer data exists, an implementation of the `SizingEngine` interface is
registered with `registerSizingEngine()` and nothing else in the application changes. The
interface requires a `sourceReference` — which chart, which manufacturer, which revision —
because a spring recommendation that cannot cite its source should not be shown to anyone.

Every measurement taken is saved as a `SpringMeasurement` against the job and door whether or
not anything is sold, so the door's history records what was actually on it.

---

## 8. Risks, ambiguities and things that will bite later

Ordered by how much damage they do if ignored.

1. **Spring sizing is a safety system, not a feature.** A wrong recommendation puts a
   technician under a loaded door. Treat any future sizing engine as safety-critical: verified
   source data, a test suite built from published charts, and a visible citation on screen.
   Resist "close enough" pressure here more than anywhere else in the product.

2. **Photo storage is private, and must stay that way.** Solved in Phase 1a with Cloudflare
   R2: presigned uploads straight from the device, and every read brokered by
   `/api/files/photos/[id]` after a session and tenant check. Never enable public bucket
   access or an `r2.dev` domain — a public object URL would expose one customer's garage
   interior to anyone who guesses it, which is a tenant leak wearing a different hat. The
   development fallback writes to local disk and logs a warning if it is ever reached in
   production.

3. **Offline is under-specified and easy to get wrong.** "Do not destroy unsaved inspection
   data" is achievable now with local draft persistence. True offline sync — queued mutations,
   conflict resolution, photos captured with no signal — is a distributed systems problem and
   a multi-month project. Attempting a half version produces silent data loss, which is worse
   than being honestly online-only. See §9.

4. **Timezones.** Every "today" in the product is *the organization's* today, not the
   server's. `dayBounds()` resolves the zone offset for the specific calendar day; anything
   using `new Date()` and local hours will be wrong for half the day. (The demo seed had
   exactly this bug during development.)

5. **Tax is modelled as a single organization-level rate.** That holds for a single-city
   residential shop and breaks the moment a company crosses a tax jurisdiction. The rate is
   stored per estimate and per invoice, so jurisdiction-based rates can be added without
   touching historical documents — but nothing calculates them today.

6. **Denormalized job costing.** `Job.revenueCents` and friends make the Money dashboard cheap
   but must be recomputed on every payment, refund and parts change. If a code path writes a
   payment without recomputing, the dashboard quietly drifts. This should be centralized in a
   single `recomputeJobCosting(jobId)` service and called from every such path.

7. **"Average ticket" and "estimated gross profit" are not accounting.** Costs are only as
   complete as what was recorded. The UI labels them as estimates. Keep it that way; an owner
   who mistakes this for their books will make a bad decision with it.

8. **Subscription lapse must not destroy a business's data.** `Subscription` carries
   `dataRetentionUntil` and nothing auto-deletes. Read-only access on lapse is the right
   behaviour; deletion should require a deliberate, audited action.

9. **`Photo` uses explicit nullable foreign keys** (`jobId`, `doorId`, `estimateId`, …) rather
   than a polymorphic `(entityType, entityId)` pair. This keeps referential integrity and
   honest cascades at the cost of a column per attachable entity. If that list grows past
   roughly a dozen, revisit — but do not trade it for a polymorphic pair casually.

10. **Several relations are `onDelete: Restrict` on purpose** — a catalog item inside a
    package, a customer with jobs. This is correct for the product and inconvenient for
    tooling; the seed resets the whole database rather than working around the guards.

11. **Estimate/invoice PDF generation** is unbuilt. The versioned JSON snapshot is the right
    input for it, and rendering should read the snapshot, never live rows.

12. **Affiliate attribution must survive the whole signup funnel** — landing page → signup →
    subscription. `Referral` is captured once at signup and never rewritten by later traffic.
    Getting this wrong is unrecoverable; there is no way to reconstruct who referred whom
    after the fact.

---

## 9. What should be postponed from Phase 1, and why

Each of these has schema support already, so none of them is a retrofit later.

| Postponed | Why | What exists now |
| --- | --- | --- |
| Real payment processing | Stripe integration is a project in itself (webhooks, disputes, payouts, 3DS). Manual recording is genuinely usable for a solo operator on day one. | Full `Payment` model, provider token columns, no PAN storage |
| SMS / email sending | Requires a provider account, number provisioning, carrier registration and opt-out handling. Fake sending would be worse than none. | `CommunicationLog`, templates, `ReviewRequest` |
| Verified spring sizing | Safety-critical; needs sourced data and its own test suite. | `SizingEngine` interface, explicit refusal |
| Full offline sync | Distributed systems problem; a half version loses data silently. | Server actions are already idempotent-friendly; drafts are the near-term step |
| QuickBooks | Depends on payments and invoicing being settled first. | Customer/invoice/payment records are clean enough to map |
| Route optimization | The spec says do not overbuild routing. A Directions button covers the real need. | Lat/long columns on `Property` |
| QR Door Passports | Needs printing workflow and a public scan endpoint. | `Door.qrToken` generated today so stickers never need reissuing |
| Drag-and-drop desktop scheduling | Mobile comes first, and the day list is what a technician uses. | Job scheduling fields and statuses |
| Advanced reporting | Needs real usage data to be worth designing. | Ledger and job costing accumulate the inputs now |
| AI anything | The product must be useful without it. | Voice notes store audio; `transcript` stays null until a real provider fills it |
| CSV import | Import mapping UI is a time sink; few day-one customers have clean exports. | Models are import-shaped |
| Postgres RLS | Evaluated in Phase 1b and declined for now — see [RLS-EVALUATION.md](RLS-EVALUATION.md). | Every tenant table has the keying column; a test keeps the scoped list honest |
| Account impersonation | Doing it safely needs audited, time-boxed, consent-recorded access; doing it unsafely is one function that reads any company. | Platform admin reads are already separated from tenant reads |

---

## 10. Implementation phases

**Phase 0 — Foundation (complete, in this branch)**
Schema and migration · tenancy and RBAC · Auth.js login · design tokens and component system ·
inventory ledger · estimate versioning and hashing · spring matching service · Today, Jobs,
Job detail, Spring Calculator, Inventory, Customers, Money, More screens · realistic demo data ·
29 tests covering tenant isolation, the ledger, spring matching and money math.

**Phase 1a — Close the field loop (complete)**
Signup and progressive onboarding · customer/property/door creation · Door Passport screen
with spring and opener history · inspection workflow with one-tap add-to-estimate ·
Good/Better/Best estimate builder with reusable packages · signature capture with version
freezing · transactional job completion · invoice generation from the signed option · manual
payment recording · R2 photo capture. See [PHASE-1A.md](PHASE-1A.md) for what shipped, the
shortcuts taken and what is not production-ready.

**Phase 1b — Make it shippable** *(shipped; see [PHASE-1B.md](PHASE-1B.md))*
Price book management UI · inventory adjust and transfer screens · team invitations · customer
portal links · platform admin dashboard · PDF documents · schedule views · company settings ·
photo management · rate limiting. Deferred from this list: subscription state enforcement,
global search, PWA install prompt, and Postgres RLS (evaluated — see above).

**Phase 1c — Make it sellable** *(shipped; see [PHASE-1C.md](PHASE-1C.md))*
Transactional email with a real provider boundary · password reset · Stripe
Billing for the $39.99 plan with webhook-driven state · subscription
enforcement · customer card payments through Stripe Connect Standard (see
[PAYMENT-MODEL.md](PAYMENT-MODEL.md)) · global search · immutable display
numbers · inspection draft resilience · communication timeline · affiliate
attribution and commission tracking.

**Phase 2 — Money in, messages out**
Stripe payments and Stripe Billing · customer portal (view, select, sign, pay) · SMS and email
with real providers and templates · automations · affiliate commission records.

**Phase 3 — Depth**
Verified spring sizing engine · QR Door Passports · advanced reporting and smart restocking ·
desktop scheduling · CSV import · QuickBooks · commercial features (PM agreements, recurring
inspections, service contracts).

**Phase 4 — Later**
Offline-first sync · native wrappers · AI assistance on top of a product that already works
without it.

---

## 11. Design system

Tokens live in `src/app/globals.css` under Tailwind v4's `@theme`, derived from the approved
concept:

- **Brand blue** `--color-brand-500: #1b8cf0`, with a full 50–900 ramp.
- **Deep navy / charcoal** `--color-navy-*`, used for the marketing surface and app chrome.
- **Light application surface** — `#f4f6fa` ground, white cards, `#e4e9f1` hairlines. The
  logged-in app is light because technicians read it outdoors and in garages.
- **Semantic status, applied consistently everywhere** — green paid/completed/good, amber
  attention/worn/low stock, red failed/broken/past due, blue primary/active/brand. Every chip
  in the product routes through `src/components/ui/status.tsx` so those meanings cannot drift.
- **Restrained radii** (`0.875rem` cards): a square-shouldered industrial product, not a
  rounded consumer toy.
- **`--spacing-tap: 3rem`** — the minimum comfortable target for a gloved hand. No interactive
  control in the field UI is smaller.
- Inputs are never below 16px, because iOS zooms the viewport when they are.
- No webfont fetch. The display stack prefers a condensed industrial face when the platform
  has one and falls back to the system UI face, which is also what makes the app feel native.

Components are built once and reused: `Button` / `ButtonLink` / `CircleAction`, `Card` /
`ListRow` / `Divider` / `EmptyState`, `RevenueTile` / `StatTile` / `DataGrid`, `Chip` and the
status-specific chips, `Field` / `Input` / `Select` / `SegmentedControl` / `Stepper`,
`PageHeader` / `PageBody` / `StickyActions`, `BottomNav` / `SideNav`.

---

## 12. Decisions taken

All five open questions were answered before Phase 1a and are implemented:

1. **Object storage** — Cloudflare R2, private bucket, presigned uploads, authorized reads
   through the application. A local-disk driver mirrors the flow for development.
2. **Tax** — a company default that seeds each document, overridable per estimate and invoice,
   with `taxJurisdiction` reserved for location-based rates later.
3. **Labor cost** — opt-in, off by default; a solo operator is never asked to invent an hourly
   cost for themselves.
4. **Trial** — 14 days, configurable via `TRIAL_DAYS`.
5. **Reviews** — Google is the only destination in the UI; `ReviewDestination` stores providers
   generically so Facebook or Yelp need no migration.

See [PHASE-1A.md](PHASE-1A.md) for how each was built.
