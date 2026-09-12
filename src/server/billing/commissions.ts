import { prisma } from '@/lib/db'

/**
 * What a partner has earned.
 *
 * Calculated and tracked; **never paid automatically**. Moving money to a
 * partner is not something this product should do on a schedule without a
 * person looking at it, and the deliberate gap between "owed" and "paid" is
 * where that person goes.
 *
 * A commission row is created per billing period, keyed by
 * `(subscriptionId, periodStart)`, so re-running the calculation — or a
 * webhook arriving twice — cannot pay for the same month twice.
 */

/** The standing offer. Stored per affiliate, so this is only the default. */
export const DEFAULT_COMMISSION_PERCENT = 20

export interface CommissionSummary {
  affiliateId: string
  affiliateName: string
  affiliateCode: string
  commissionPercent: number
  referredCompanies: number
  activeSubscriptions: number
  /** Monthly recurring revenue from this affiliate's active referrals, in cents. */
  attributedMrrCents: number
  /** What that MRR earns them each month at their rate, in cents. */
  estimatedMonthlyCommissionCents: number
  /** Recorded and not yet paid. */
  owedCents: number
  paidCents: number
}

/**
 * Record the commission for one paid period.
 *
 * Called when a subscription invoice is paid. Does nothing when the company
 * was never referred, and nothing a second time for the same period.
 */
export async function recordCommissionForPeriod(params: {
  organizationId: string
  periodStart: Date
  periodEnd: Date
  amountPaidCents: number
}): Promise<{ recorded: boolean; amountCents: number }> {
  const referral = await prisma.referral.findUnique({
    where: { organizationId: params.organizationId },
    select: {
      affiliateId: true,
      affiliate: { select: { commissionPercent: true, isActive: true } },
    },
  })
  if (!referral || !referral.affiliate.isActive) return { recorded: false, amountCents: 0 }

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: params.organizationId },
    select: { id: true },
  })
  if (!subscription) return { recorded: false, amountCents: 0 }

  const amountCents = Math.round(
    (params.amountPaidCents * referral.affiliate.commissionPercent) / 100,
  )
  if (amountCents <= 0) return { recorded: false, amountCents: 0 }

  try {
    await prisma.commission.create({
      data: {
        affiliateId: referral.affiliateId,
        subscriptionId: subscription.id,
        status: 'PENDING',
        amountCents,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
      },
    })
    return { recorded: true, amountCents }
  } catch (error) {
    // Unique on (subscriptionId, periodStart): this period is already
    // recorded, which is the correct outcome for a replayed webhook.
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return { recorded: false, amountCents }
    }
    throw error
  }
}

/**
 * The affiliate ledger, for the platform admin screen.
 *
 * Reads across tenants deliberately — this is platform staff looking at the
 * whole business — and is only ever called from a route that has already
 * checked for platform staff.
 */
export async function affiliateSummaries(): Promise<CommissionSummary[]> {
  const affiliates = await prisma.affiliate.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      code: true,
      commissionPercent: true,
      referrals: {
        select: {
          organizationId: true,
          organization: {
            select: {
              subscription: { select: { status: true, priceCents: true, complimentaryUntil: true } },
            },
          },
        },
      },
      commissions: { select: { amountCents: true, status: true } },
    },
  })

  const now = Date.now()

  return affiliates.map((affiliate) => {
    // Only states where money is actually changing hands count towards MRR.
    // A trial might convert; a comp never bills; a cancelled account is gone.
    const paying = affiliate.referrals.filter((referral) => {
      const subscription = referral.organization.subscription
      if (!subscription) return false
      if (subscription.status === 'ACTIVE') return true
      // Past due is still a live subscription Stripe is collecting on.
      if (subscription.status === 'PAST_DUE') return true
      void now
      return false
    })

    const attributedMrrCents = paying.reduce(
      (sum, referral) => sum + (referral.organization.subscription?.priceCents ?? 0),
      0,
    )

    const owedCents = affiliate.commissions
      .filter((commission) => commission.status === 'PENDING' || commission.status === 'APPROVED')
      .reduce((sum, commission) => sum + commission.amountCents, 0)

    const paidCents = affiliate.commissions
      .filter((commission) => commission.status === 'PAID')
      .reduce((sum, commission) => sum + commission.amountCents, 0)

    return {
      affiliateId: affiliate.id,
      affiliateName: affiliate.name,
      affiliateCode: affiliate.code,
      commissionPercent: affiliate.commissionPercent,
      referredCompanies: affiliate.referrals.length,
      activeSubscriptions: paying.length,
      attributedMrrCents,
      estimatedMonthlyCommissionCents: Math.round(
        (attributedMrrCents * affiliate.commissionPercent) / 100,
      ),
      owedCents,
      paidCents,
    }
  })
}

/** One company's attribution, for the platform admin company view. */
export async function referralForOrganization(organizationId: string) {
  return prisma.referral.findUnique({
    where: { organizationId },
    select: {
      code: true,
      attributedAt: true,
      landingUrl: true,
      affiliate: { select: { id: true, name: true, email: true, commissionPercent: true } },
    },
  })
}
