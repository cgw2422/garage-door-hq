import type { SubscriptionStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import type { AuthenticatedUser } from '@/lib/session'

/**
 * Platform administration.
 *
 * This is the one part of the product that reads across tenants, so it does
 * not use the tenant-scoped client — and every function here takes an already
 * authorized platform user. Callers must go through `requirePlatformStaff()`
 * first; nothing in this file re-derives permission from a parameter.
 *
 * Impersonation is deliberately absent. Reading a company's numbers is enough
 * to support them, and the ability to act as one of their users is a large
 * security surface to add before it is genuinely needed.
 */

export class PlatformError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlatformError'
  }
}

export interface PlatformMetrics {
  totalCompanies: number
  activeSubscriptions: number
  trialing: number
  pastDue: number
  cancelled: number
  complimentary: number
  monthlyRecurringCents: number
  totalUsers: number
  totalJobs: number
  totalCustomers: number
  totalDoors: number
  totalInvoices: number
  paymentVolumeCents: number
}

export async function platformMetrics(): Promise<PlatformMetrics> {
  const [
    totalCompanies,
    byStatus,
    activeSubs,
    totalUsers,
    totalJobs,
    totalCustomers,
    totalDoors,
    totalInvoices,
    payments,
  ] = await Promise.all([
    prisma.organization.count({ where: { archivedAt: null } }),
    prisma.subscription.groupBy({ by: ['status'], _count: true }),
    prisma.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'PAST_DUE'] } },
      select: { priceCents: true, discountPercent: true },
    }),
    prisma.user.count(),
    prisma.job.count(),
    prisma.customer.count(),
    prisma.door.count(),
    prisma.invoice.count(),
    prisma.payment.aggregate({ where: { status: 'SUCCEEDED' }, _sum: { amountCents: true } }),
  ])

  const countFor = (status: SubscriptionStatus) =>
    byStatus.find((row) => row.status === status)?._count ?? 0

  // Recurring revenue counts what is actually billing, net of any discount.
  const monthlyRecurringCents = activeSubs.reduce((sum, subscription) => {
    const discount = subscription.discountPercent ?? 0
    return sum + Math.round(subscription.priceCents * ((100 - discount) / 100))
  }, 0)

  return {
    totalCompanies,
    activeSubscriptions: countFor('ACTIVE'),
    trialing: countFor('TRIALING'),
    pastDue: countFor('PAST_DUE'),
    cancelled: countFor('CANCELLED'),
    complimentary: countFor('COMPLIMENTARY'),
    monthlyRecurringCents,
    totalUsers,
    totalJobs,
    totalCustomers,
    totalDoors,
    totalInvoices,
    paymentVolumeCents: payments._sum.amountCents ?? 0,
  }
}

export async function searchCompanies(query?: string, status?: SubscriptionStatus | null) {
  const search = query?.trim()

  return prisma.organization.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { memberships: { some: { user: { email: { contains: search, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
      ...(status ? { subscription: { status } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      subscription: true,
      referral: { include: { affiliate: { select: { name: true, code: true } } } },
      _count: { select: { memberships: true, jobs: true, customers: true } },
    },
  })
}

export async function companyOverview(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      subscription: true,
      referral: { include: { affiliate: true } },
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              lastLoginAt: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      _count: {
        select: {
          customers: true,
          properties: true,
          doors: true,
          jobs: true,
          estimates: true,
          invoices: true,
          inventoryLocations: true,
        },
      },
    },
  })
  if (!organization) return null

  const [payments, lastJob, auditLog] = await Promise.all([
    prisma.payment.aggregate({
      where: { organizationId, status: 'SUCCEEDED' },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.job.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { actor: { select: { firstName: true, lastName: true, email: true } } },
    }),
  ])

  return {
    organization,
    paymentVolumeCents: payments._sum.amountCents ?? 0,
    paymentCount: payments._count,
    lastActivityAt: lastJob?.createdAt ?? organization.createdAt,
    auditLog,
  }
}

async function requireSubscription(organizationId: string) {
  const subscription = await prisma.subscription.findUnique({ where: { organizationId } })
  if (!subscription) throw new PlatformError('That company has no subscription record.')
  return subscription
}

export async function extendTrial(
  actor: AuthenticatedUser,
  input: { organizationId: string; days: number },
) {
  if (input.days < 1 || input.days > 365) {
    throw new PlatformError('Extend by between 1 and 365 days.')
  }

  const subscription = await requireSubscription(input.organizationId)
  // Extend from whichever is later, so extending twice does not lose time and
  // extending a lapsed trial still gives the full window.
  const base =
    subscription.trialEndsAt && subscription.trialEndsAt > new Date()
      ? subscription.trialEndsAt
      : new Date()
  const trialEndsAt = new Date(base.getTime() + input.days * 24 * 60 * 60 * 1000)

  const updated = await prisma.subscription.update({
    where: { organizationId: input.organizationId },
    data: {
      trialEndsAt,
      status: subscription.status === 'ACTIVE' ? subscription.status : 'TRIALING',
    },
  })

  await recordAudit({
    organizationId: input.organizationId,
    actorUserId: actor.userId,
    action: 'platform.trial_extended',
    entityType: 'Subscription',
    entityId: updated.id,
    before: { trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null },
    after: { trialEndsAt: trialEndsAt.toISOString(), days: input.days },
  })

  return updated
}

export async function grantComplimentary(
  actor: AuthenticatedUser,
  input: { organizationId: string; months: number; reason: string },
) {
  if (input.months < 1 || input.months > 60) {
    throw new PlatformError('Grant between 1 and 60 months.')
  }
  if (!input.reason.trim()) {
    throw new PlatformError('Record why this account is complimentary.')
  }

  const subscription = await requireSubscription(input.organizationId)
  const base =
    subscription.complimentaryUntil && subscription.complimentaryUntil > new Date()
      ? subscription.complimentaryUntil
      : new Date()
  const complimentaryUntil = new Date(base)
  complimentaryUntil.setMonth(complimentaryUntil.getMonth() + input.months)

  const updated = await prisma.subscription.update({
    where: { organizationId: input.organizationId },
    data: { status: 'COMPLIMENTARY', complimentaryUntil },
  })

  await recordAudit({
    organizationId: input.organizationId,
    actorUserId: actor.userId,
    action: 'platform.complimentary_granted',
    entityType: 'Subscription',
    entityId: updated.id,
    before: { status: subscription.status },
    after: {
      status: 'COMPLIMENTARY',
      complimentaryUntil: complimentaryUntil.toISOString(),
      reason: input.reason.trim(),
    },
  })

  return updated
}

export async function endComplimentary(
  actor: AuthenticatedUser,
  input: { organizationId: string; newStatus: 'TRIALING' | 'ACTIVE' | 'CANCELLED' },
) {
  const subscription = await requireSubscription(input.organizationId)
  if (subscription.status !== 'COMPLIMENTARY') {
    throw new PlatformError('That account is not on complimentary access.')
  }

  const updated = await prisma.subscription.update({
    where: { organizationId: input.organizationId },
    data: {
      status: input.newStatus,
      complimentaryUntil: null,
      ...(input.newStatus === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
    },
  })

  await recordAudit({
    organizationId: input.organizationId,
    actorUserId: actor.userId,
    action: 'platform.complimentary_ended',
    entityType: 'Subscription',
    entityId: updated.id,
    before: { status: 'COMPLIMENTARY' },
    after: { status: input.newStatus },
  })

  return updated
}
