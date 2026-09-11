# Phase 1a — what shipped, what it does, and what is not production-ready

Phase 1a closes the field loop: a technician can take a call, build the customer
and their door, inspect it, quote Good/Better/Best, get it signed, do the work,
and leave with the parts deducted, the passport updated, the invoice raised and
the payment recorded.

This document is the honest account of that — including the shortcuts.

---

## Decisions applied

| # | Decision | How it was implemented |
| --- | --- | --- |
| 1 | Cloudflare R2, private | `src/server/storage/*`. Presigned PUT direct from the device; every read goes through `/api/files/photos/[id]`, which checks the session and the tenant first. No public bucket, no public URL. A local-disk driver mirrors the same two-phase flow for development. |
| 2 | Company default tax, overridable per document | `Organization.defaultTaxRateBps` seeds `Estimate.taxRateBps` at creation; the document then owns it. `taxRateOverridden` records a human change and `taxJurisdiction` is the hook for location-based rates later. Invoices copy the rate from the signed estimate, never from settings. |
| 3 | Labor cost optional, off by default | `Organization.laborCostEnabled` defaults false. `recomputeJobCostingTx` only adds labor when it is on and an hourly figure is set. A solo operator's own time is simply not a cost. |
| 4 | 14-day configurable trial | `TRIAL_DAYS` env, default 14, applied by `provisionOrganization`. |
| 5 | Google only in the UI, generic underneath | `ReviewDestination` with a `ReviewProvider` enum (Google, Facebook, Yelp, BBB, Angi, Other). Settings offers Google; adding another needs no migration. Review requests snapshot the URL at send time. |

---

## The workflows

**Signup and onboarding** — account (name, email, password) → company (name,
phone, ZIP, timezone resolved in the browser) → company size. The account is
usable after the second step. Provisioning creates numbering sequences, the
owner's membership, inventory locations, garage-door job types, a starter price
book, reusable packages and the inspection remedy map, in one transaction.

**Solo mode** — one member means one location called "My Truck", assigned to
them. The job form shows no technician picker, inventory shows no location
picker, and completion deducts from their truck without asking. Choosing a team
size adds a warehouse and renames the truck.

**Customer → property → door** — creating a customer with an address drops
straight into the Door Passport form; creating the door drops into the passport.
The passport records size, manufacturer, model, serial, material, track, weight
and warranty as typed columns, plus current spring system and opener.

**Inspection → estimate** — this is the piece the spec singled out. Opening the
screen starts the inspection with all 23 components. Each row has five one-tap
statuses. Marking a component Worn/Needs attention/Failed reveals the remedies
that fix it, priced. Where a component has a full tiered set — springs —
a single **Add Good / Better / Best** button puts all three options on the
estimate, itemized. Findings that have been quoted show a "Quoted" chip.

**Good / Better / Best** — each tier is an `EstimateOption` with its own lines
and its own stored totals. Packages are reusable options; dropping one in copies
its components as individual priced lines so the customer sees itemization, not
a black box. One option carries the recommendation. Adding the same catalog line
twice increments its quantity rather than listing it twice.

**Signature** — presenting freezes a version; signing freezes another and stores
its SHA-256 content hash on the signature. After that the estimate is locked:
`assertEditable` refuses every mutation. Signing twice is refused.

**Completion** — one transaction: parts to the ledger, spring system replaced
with the previous one preserved as historical, Door Passport events written,
invoice generated from the signed option at the signed tax rate, job costing
recomputed, optional completion signature, review request queued. Anything that
fails rolls all of it back — `tests/completion.test.ts` proves it by driving a
part quantity past what is on the truck and asserting that nothing at all was
written.

**Door Passport history** — replacing springs marks the old system
`isCurrent: false` with a `replacedAt`, creates the new one from the spring SKUs
actually fitted (so nothing is re-keyed), and writes one `SPRING_REPLACED` event
whose detail reads `1 × .225 x 2" x 27" · Left Hand · 10,000 cycle; … → …
25,000 cycle`. The passport shows current, previous, and a timeline.

**Invoice and payment** — the invoice copies the signed option's lines and rate.
Manual payment recording updates balance, status, `paidAt` and the job's costing
in one transaction. Overpayment is refused. No card number is ever collected:
"Card" means it was taken elsewhere and is being written down.

---

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run build` | clean, 37 routes |
| `npm test` | 65 tests, 9 files, all passing |
| Live end-to-end run | 16 steps, all passing |

The end-to-end run (`scripts/e2e-flow.mjs`) drives a real Chromium at phone
width against the running app and a real database: sign in → new customer →
Door Passport → job → On My Way/Arrived/Start → inspection with tiered add →
estimate → present → select → sign on the canvas → complete → invoice → payment
→ verify the passport history and the inventory ledger. Screenshots land in
`e2e-screenshots/`.

Three real bugs were found by running it, and fixed:

1. The demo seed's numbering sequences started at or below numbers the seed
   itself had already used, so the first customer or door a user created
   collided on `(organizationId, number)`.
2. The signature pad called `setPointerCapture` unguarded; a rejected capture
   would have lost a stroke. It is now best-effort.
3. `next lint` shipping bcrypt to the browser: the signup form imported
   `PASSWORD_MIN_LENGTH` from the hashing module, putting bcryptjs in the client
   bundle (144 kB → 3.7 kB after splitting the constant out).

---

## Shortcuts taken

Each of these is a deliberate trade, not an oversight.

1. **The starter price book ships with suggested prices.** Shipping an empty
   catalog would mean a technician's first estimate is a blank screen in a
   customer's driveway. The numbers are plausible, not market rates. Onboarding
   and the Price Book screen both say so in plain language. There is no price
   editing UI yet, so changing them means the database.

2. **Photo storage falls back to local disk when R2 is not configured.** The
   fallback runs the identical two-phase flow with HMAC-signed upload URLs, so
   the code path is the same in both. It logs a warning in production. A
   container filesystem is ephemeral: set `R2_*` before real photos are taken.

3. **The inspection-to-estimate link is one id.** `InspectionItem.estimateItemId`
   points at the first line a remedy created. It drives the "Quoted" chip and
   nothing else. Adding several remedies to one finding leaves only the latest
   linked; a join table would be the honest fix if that link ever needs to mean
   more.

4. **`buildSpringPair` assumes a mirrored pair.** Entering one measurement with
   quantity 2 on the door form writes a left-hand and a right-hand spring. That
   is the residential norm and it is what a technician means, but it is an
   assumption, and it is only made on manual entry — completion reads the wind
   from the SKU actually fitted.

5. **Signature images are written before their transaction.** Object storage
   cannot join a database transaction. A failed sign-off can therefore leave an
   orphaned image; the alternative is a signature row pointing at nothing, which
   is worse. Orphan cleanup is not built.

6. **Job costing labor uses wall-clock time** between `startedAt` and
   `completedAt` when labor costing is enabled. A job left open overnight
   overstates it. Only affects the estimated-profit figure, which is labelled as
   an estimate throughout.

7. **The completion screen's stock warning is advisory.** It warns when parts
   exceed what is on hand; the server is what actually refuses, inside the
   transaction. That ordering is correct — but the two can disagree briefly if
   another technician moves stock in between.

8. **The E2E script needs a fresh seed per run**, because it consumes real
   inventory. A second run is correctly refused for insufficient stock.

---

## Not production-ready

- **No price book editing UI.** Prices, packages and remedies can only be
  changed in the database. This is the largest usability gap in Phase 1a.
- **No team management.** Invitations exist in the schema; there is no screen to
  send one, so a company is one user until Phase 1b.
- **No customer portal.** `PortalLink` is modelled; nothing issues or serves one.
  Estimates are signed on the technician's phone only.
- **No PDF generation** for estimates or invoices. The versioned snapshot is the
  right input for it when it is built.
- **Nothing is actually sent.** No SMS, no email. Review requests are queued in
  the database and never delivered. `CommunicationLog` is a schema, not a sender.
- **No real payments.** Manual recording only, as designed for this phase.
- **No schedule screen.** Jobs are scheduled on creation and seen on Today; there
  is no day or week calendar view.
- **No offline support.** A dropped connection mid-inspection loses unsaved
  status taps — status changes are saved as they happen, but a half-typed note
  is not persisted until blur.
- **Voice notes** are modelled and unreachable from the UI.
- **Spring sizing remains refused** by design. Matching against measured springs
  is the only thing the calculator does, and the screen says so.
- **Photo deletion leaves objects** if the storage call fails after the row is
  deleted; it warns and moves on rather than failing the technician's action.
- **No rate limiting** on auth or upload endpoints yet.
- **Postgres RLS is still not enabled.** Tenant isolation is enforced by
  `tenantDb` and server-side session resolution, with tests; RLS remains the
  planned second layer.

---

## Next: Phase 1b

Price book editing · team invitations · global search · customer portal ·
platform admin dashboard · subscription state enforcement · schedule views ·
PDF documents · rate limiting · Postgres RLS.
