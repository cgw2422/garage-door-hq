import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import {
  BILLING_INTERVAL,
  FOUNDING_ANNUAL_CENTS,
  FOUNDING_OFFER_ACTIVE,
  STANDARD_ANNUAL_CENTS,
  STANDARD_MONTHLY_CENTS,
  TRIAL_DAYS,
  currentOffer,
  currentPriceLabel,
  formatPrice,
  foundingPriceMisconfigured,
  stripePriceIdForOffer,
  trialLabel,
} from '@/lib/pricing'
import {
  RESTRICTED_MESSAGE,
  CANCELLED_MESSAGE,
  accessStateFor,
  billingNotice,
} from '@/server/billing/access'
import { trialDays } from '@/server/organizations/provision'
import { createTestCompany } from './helpers'

/**
 * Pricing, and the one thing about it that could cost real money.
 *
 * The advertised offer and a customer's actual subscription are separate
 * concepts that happen to involve the same currency. The tests that matter
 * here are the ones proving they stay separate: the marketing price is a
 * constant in this repository, and an existing subscriber's price is whatever
 * Stripe says it is.
 */

describe('the advertised offer', () => {
  it('is the founding annual price while the offer is running', () => {
    const offer = currentOffer()
    expect(offer.isFounding).toBe(FOUNDING_OFFER_ACTIVE)
    if (FOUNDING_OFFER_ACTIVE) {
      expect(offer.priceCents).toBe(FOUNDING_ANNUAL_CENTS)
      expect(offer.interval).toBe('year')
      expect(offer.label).toBe('Founding Member')
    }
  })

  it('offers both standard prices to strike through, so the discount is legible', () => {
    const offer = currentOffer()
    if (!FOUNDING_OFFER_ACTIVE) {
      expect(offer.strikethroughCents).toEqual([])
      return
    }
    expect(offer.strikethroughCents).toEqual([
      { cents: STANDARD_MONTHLY_CENTS, interval: 'month' },
      { cents: STANDARD_ANNUAL_CENTS, interval: 'year' },
    ])
  })

  it('costs less than either standard price, or it is not an offer', () => {
    if (!FOUNDING_OFFER_ACTIVE) return
    expect(FOUNDING_ANNUAL_CENTS).toBeLessThan(STANDARD_ANNUAL_CENTS)
    expect(FOUNDING_ANNUAL_CENTS).toBeLessThan(STANDARD_MONTHLY_CENTS * 12)
  })

  it('agrees with the interval the rest of the app bills on', () => {
    expect(currentOffer().interval).toBe(BILLING_INTERVAL)
  })
})

describe('how prices are written', () => {
  it('drops the cents on a whole-dollar price', () => {
    expect(formatPrice(24_900, 'year')).toBe('$249/year')
    expect(formatPrice(39_900, 'year')).toBe('$399/year')
  })

  it('keeps the cents when there are any', () => {
    expect(formatPrice(3_999, 'month')).toBe('$39.99/month')
  })

  it('says the trial length once, from one place', () => {
    expect(trialLabel()).toBe(`${TRIAL_DAYS}-day free trial`)
    expect(TRIAL_DAYS).toBe(7)
  })
})

describe('the app repeats the advertised price rather than its own copy', () => {
  it('names the current offer when a trial has expired', () => {
    expect(RESTRICTED_MESSAGE).toContain(currentPriceLabel())
  })

  it('names the current offer after a cancellation', () => {
    expect(CANCELLED_MESSAGE).toContain(currentPriceLabel())
  })

  it('names the current offer on the activation prompt', () => {
    const access = accessStateFor({
      status: 'TRIALING',
      trialEndsAt: new Date(Date.now() + 2 * 86_400_000),
      currentPeriodEnd: null,
      complimentaryUntil: null,
      cancelledAt: null,
    })
    const notice = billingNotice(access)
    expect(notice?.cta).toContain(currentPriceLabel())
    expect(notice?.body).toContain(currentPriceLabel())
  })
})

describe('Stripe price selection', () => {
  const KEYS = ['STRIPE_PRICE_ID_STANDARD', 'STRIPE_PRICE_ID_FOUNDING_ANNUAL'] as const

  function withEnv(values: Partial<Record<(typeof KEYS)[number], string>>, run: () => void) {
    const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))
    for (const key of KEYS) delete process.env[key]
    for (const [key, value] of Object.entries(values)) process.env[key] = value
    try {
      run()
    } finally {
      for (const key of KEYS) {
        const previous = saved[key]
        if (previous === undefined) delete process.env[key]
        else process.env[key] = previous
      }
    }
  }

  it('uses the annual price while the founding offer runs', () => {
    withEnv({ STRIPE_PRICE_ID_STANDARD: 'price_monthly', STRIPE_PRICE_ID_FOUNDING_ANNUAL: 'price_annual' }, () => {
      expect(stripePriceIdForOffer()).toBe(FOUNDING_OFFER_ACTIVE ? 'price_annual' : 'price_monthly')
    })
  })

  it('falls back to the standard price rather than breaking Checkout', () => {
    withEnv({ STRIPE_PRICE_ID_STANDARD: 'price_monthly' }, () => {
      expect(stripePriceIdForOffer()).toBe('price_monthly')
    })
  })

  it('reports the fallback as a misconfiguration, so it is not silent', () => {
    withEnv({ STRIPE_PRICE_ID_STANDARD: 'price_monthly' }, () => {
      expect(foundingPriceMisconfigured()).toBe(FOUNDING_OFFER_ACTIVE)
    })
    withEnv({ STRIPE_PRICE_ID_STANDARD: 'price_monthly', STRIPE_PRICE_ID_FOUNDING_ANNUAL: 'price_annual' }, () => {
      expect(foundingPriceMisconfigured()).toBe(false)
    })
  })

  it('has nothing to offer when neither id is set', () => {
    withEnv({}, () => {
      expect(stripePriceIdForOffer()).toBeNull()
    })
  })
})

describe('an existing subscription is not the advertised price', () => {
  /**
   * The expensive mistake this prevents: dropping the public price and
   * discovering it rewrote what current customers are recorded as paying.
   * `syncFromStripe` reads `priceCents` from the Stripe subscription item, so
   * the only way a subscriber's price changes is a change in Stripe.
   */
  it('records what Stripe charged, not what the site advertises', async () => {
    const { organizationId } = await createTestCompany()

    await prisma.subscription.update({
      where: { organizationId },
      data: {
        status: 'ACTIVE',
        providerName: 'stripe',
        providerPriceId: 'price_founding_annual_v1',
        priceCents: FOUNDING_ANNUAL_CENTS,
        currency: 'USD',
      },
    })

    // The shop window changes. Nothing re-reads it on behalf of this row.
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId },
      select: { priceCents: true, providerPriceId: true },
    })

    expect(row.priceCents).toBe(FOUNDING_ANNUAL_CENTS)
    expect(row.providerPriceId).toBe('price_founding_annual_v1')
  })

  it('starts a new account on the price being advertised today', async () => {
    const { organizationId } = await createTestCompany()
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId },
      select: { priceCents: true, trialEndsAt: true },
    })
    expect(subscription.priceCents).toBe(currentOffer().priceCents)
  })

  it('gives a new account the configured trial, computed once and stored', async () => {
    const before = Date.now()
    const { organizationId } = await createTestCompany()
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId },
      select: { trialEndsAt: true },
    })

    const days = (subscription.trialEndsAt!.getTime() - before) / 86_400_000
    expect(days).toBeGreaterThan(trialDays() - 0.1)
    expect(days).toBeLessThan(trialDays() + 0.1)
  })
})
