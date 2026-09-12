import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { normalizeReferralCode } from '@/lib/attribution'
import {
  DEFAULT_COMMISSION_PERCENT,
  affiliateSummaries,
  recordCommissionForPeriod,
  referralForOrganization,
} from '@/server/billing/commissions'
import { provisionOrganization } from '@/server/organizations/provision'

/**
 * Affiliate attribution and commission.
 *
 * The rule worth testing hardest: **a company cannot change its own
 * attribution.** Everything else here is arithmetic that has to survive a
 * webhook arriving twice.
 */

async function affiliate(options?: { code?: string; percent?: number; active?: boolean }) {
  const suffix = randomUUID().slice(0, 8).toUpperCase()
  return prisma.affiliate.create({
    data: {
      name: `Partner ${suffix}`,
      email: `partner-${suffix.toLowerCase()}@test.invalid`,
      code: options?.code ?? `SKOOL${suffix}`,
      commissionPercent: options?.percent ?? DEFAULT_COMMISSION_PERCENT,
      isActive: options?.active ?? true,
    },
  })
}

async function companyReferredBy(code: string | null) {
  const suffix = randomUUID().slice(0, 8)
  const user = await prisma.user.create({
    data: {
      email: `owner-${suffix}@test.invalid`,
      passwordHash: 'not-a-real-hash',
      firstName: 'Ref',
      lastName: 'Owner',
    },
  })
  const { organization } = await provisionOrganization({
    ownerUserId: user.id,
    name: `Referred Doors ${suffix}`,
    slug: `referred-${suffix}`,
    companySize: 'SOLO',
    referralCode: code,
  })
  return organization
}

describe('reading a referral code', () => {
  it('normalizes what a partner might share', () => {
    expect(normalizeReferralCode('skool')).toBe('SKOOL')
    expect(normalizeReferralCode(' Skool-2026 ')).toBe('SKOOL-2026')
    // Anything that would need escaping in a URL or a cookie is dropped.
    expect(normalizeReferralCode('skool<script>')).toBe('SKOOLSCRIPT')
  })

  it('refuses something that is not a code', () => {
    expect(normalizeReferralCode(null)).toBeNull()
    expect(normalizeReferralCode('')).toBeNull()
    expect(normalizeReferralCode('a')).toBeNull()
    expect(normalizeReferralCode('x'.repeat(60))).toBeNull()
  })
})

describe('attribution', () => {
  it('records the affiliate at signup', async () => {
    const partner = await affiliate()
    const organization = await companyReferredBy(partner.code)

    const referral = await referralForOrganization(organization.id)
    expect(referral?.affiliate.id).toBe(partner.id)
    expect(referral?.code).toBe(partner.code)
  })

  it('records nothing for a direct signup', async () => {
    const organization = await companyReferredBy(null)
    expect(await referralForOrganization(organization.id)).toBeNull()
  })

  it('ignores a code that does not exist', async () => {
    const organization = await companyReferredBy('NOTAREALCODE')
    expect(await referralForOrganization(organization.id)).toBeNull()
  })

  it('ignores a deactivated affiliate', async () => {
    const partner = await affiliate({ active: false })
    const organization = await companyReferredBy(partner.code)
    expect(await referralForOrganization(organization.id)).toBeNull()
  })

  it('cannot be changed by the company afterwards', async () => {
    const first = await affiliate()
    const second = await affiliate()
    const organization = await companyReferredBy(first.code)

    // There is one Referral row per organization, and nothing in the
    // application updates it — the unique constraint makes a second
    // attribution impossible rather than merely discouraged.
    await expect(
      prisma.referral.create({
        data: {
          organizationId: organization.id,
          affiliateId: second.id,
          code: second.code,
        },
      }),
    ).rejects.toThrow()

    const referral = await referralForOrganization(organization.id)
    expect(referral?.affiliate.id).toBe(first.id)
  })

  it('survives the affiliate being renamed', async () => {
    const partner = await affiliate()
    const organization = await companyReferredBy(partner.code)

    await prisma.affiliate.update({
      where: { id: partner.id },
      data: { name: 'Renamed Partner' },
    })

    // The code on the referral row is a snapshot; the link still resolves.
    const referral = await referralForOrganization(organization.id)
    expect(referral?.code).toBe(partner.code)
    expect(referral?.affiliate.name).toBe('Renamed Partner')
  })
})

describe('commission', () => {
  it('records 20% of what was actually paid', async () => {
    const partner = await affiliate({ percent: 20 })
    const organization = await companyReferredBy(partner.code)

    const result = await recordCommissionForPeriod({
      organizationId: organization.id,
      periodStart: new Date('2026-07-01T00:00:00Z'),
      periodEnd: new Date('2026-08-01T00:00:00Z'),
      amountPaidCents: 3999,
    })

    expect(result.recorded).toBe(true)
    expect(result.amountCents).toBe(800)

    const rows = await prisma.commission.findMany({ where: { affiliateId: partner.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('PENDING')
  })

  it('does not pay twice for the same period', async () => {
    const partner = await affiliate()
    const organization = await companyReferredBy(partner.code)
    const period = {
      periodStart: new Date('2026-07-01T00:00:00Z'),
      periodEnd: new Date('2026-08-01T00:00:00Z'),
      amountPaidCents: 3999,
    }

    await recordCommissionForPeriod({ organizationId: organization.id, ...period })
    const second = await recordCommissionForPeriod({
      organizationId: organization.id,
      ...period,
    })

    // A replayed webhook must not owe a partner a second month.
    expect(second.recorded).toBe(false)
    expect(await prisma.commission.count({ where: { affiliateId: partner.id } })).toBe(1)
  })

  it('records each month separately', async () => {
    const partner = await affiliate()
    const organization = await companyReferredBy(partner.code)

    for (const month of ['2026-07-01', '2026-08-01', '2026-09-01']) {
      await recordCommissionForPeriod({
        organizationId: organization.id,
        periodStart: new Date(`${month}T00:00:00Z`),
        periodEnd: new Date(`${month}T00:00:00Z`),
        amountPaidCents: 3999,
      })
    }

    expect(await prisma.commission.count({ where: { affiliateId: partner.id } })).toBe(3)
  })

  it('records nothing for a company nobody referred', async () => {
    const organization = await companyReferredBy(null)
    const result = await recordCommissionForPeriod({
      organizationId: organization.id,
      periodStart: new Date(),
      periodEnd: new Date(),
      amountPaidCents: 3999,
    })
    expect(result.recorded).toBe(false)
  })

  it('records nothing once an affiliate is deactivated', async () => {
    const partner = await affiliate()
    const organization = await companyReferredBy(partner.code)
    await prisma.affiliate.update({ where: { id: partner.id }, data: { isActive: false } })

    const result = await recordCommissionForPeriod({
      organizationId: organization.id,
      periodStart: new Date(),
      periodEnd: new Date(),
      amountPaidCents: 3999,
    })
    expect(result.recorded).toBe(false)
  })
})

describe('the partner ledger', () => {
  it('counts only companies that are actually paying towards MRR', async () => {
    const partner = await affiliate({ percent: 20 })

    const paying = await companyReferredBy(partner.code)
    const trialing = await companyReferredBy(partner.code)
    const cancelled = await companyReferredBy(partner.code)

    await prisma.subscription.update({
      where: { organizationId: paying.id },
      data: { status: 'ACTIVE' },
    })
    await prisma.subscription.update({
      where: { organizationId: cancelled.id },
      data: { status: 'CANCELLED' },
    })
    void trialing

    const summary = (await affiliateSummaries()).find(
      (row) => row.affiliateId === partner.id,
    )!

    expect(summary.referredCompanies).toBe(3)
    // A trial might convert and a cancelled account is gone; neither is revenue.
    expect(summary.activeSubscriptions).toBe(1)
    expect(summary.attributedMrrCents).toBe(3999)
    expect(summary.estimatedMonthlyCommissionCents).toBe(800)
  })

  it('counts a past-due company, because Stripe is still collecting', async () => {
    const partner = await affiliate()
    const organization = await companyReferredBy(partner.code)
    await prisma.subscription.update({
      where: { organizationId: organization.id },
      data: { status: 'PAST_DUE' },
    })

    const summary = (await affiliateSummaries()).find(
      (row) => row.affiliateId === partner.id,
    )!
    expect(summary.activeSubscriptions).toBe(1)
  })

  it('separates what is owed from what has been paid', async () => {
    const partner = await affiliate()
    const organization = await companyReferredBy(partner.code)
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: organization.id },
    })

    await prisma.commission.createMany({
      data: [
        {
          affiliateId: partner.id,
          subscriptionId: subscription.id,
          amountCents: 800,
          status: 'PENDING',
          periodStart: new Date('2026-07-01'),
          periodEnd: new Date('2026-08-01'),
        },
        {
          affiliateId: partner.id,
          subscriptionId: subscription.id,
          amountCents: 800,
          status: 'PAID',
          periodStart: new Date('2026-06-01'),
          periodEnd: new Date('2026-07-01'),
        },
      ],
    })

    const summary = (await affiliateSummaries()).find(
      (row) => row.affiliateId === partner.id,
    )!
    expect(summary.owedCents).toBe(800)
    expect(summary.paidCents).toBe(800)
  })

  it('never marks a commission paid on its own', async () => {
    const partner = await affiliate()
    const organization = await companyReferredBy(partner.code)

    await recordCommissionForPeriod({
      organizationId: organization.id,
      periodStart: new Date(),
      periodEnd: new Date(),
      amountPaidCents: 3999,
    })

    const rows = await prisma.commission.findMany({ where: { affiliateId: partner.id } })
    // Money moves when a person decides it does, not on a schedule.
    expect(rows.every((row) => row.status === 'PENDING')).toBe(true)
    expect(rows.every((row) => row.paidAt === null)).toBe(true)
  })
})
