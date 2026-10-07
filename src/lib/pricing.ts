import { formatCents } from './money'

/**
 * What Garage Door HQ costs, in one place.
 *
 * Every price a visitor or a customer reads — the marketing site, the pricing
 * page, the FAQ, the trial banner, the activation button, the restriction
 * notice — is derived from this file. Changing the launch offer is editing the
 * constants below, not searching the repository for `$249`.
 *
 * ## The distinction that matters
 *
 * **This file is the advertised offer. It is not anybody's subscription.**
 *
 * A company that subscribes is charged by Stripe, against a Stripe Price id,
 * and `syncFromStripe` writes that subscription's `priceCents` from what
 * Stripe reports — never from here. So lowering `FOUNDING_ANNUAL_CENTS`
 * tomorrow changes the shop window and nothing else: existing Founding Members
 * stay on the Stripe price they actually bought until somebody deliberately
 * migrates them in Stripe. `tests/pricing.test.ts` holds that line.
 *
 * The one place the two meet is Checkout, which needs the Stripe Price id for
 * whatever is currently on offer. That mapping is `stripePriceIdForOffer()`,
 * and it reads environment variables, because a price id is deployment
 * configuration: test-mode ids on staging, live-mode ids on production.
 */

export type BillingInterval = 'month' | 'year'

/** The regular price, shown struck through to establish what the offer is off. */
export const STANDARD_MONTHLY_CENTS = 3_999

/** The regular annual price, also shown struck through. */
export const STANDARD_ANNUAL_CENTS = 39_900

/** The launch offer. */
export const FOUNDING_ANNUAL_CENTS = 24_900

/**
 * Whether the Founding Member offer is on.
 *
 * Set this to `false` and every surface falls back to standard pricing: the
 * struck-through prices stop being struck through, the "Founding Member"
 * labels disappear, and Checkout asks for the standard price id instead. No
 * page needs to know it happened.
 */
export const FOUNDING_OFFER_ACTIVE = true

/** Free days before the first charge. Applies to accounts created from now on. */
export const TRIAL_DAYS = 7

export const CURRENCY = 'USD'

/** What a new subscriber is billed on. Annual while the founding offer runs. */
export const BILLING_INTERVAL: BillingInterval = FOUNDING_OFFER_ACTIVE ? 'year' : 'month'

/**
 * The offer as the rest of the application should think about it.
 *
 * One object rather than a dozen imported constants, so a component takes the
 * offer and renders it without deciding anything.
 */
export interface Offer {
  /** True while the launch offer is running. */
  isFounding: boolean
  /** What a new subscriber actually pays. */
  priceCents: number
  /** The interval that price covers. */
  interval: BillingInterval
  /** Prices to show struck through. Empty when there is no offer to contrast. */
  strikethroughCents: { cents: number; interval: BillingInterval }[]
  trialDays: number
  currency: string
  /** "Founding Member" or "Standard", for a label above the price. */
  label: string
}

export function currentOffer(): Offer {
  if (!FOUNDING_OFFER_ACTIVE) {
    return {
      isFounding: false,
      priceCents: STANDARD_MONTHLY_CENTS,
      interval: 'month',
      strikethroughCents: [],
      trialDays: TRIAL_DAYS,
      currency: CURRENCY,
      label: 'Standard',
    }
  }
  return {
    isFounding: true,
    priceCents: FOUNDING_ANNUAL_CENTS,
    interval: 'year',
    strikethroughCents: [
      { cents: STANDARD_MONTHLY_CENTS, interval: 'month' },
      { cents: STANDARD_ANNUAL_CENTS, interval: 'year' },
    ],
    trialDays: TRIAL_DAYS,
    currency: CURRENCY,
    label: 'Founding Member',
  }
}

/** "/month" or "/year". */
export function intervalSuffix(interval: BillingInterval): string {
  return interval === 'year' ? '/year' : '/month'
}

/**
 * "$249/year". Whole dollars lose the `.00`, because `$249.00/year` reads like
 * a form field rather than a price.
 */
export function formatPrice(cents: number, interval: BillingInterval): string {
  return `${formatCents(cents, { currency: CURRENCY, showCents: cents % 100 !== 0 })}${intervalSuffix(interval)}`
}

/** The current offer as one string: "$249/year". */
export function currentPriceLabel(): string {
  const offer = currentOffer()
  return formatPrice(offer.priceCents, offer.interval)
}

/** "7-day free trial" / "7 days free" — the two phrasings the site uses. */
export function trialLabel(): string {
  return `${TRIAL_DAYS}-day free trial`
}

export function trialShortLabel(): string {
  return `${TRIAL_DAYS} days free`
}

/**
 * The Stripe Price id for whatever is currently on offer.
 *
 * Deployment configuration rather than source, because the same code runs
 * against a test-mode price on staging and a live-mode price on production.
 * The founding annual price falls back to the standard monthly one so a
 * deployment that has not created the annual price yet still has working
 * Checkout at the regular price, rather than a button that throws.
 */
export function stripePriceIdForOffer(): string | null {
  const founding = process.env.STRIPE_PRICE_ID_FOUNDING_ANNUAL?.trim() || null
  const standard = process.env.STRIPE_PRICE_ID_STANDARD?.trim() || null
  if (FOUNDING_OFFER_ACTIVE && founding) return founding
  return standard
}

/**
 * True when the founding offer is advertised but no annual price id exists, so
 * Checkout would quietly charge the monthly price instead. Surfaced on System
 * Readiness rather than discovered by the first person to subscribe.
 */
export function foundingPriceMisconfigured(): boolean {
  if (!FOUNDING_OFFER_ACTIVE) return false
  return !process.env.STRIPE_PRICE_ID_FOUNDING_ANNUAL?.trim()
}

/** Everything the plan includes. One plan, so this is simply the product. */
export const INCLUDED_FEATURES = [
  'Unlimited users',
  'Unlimited technicians',
  'Unlimited customers',
  'Unlimited jobs',
  'Door Passports',
  'Inspections',
  'Estimates',
  'Customer Presentation Mode',
  'Signatures',
  'Inventory',
  'Invoices',
  'Payments',
  'Every current core feature',
] as const
