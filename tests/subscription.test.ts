import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import {
  RESTRICTED_MESSAGE,
  accessStateFor,
  billingNotice,
} from '@/server/billing/access'
import { statusFromStripe } from '@/server/billing/service'
import { createTestCompany } from './helpers'

/**
 * Subscription enforcement.
 *
 * `accessStateFor` is a pure function of the row and the clock, which is why
 * it can be tested exhaustively here without a request, a session or a mock.
 * The behaviour the product promises — "your data is safe" — is a property of
 * these rules, so they are worth pinning down precisely.
 */

const DAY = 86_400_000
const NOW = new Date('2026-06-15T12:00:00.000Z')

function subscription(overrides: Partial<Parameters<typeof accessStateFor>[0]> = {}) {
  return {
    status: 'TRIALING' as const,
    trialEndsAt: new Date(NOW.getTime() + 7 * DAY),
    currentPeriodEnd: null,
    complimentaryUntil: null,
    cancelledAt: null,
    ...overrides,
  }
}

describe('during a trial', () => {
  it('gives full access', () => {
    const access = accessStateFor(subscription(), NOW)
    expect(access.level).toBe('full')
    expect(access.isTrialing).toBe(true)
    expect(access.trialDaysLeft).toBe(7)
  })

  it('says nothing for most of the trial', () => {
    // A full-screen paywall on day three is how you lose someone who was going
    // to pay. Quiet until it is nearly over.
    expect(billingNotice(accessStateFor(subscription(), NOW))).toBeNull()
  })

  it('speaks up in the last few days', () => {
    const access = accessStateFor(
      subscription({ trialEndsAt: new Date(NOW.getTime() + 2 * DAY) }),
      NOW,
    )
    const notice = billingNotice(access)
    expect(notice).not.toBeNull()
    expect(notice!.tone).toBe('warning')
    expect(notice!.cta).toContain('$39.99')
  })

  it('counts the last day as today rather than zero days ago', () => {
    const access = accessStateFor(
      subscription({ trialEndsAt: new Date(NOW.getTime() + 3 * 60 * 60 * 1000) }),
      NOW,
    )
    expect(access.trialDaysLeft).toBe(1)
    expect(access.level).toBe('full')
  })

  it('does not lock anyone out over a missing end date', () => {
    const access = accessStateFor(subscription({ trialEndsAt: null }), NOW)
    expect(access.level).toBe('full')
  })
})

describe('when the trial runs out', () => {
  it('becomes read-only rather than gone', () => {
    const access = accessStateFor(
      subscription({ trialEndsAt: new Date(NOW.getTime() - DAY) }),
      NOW,
    )
    expect(access.level).toBe('read_only')
    expect(access.restrictionReason).toBe(RESTRICTED_MESSAGE)
  })

  it('tells them their data is safe, in those words', () => {
    const access = accessStateFor(
      subscription({ trialEndsAt: new Date(NOW.getTime() - DAY) }),
      NOW,
    )
    expect(access.restrictionReason).toContain('Your data is safe')
    expect(access.restrictionReason).toContain('$39.99')
    // Nothing that reads like the data is at risk.
    expect(access.restrictionReason?.toLowerCase()).not.toContain('delete')
    expect(access.restrictionReason?.toLowerCase()).not.toContain('lost')
  })
})

describe('active and past due', () => {
  it('gives an active account full access with nothing to say', () => {
    const access = accessStateFor(subscription({ status: 'ACTIVE' }), NOW)
    expect(access.level).toBe('full')
    expect(billingNotice(access)).toBeNull()
  })

  it('keeps a past-due account working while Stripe retries', () => {
    const access = accessStateFor(subscription({ status: 'PAST_DUE' }), NOW)
    // One failed card must not stop somebody running their business.
    expect(access.level).toBe('full')
    expect(access.isPastDue).toBe(true)

    const notice = billingNotice(access)
    expect(notice?.tone).toBe('danger')
    expect(notice?.cta).toMatch(/payment method/i)
  })
})

describe('cancelled', () => {
  it('is read-only and says so in its own words', () => {
    const access = accessStateFor(
      subscription({ status: 'CANCELLED', cancelledAt: new Date(NOW.getTime() - DAY) }),
      NOW,
    )
    expect(access.level).toBe('read_only')
    expect(access.restrictionReason).toContain('cancelled')
    expect(access.restrictionReason).toContain('Your data is safe')
  })
})

describe('complimentary', () => {
  it('gives full access and asks for nothing', () => {
    const access = accessStateFor(
      subscription({
        status: 'COMPLIMENTARY',
        complimentaryUntil: new Date(NOW.getTime() + 90 * DAY),
      }),
      NOW,
    )
    expect(access.level).toBe('full')
    expect(access.isComplimentary).toBe(true)
    expect(access.needsActivation).toBe(false)
    expect(billingNotice(access)).toBeNull()
  })

  it('works with no end date at all', () => {
    const access = accessStateFor(
      subscription({ status: 'COMPLIMENTARY', complimentaryUntil: null }),
      NOW,
    )
    expect(access.level).toBe('full')
  })

  it('falls back to read-only once it runs out', () => {
    const access = accessStateFor(
      subscription({
        status: 'COMPLIMENTARY',
        complimentaryUntil: new Date(NOW.getTime() - DAY),
      }),
      NOW,
    )
    expect(access.level).toBe('read_only')
    expect(access.isComplimentary).toBe(false)
  })
})

describe('no subscription row at all', () => {
  it('lets them work rather than locking a paying customer out over our bug', () => {
    const access = accessStateFor(null, NOW)
    expect(access.level).toBe('full')
  })
})

describe('mapping Stripe statuses', () => {
  it('maps the ones that mean money is flowing', () => {
    expect(statusFromStripe('active', 'TRIALING')).toBe('ACTIVE')
    expect(statusFromStripe('trialing', 'TRIALING')).toBe('ACTIVE')
  })

  it('maps failure to past due, not to cancelled', () => {
    expect(statusFromStripe('past_due', 'ACTIVE')).toBe('PAST_DUE')
    expect(statusFromStripe('unpaid', 'ACTIVE')).toBe('PAST_DUE')
  })

  it('maps a real cancellation', () => {
    expect(statusFromStripe('canceled', 'ACTIVE')).toBe('CANCELLED')
  })

  it('leaves an account alone when checkout was abandoned', () => {
    // `incomplete` means the first payment never succeeded, so the account
    // never started. A trialing account must not be cancelled by it.
    expect(statusFromStripe('incomplete', 'TRIALING')).toBeNull()
    expect(statusFromStripe('incomplete_expired', 'TRIALING')).toBeNull()
    // An account that was already paying keeps its state.
    expect(statusFromStripe('incomplete', 'ACTIVE')).toBe('ACTIVE')
  })
})

describe('the real subscription a company gets at signup', () => {
  it('starts as a trial with an end date and full access', async () => {
    const { session } = await createTestCompany()

    const row = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: session.organizationId },
    })
    expect(row.status).toBe('TRIALING')
    expect(row.trialEndsAt).not.toBeNull()
    expect(row.priceCents).toBe(3999)

    expect(accessStateFor(row).level).toBe('full')
  })

  it('is scoped to its own company', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()

    await prisma.subscription.update({
      where: { organizationId: a.organizationId },
      data: { status: 'CANCELLED' },
    })

    const theirs = await b.db.subscription.findUnique({
      where: { organizationId: b.organizationId },
    })
    expect(theirs?.status).toBe('TRIALING')
  })
})
