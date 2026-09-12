# Phase 1c — what shipped

Phase 1b made the product usable. Phase 1c makes it sellable: it can email a
customer, take a card, charge $39.99 a month, and restrict an account that
stops paying without ever putting anybody's data at risk.

The target was: *give a garage door owner a link, let them sign up, trial it,
run real jobs, email customers, get paid, and convert to a subscription
without touching the database.* That path now exists end to end and is
exercised by a 49-step live browser walkthrough on every run.

---

## 1. Transactional email

**`src/server/email/`** — a provider boundary with three implementations.

`EmailDriver` is four fields wide: a name, whether it is configured, and
`send()`. Above it nothing knows a provider exists. Below it, **Resend** and
**Postmark** are both implemented — two, deliberately, because one
implementation makes an interface a guess. They use different auth headers,
different request shapes and different success payloads, so the abstraction is
load-bearing rather than decorative. A **console** driver logs the message and
reports `configured: false`, which is what makes an unconfigured deployment
tell the truth instead of silently swallowing mail.

Selection is `EMAIL_PROVIDER`, or whichever credentials are present.

### Delivery states mean what they say

```
QUEUED ──► SENDING ──► SENT ──► DELIVERED   (provider webhook)
              │                └─► BOUNCED  (provider webhook)
              └────────► FAILED ──► (retry restarts at SENDING)
```

A `CommunicationLog` row is written **before** the provider is called. `SENT`
means a provider accepted it and returned an id. `DELIVERED` is reachable only
from `applyDeliveryEvent` — nothing in the send path can set it, and a test
asserts that. Out-of-order events are handled: a stale `delivered` does not
undo a `bounced`.

Every log row carries the organization, the recipient (customer *or* user), the
message type, subject, body, provider, provider message id, attempt count,
timestamps for sent/delivered/failed, an error message, and the related job,
estimate, invoice, invitation or payment.

### Branding

A customer's relationship is with the garage door company. So:

- The **From** display name is the company: *ABC Garage Doors*.
- **Reply-To** is the company's own inbox, so replies never reach us.
- The subject says *"Your estimate from ABC Garage Doors is ready"*.
- The page carries their logo and contact details.
- *Powered by Garage Door HQ* appears once, small, at the bottom.

The envelope address stays on a domain we control and have authenticated.
Sending as `office@abcgaragedoors.com` without their DNS would fail SPF/DKIM
and land in spam; the display name is what recipients actually read. Per-company
domain verification is Phase 1d.

Company-typed names are HTML-escaped — there is a test that puts a `<script>`
tag in a company name.

### Failure handling

A send failure never rolls back what it was announcing. An estimate that could
not be emailed is still an estimate. The UI shows the failure, offers the link
to copy, and offers a retry that reuses the same log row. Nobody is told a
message arrived that did not.

## 2. Password reset

`/forgot` → generic response → emailed link → `/reset/[token]` → new password →
`/login`.

- **No enumeration.** The action returns the same state whether or not the
  address exists, does the same work, and says the same thing. Rate limits are
  applied to both the address and the mailbox, and hitting one still does not
  change the answer.
- 32 random bytes, SHA-256 stored, one hour, single use.
- Consumed by a conditional `updateMany`, so two concurrent submissions cannot
  both use it — proven by a test that races them.
- Requesting a new link revokes the outstanding one; completing a reset revokes
  every sibling token and bumps `sessionEpoch`, which invalidates every session
  the account had.

## 3. Stripe Billing

One plan. $39.99/month. `src/server/billing/`.

- Checkout and the hosted billing portal. **No card field exists anywhere in
  this application** and none ever will.
- **Stripe is the source of truth.** Nothing is activated because a browser
  reached a success URL. The return page re-reads from Stripe *and* checks the
  Checkout session's `client_reference_id` belongs to this company, so pasting
  someone else's session id achieves nothing.
- `syncFromStripe` is idempotent and is the only writer of paid-subscription
  state.

### Webhooks

`/api/webhooks/stripe`, and three properties in order:

1. **Signature first.** The raw body is read as text and verified before it is
   parsed as anything. A bad signature is 400 — Stripe should not retry, since
   it will not become good.
2. **Idempotent.** Every event id is inserted under a unique constraint before
   any business logic runs. A replay stops there. Two concurrent deliveries
   race on the index and exactly one wins.
3. **Auditable.** The payload and outcome are stored, so "why did this account
   change state at 3am" has an answer.

Processing failures return 500 so Stripe retries with backoff. Losing a
subscription change because the database blinked is far worse than being called
again.

`incomplete` and `incomplete_expired` leave an account exactly as it was: the
first payment never succeeded, so the subscription never started, and
cancelling a trialing account over an abandoned checkout would be wrong.

## 4. Subscription enforcement

`accessStateFor` is a pure function of the subscription row and the clock — no
I/O, so the rules can be read and tested directly. 20 tests.

| State | Access | What they see |
|---|---|---|
| **Trial** | Full | Nothing for the first nine days; a countdown in the last five |
| **Active** | Full | Nothing |
| **Past due** | Full | "Your last payment did not go through", with a way to fix it |
| **Expired trial** | Read-only | "Your data is safe. Activate for $39.99/month." |
| **Cancelled** | Read-only | Same, in its own words |
| **Complimentary** | Full | Nothing |

**Where the line falls on a read-only account.**

*Blocked* — starting new work: customers, properties, doors, jobs, quoting
anything, moving inventory, inviting a team member.

*Allowed* — finishing work that already exists: moving a job through its
statuses, completing it, signing an estimate already presented, recording a
payment on an invoice already sent. Plus reading everything, editing settings,
and opening billing.

That second list is a judgement call and worth stating plainly. A trial can end
at 9am while a technician is standing in someone's garage halfway through a
spring replacement. Refusing to let them finish would strand a real job, leave
the inventory ledger wrong, and punish a customer who has done nothing. The
restriction exists to stop *new* business being run for free; letting the last
job close does not undermine it. **If you would rather completion were blocked
too, it is one line in `access.ts`.**

Nothing in any state deletes anything. `Subscription.dataRetentionUntil` exists
and nothing reads it — retention is a decision to be made deliberately later,
not a timer running in the background.

Complimentary access outranks Stripe: a comp is a person's decision, and a
`canceled` event does not override it. Stripe's ids are still recorded.

## 5. Customer payments — Stripe Connect Standard

The full reasoning is in [PAYMENT-MODEL.md](./PAYMENT-MODEL.md). In short:

Each company connects **its own** Stripe account. Charges are **direct charges
on that account**, so funds settle with them, the cardholder's statement says
their name, and refunds and disputes are theirs. Garage Door HQ is not the
merchant of record for a garage door repair, holds nobody's money, and is not
doing money transmission.

**No application fee**, and the plumbing is left unused on purpose: a
percentage of every repair is exactly the kind of charge that *"$39.99/month,
everything included"* tells people they are escaping.

An invoice is marked paid by the **webhook**, never by the browser reaching a
success page. `Payment` is unique on `(providerName, providerIntentId)`, so a
duplicate delivery records one payment, moves the balance once, and sends one
receipt. Fifteen tests cover this, including two simultaneous deliveries.

The Pay button appears only while `chargesEnabled` is true. A half-onboarded
account is never shown to a customer, who would hit an error at the worst
possible moment. Manual cash, check and card recording is untouched and never
depends on any of this.

Refunds issued in the company's own Stripe dashboard flow back through
`charge.refunded` and rebuild the invoice from its payments — idempotently,
because Stripe reports a cumulative total.

## 6. Global search

`/search`, and a tap target on Today. Groups by type across customers,
properties, doors, jobs, estimates, invoices and inventory.

It reads the query rather than just matching it:

- `330-555-1212` → a phone number. Matched in SQL with punctuation stripped,
  because `(330) 555-1212` stored does not `LIKE` `3305551212` typed.
- `.225 2 27` → spring measurements, matched against real `SpringSpec` rows
  within a caliper's tolerance.
- `LiftMaster 87504` → every token has to land somewhere, so a make in one
  column and a model in another still finds the Door Passport.
- `INV-1043` → that invoice. **Not** estimate 1043 — the prefix is part of the
  identifier, not decoration.

Four tests exist purely to prove nothing crosses a tenant boundary, including
through the spring-measurement path.

## 7. Immutable display numbers

`displayNumber` is written at creation on customers, doors, jobs, estimates and
invoices, unique per organization, and frozen into the signed estimate
snapshot. Company settings now control the prefix — **for future records
only**. An invoice a customer is holding keeps the identifier it was issued
under.

Making `displayNumber` a required field on the formatter's type meant the
compiler found all eleven queries that would otherwise have silently rendered
the wrong prefix.

## 8. Offline resilience — inspection

`src/lib/local-draft.ts` and `useFieldDraft`.

Inspection notes are written to `localStorage` as they are typed and to the
server on blur. If the server call fails, the text stays on screen, stays on
the device, and is shown as unsynced with a Retry. The local copy is cleared
**only** once the server confirms.

A restored draft is offered only when the server has not moved on since it was
taken — if the office edited the same inspection meanwhile, the server wins.
Silently overwriting somebody's change with a stale local one is the failure
mode this check exists to prevent.

Deliberately **not** a sync engine: no mutation queue, no conflict resolution.
What it guarantees is that nothing typed disappears silently.

## 9. Review requests

Queued on job completion, one per job (enforced by a unique index on `jobId`),
sent a couple of hours later — and only once the invoice is settled. Nobody
wants to be asked for five stars while they still owe money.

Company-editable subject and body, their own Google link snapshotted onto the
request so a later settings change cannot rewrite what was sent, a manual Send
from the job screen, retry with a cap of three attempts, and a communication
log entry. The queue is nudged from ordinary traffic rather than a worker
process, the same pattern as the storage sweep.

## 10. Communication timeline

The customer profile now shows one history that distinguishes **created**,
**sent**, **delivered**, **opened**, **signed**, **paid** and **completed** as
separate events with separate colours — because the next thing a company does
about "sent but never opened" is different from "delivered and ignored".

## 11. Onboarding and the setup checklist

Onboarding is still three screens. What is left is a checklist on Today,
**computed from real state** rather than stored as ticked boxes — a stored
checklist drifts when somebody deletes their logo, and a new step makes every
existing account look finished. It is collapsed by default, never blocks
anything, and can be dismissed for good.

## 12. Error experience

`src/lib/errors.ts`. A garage door owner sees only wording this codebase wrote
on purpose, enforced by an **allowlist** of error names rather than a denylist,
because the failure mode of guessing wrong is leaking database internals. A
test walks the source, finds every `this.name = '...'`, and fails if one is
missing from the list or the deliberate exclusions.

Prisma codes are mapped to sentences. Stripe errors get card-decline wording
where that is genuinely the most useful thing to say, and nothing specific
otherwise. Next.js redirects are re-thrown rather than swallowed, so a working
redirect never becomes "something went wrong".

## 13. Platform admin and affiliates

The company view now shows subscription status, trial end, period end, started,
cancelled, cancel-at-period-end, past-due-since, MRR, the card summary, and the
Stripe customer and subscription ids. `/admin/affiliates` shows each partner's
referred companies, how many are paying, attributed MRR, commission rate,
estimated monthly commission, owed and paid.

Trials and complimentary access are set here. Stripe-managed state is not, and
the screen says so — mutating it from admin would create a disagreement with
Stripe that Stripe would win.

## 14. Affiliate attribution

`?ref=CODE` is captured by middleware on first touch into an httpOnly cookie
that lasts 60 days, and read when the company is created. **First touch wins**:
a second partner's link cannot claim somebody already attributed.

A company cannot change its own attribution — there is one `Referral` row per
organization under a unique constraint, and nothing in the application updates
it. Commission is recorded per paid billing period, keyed by
`(subscriptionId, periodStart)`, so a replayed webhook cannot owe a partner a
second month. **Nothing is ever paid automatically**; the gap between "owed"
and "paid" is where a person decides.

---

## Architecture changes

1. **`src/server/email/`** — driver interface, three providers, branding,
   templates, and the send service that owns delivery state.
2. **`src/server/billing/`** — Stripe client, access rules, subscription
   service, webhooks, Connect, customer payments, commissions.
3. **`src/server/communications/`** — dispatch, review requests, timeline.
4. **`src/server/search/`** — query parsing and the cross-entity search.
5. **`src/middleware.ts`** — first-touch referral capture. Deliberately does no
   authentication: auth is resolved per request from the database, and trusting
   an edge-evaluated token for it would be a downgrade.
6. **`src/lib/errors.ts`** — the allowlist that decides what a user may read.
7. **`guarded()` in `src/lib/form.ts`** — turns a gate's throw into a form
   state, so a restricted account sees a sentence instead of a 500.
8. **`StickyActions` reserves its own space** — it now renders a spacer, so no
   page can leave its last element trapped under the fixed bar.
9. **New tables** — `WebhookEvent`, `PaymentAccount`; extended
   `CommunicationLog`, `Subscription`, `Payment`, `ReviewRequest`,
   `PasswordResetToken`, and `displayNumber` on five models.

Nothing from Phase 1a or 1b was refactored to make this fit.

---

## Still not production-ready

- **Provider delivery webhooks are not wired.** `applyDeliveryEvent` exists and
  is tested; the route that calls it does not. Until then, messages reach
  `SENT` and stop — which is honest, just less informative than it could be.
- **Per-company sending domains.** Mail goes out on the platform's domain with
  the company's display name. Real from-domain sending needs per-company DNS
  verification.
- **No refund UI.** The data model and the Connect call are ready; moving money
  back out of somebody's balance deserves its own confirmation design.
- **No SMS.** Modelled, not built.
- **No worker process.** Review requests and storage sweeps ride on ordinary
  traffic. Fine at this scale, not forever.
- **Retention after cancellation is undefined.** The column exists; no policy
  is implemented and nothing deletes.
- **Dunning is Stripe's.** No in-app escalation beyond the banner.
