# Pricing: how to change it

Every price and the trial length live in **`src/lib/pricing.ts`**. Nothing else
in the repository contains a price. If you want to change what the public site
advertises, that is the only file to edit.

```ts
export const STANDARD_MONTHLY_CENTS = 3_999   // $39.99/month
export const STANDARD_ANNUAL_CENTS  = 39_900  // $399/year
export const FOUNDING_ANNUAL_CENTS  = 24_900  // $249/year
export const FOUNDING_OFFER_ACTIVE  = true
export const TRIAL_DAYS             = 7
```

---

## The one thing to understand first

**The advertised price and a customer's subscription are different things.**

| | Where it lives | What changes it |
|---|---|---|
| What the website says | `src/lib/pricing.ts` | Editing that file and deploying |
| What a customer is charged | A Stripe Price, on their Stripe subscription | A deliberate change in Stripe |
| What this app records them paying | `Subscription.priceCents` | `syncFromStripe`, from Stripe's own number |

`syncFromStripe` writes `priceCents` from `subscription.items.data[0].price.unit_amount`
— Stripe's figure, never this repository's. So **lowering `FOUNDING_ANNUAL_CENTS`
tomorrow changes the shop window and nothing else.** Founding Members stay on
the Stripe price they bought until somebody migrates them in Stripe on purpose.

`tests/pricing.test.ts` holds that line. If a future change ever made the
advertised price leak into an existing subscription, that suite fails.

---

## Changing each thing

### The standard monthly price ($39.99)

1. Edit `STANDARD_MONTHLY_CENTS` in `src/lib/pricing.ts`.
2. Deploy.

That is the struck-through price on the site. It only becomes a price anybody
pays if you also turn the founding offer off (below), in which case create a new
monthly Price in Stripe at the new amount and point
`STRIPE_PRICE_ID_STANDARD` at it.

### The standard annual price ($399)

1. Edit `STANDARD_ANNUAL_CENTS`.
2. Deploy.

Display only — it is the second struck-through price and nothing charges it.

### The Founding Member price ($249)

This one is charged, so it is two steps and they must agree.

1. **In Stripe**, on the existing `Garage Door HQ` product, add a new
   **Recurring / Yearly / USD** Price at the new amount. Do not edit the old
   Price — Stripe prices are immutable, and editing is not offered for a reason:
   anyone already on it stays on it.
2. Copy the new `price_...` into `STRIPE_PRICE_ID_FOUNDING_ANNUAL` on the
   production environment (and the test-mode equivalent on staging).
3. **In the repository**, edit `FOUNDING_ANNUAL_CENTS` to match.
4. Deploy.

If steps 2 and 3 disagree, the site advertises one number and Checkout charges
another. There is no automatic check for that — Stripe is a different system —
so do them together, and confirm on `/admin/system` that Stripe Billing reports
the price you expect.

Existing Founding Members are unaffected by all of this.

### The trial duration (7 days)

1. Edit `TRIAL_DAYS`.
2. Deploy.

`trialEndsAt` is computed once at signup and stored, so this applies to accounts
created afterwards. **Every trial already running keeps the end date it was
given.** That is deliberate: shortening the trial should not retroactively end
somebody's.

`TRIAL_DAYS` as an environment variable overrides the file. Use it on staging
(a one-day trial is useful for testing expiry); leave it unset on production.

### Turning the Founding Member offer off

1. Set `FOUNDING_OFFER_ACTIVE = false`.
2. Deploy.

Everything follows automatically: the struck-through prices disappear, the
"Founding Member" labels disappear, the price shown becomes
`STANDARD_MONTHLY_CENTS` per month, and Checkout asks for
`STRIPE_PRICE_ID_STANDARD` instead of the annual price. No page or component
needs touching.

Make sure `STRIPE_PRICE_ID_STANDARD` is set and current before you do this, or
Checkout will have no price to use.

---

## What reads this file

Marketing — the homepage hero and pricing section, `/pricing`, `/faq`, the
footer, every call to action.

The application — the activation button, the trial-ending notice, the
expired-trial and cancelled messages, the billing screen, the onboarding
"then $X" line, the More screen, and the price a new signup's subscription row
is created with.

Checkout — `stripePriceIdForOffer()` resolves the Stripe Price id for whatever
is currently advertised.

System Readiness — `/admin/system` reports it as **Wrong** when the site
advertises an annual offer and no annual price id is configured, because
Checkout would silently charge the monthly price instead.

---

## What not to do

- **Do not edit a Stripe Price in place.** Create a new one.
- **Do not write a price into a component.** It will be the one that still says
  $249 in a year.
- **Do not change `Subscription.priceCents` by hand** to "fix" a customer's
  price. The next webhook from Stripe overwrites it. Change it in Stripe.
- **Do not advertise a price with no Stripe Price behind it.** Readiness will
  tell you, but only if somebody looks.
