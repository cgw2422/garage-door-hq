# Customer payments: the model, and why

**Decision: Stripe Connect with _Standard_ accounts. Each garage door company
connects its own Stripe account. Garage Door HQ is a platform, never the
merchant of record for a garage door repair.**

This is a legal and financial decision before it is a technical one, so it is
written down before any code depends on it.

---

## The three parties

```
Garage Door HQ            the software platform. Bills $39.99/month.
      │
      ▼
Garage door company       ABC Garage Doors. The merchant. Does the work.
      │
      ▼
Their customer            Rachel. Pays ABC for a spring replacement.
```

The $39.99/month subscription and the customer's $427 invoice are two entirely
separate flows. They share nothing but this codebase:

| | Subscription | Customer invoice |
|---|---|---|
| Who pays | The garage door company | The company's customer |
| Who receives | Garage Door HQ | The garage door company |
| Stripe account | Garage Door HQ's platform account | The company's own connected account |
| Merchant of record | Garage Door HQ | The garage door company |

## Why not "just take the payment"

The technically easiest model — Garage Door HQ charges Rachel's card on its own
Stripe account and pays ABC later — would make Garage Door HQ the merchant of
record for every garage door repair in the country. That means:

- **It is money transmission.** Taking funds from one party to pay another is
  regulated. In the US it requires state-by-state money transmitter licensing,
  or operating under someone else's licence. Stripe's Connect *Custom* and
  destination-charge models exist partly so platforms do not have to become
  one, but the liability follows who the cardholder's statement names.
- **Every dispute becomes Garage Door HQ's.** A chargeback is argued by the
  merchant of record. Garage Door HQ was not in the garage, has no photos of
  the finished door, and cannot testify that the spring was replaced. It would
  lose disputes it has no business defending.
- **Every refund becomes Garage Door HQ's cash-flow problem.** Refunding a $427
  invoice after the money was already paid out to ABC means Garage Door HQ is
  out of pocket until ABC returns it.
- **Tax reporting lands on the wrong entity.** 1099-K reporting follows the
  account that received the funds.
- **The float is a balance-sheet liability.** Holding other people's money,
  even briefly, is a thing regulators care about.

None of that is worth avoiding a Connect onboarding screen.

## Standard versus Express

| | **Standard** (chosen) | Express |
|---|---|---|
| Who owns the Stripe account | The garage door company. They have their own dashboard, their own login, their own relationship with Stripe. | The platform provisions it; the company gets a limited dashboard. |
| Who signs Stripe's terms | The company, directly with Stripe. | The company, but through the platform's agreement. |
| Merchant of record | The company. | The company, but the platform carries more responsibility. |
| Disputes and refunds | Handled by the company in their own dashboard. Stripe debits their balance. | Platform is more involved; the platform is liable for negative balances. |
| Platform liability for losses | Minimal. | The platform is on the hook for negative balances on connected accounts. |
| Onboarding | Stripe-hosted OAuth. A company that already uses Stripe connects in about thirty seconds. | Stripe-hosted form; the platform owns more of the identity verification relationship. |
| Branding | Stripe's, mostly. | More platform-branded. |
| Payout schedule control | The company's. | The platform can control it. |

**Standard wins for this product** because:

1. Garage door companies are real businesses that often already take cards. Many
   already have a Stripe account, or a processor they can move from. Standard
   lets them keep their own relationship rather than adopting ours.
2. It puts disputes, refunds and negative balances where the work happened.
   This is the whole point of the decision.
3. It is the least-liability option for a one-person platform at pre-revenue
   scale. Express's negative-balance liability is a real risk with no upside
   here.

The cost of Standard is less control: Garage Door HQ cannot set their payout
schedule, cannot fully brand the Stripe experience, and sees less detail. All
acceptable.

## How the money moves

**Direct charges on the connected account.** The `PaymentIntent` is created
*on* the connected account (`stripeAccount: acct_xxx`), not on the platform
account with a transfer.

```
Rachel's card
     │  charge created on acct_ABC
     ▼
ABC Garage Doors' Stripe balance      ← funds settle here, never touching us
     │  Stripe's own payout schedule
     ▼
ABC's bank account
```

Consequences, all intended:

- **Funds never touch a Garage Door HQ balance.** There is no float and no
  money transmission.
- **The cardholder's statement says ABC Garage Doors**, not Garage Door HQ.
- **Stripe's processing fee (2.9% + 30¢ in the US) is deducted from ABC's
  balance**, by Stripe, on ABC's account. Garage Door HQ never sees it and
  never marks it up.
- **Refunds are issued by ABC**, from their balance, in their dashboard — or
  through this app once refund UI ships, acting on their account.
- **Disputes are ABC's**, argued with ABC's evidence, debited from ABC's
  balance.
- **Stripe reports ABC's volume to ABC**, on ABC's tax identification.

## Application fee

**Garage Door HQ takes no application fee, at launch.**

Connect supports `application_fee_amount` on a direct charge, which would route
a slice of every repair to the platform. The plumbing is left in place —
`PaymentAccount.applicationFeeBps` exists and defaults to `0` — but it is not
charged, because:

- The product's promise is *"$39.99/month. Everything included. No per-user
  fee. No technician fee."* A percentage of every job is exactly the kind of
  charge that promise tells people they are escaping.
- A garage door company doing $40k/month would pay more in application fees
  than in subscription. That converts a simple, defensible price into a
  negotiation.
- Taking a cut of the transaction invites a harder look at the platform's role
  in it, which is the thing this whole design is arranged to avoid.

If it is ever turned on it should be a stated, separate, opt-in thing — not a
silent basis-point skim.

## Onboarding requirements

To take customer payments, a garage door company must:

1. Open **Billing → Customer Payments** in settings (owner only).
2. Click **Connect Stripe**. They are sent to Stripe's hosted OAuth flow.
3. Either sign in to an existing Stripe account or create one, providing the
   business details Stripe requires: legal entity, EIN or SSN, address, bank
   account for payouts.
4. Return to the app. The webhook and a status refresh record
   `chargesEnabled` and `payoutsEnabled`.

**Until `chargesEnabled` is true, the Pay Invoice button does not appear on the
customer portal.** A half-onboarded account must never be shown to a customer
as a payment option — they would hit an error at the worst possible moment.
Manual payment recording (cash, check, other) is always available and never
depends on any of this.

A company that never connects Stripe loses nothing: they run the whole product
and record payments by hand, exactly as in Phase 1b.

## What is recorded here

A payment is recorded from **the webhook**, never from the browser reaching a
success page. The relevant guarantees:

- `Payment` carries `providerName` + `providerPaymentId` under a unique
  constraint, so a webhook delivered twice cannot create two payments.
- `WebhookEvent` records every event id under a unique constraint, so a replay
  is recognised before any business logic runs.
- The invoice balance is recomputed from its payments inside the same
  transaction that records one.
- The success page the customer lands on reads the invoice; if the webhook has
  not arrived yet it says the payment is being confirmed rather than claiming
  it is paid.

## Deliberately not built

- **Automatic refunds from the app.** The data model carries `refundedCents`
  and the Connect call is one function away, but a refund moves real money out
  of someone else's balance and deserves its own confirmation design.
- **Payouts, balance views, or Stripe dashboards inside the app.** The company
  has their own Stripe dashboard. Re-creating it badly helps nobody.
- **Saving customer cards.** No stored payment methods for a company's
  customers. One invoice, one payment.
- **ACH / bank debit.** Card only at launch; the Connect architecture does not
  change when it is added.
