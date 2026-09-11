import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { OrgRole, PlatformRole } from '@prisma/client'
import { auth } from './auth'
import { prisma } from './db'
import { tenantDb, type TenantDb } from './tenancy'
import { ForbiddenError, isPlatformStaff, roleCan, type Permission } from './rbac'

export interface AppSession {
  userId: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  avatarUrl: string | null
  platformRole: PlatformRole
  organizationId: string
  organizationName: string
  organizationSlug: string
  timezone: string
  currency: string
  defaultTaxRateBps: number
  role: OrgRole
  /** The technician's truck, so the UI never has to ask "which truck?". */
  defaultLocationId: string | null
  /** True when this organization has exactly one active member. */
  isSoloOperator: boolean
  db: TenantDb
}

/**
 * The single place an organization id enters the system. It comes from the
 * user's membership row, resolved fresh on each request. Nothing here trusts a
 * value supplied by the browser.
 */
export const getSession = cache(async (): Promise<AppSession | null> => {
  const authSession = await auth()
  const userId = authSession?.user?.id
  if (!userId) return null

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        where: { isActive: true },
        include: { organization: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!user) return null

  // A password reset bumps sessionEpoch; older tokens stop working at once.
  if (user.sessionEpoch !== authSession.user.sessionEpoch) return null

  const membership = user.memberships[0]
  if (!membership) return null

  const memberCount = await prisma.membership.count({
    where: { organizationId: membership.organizationId, isActive: true },
  })

  const org = membership.organization

  return {
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    avatarUrl: user.avatarUrl,
    platformRole: user.platformRole,
    organizationId: org.id,
    organizationName: org.name,
    organizationSlug: org.slug,
    timezone: org.timezone,
    currency: org.currency,
    defaultTaxRateBps: org.defaultTaxRateBps,
    role: membership.role,
    defaultLocationId: membership.defaultLocationId,
    isSoloOperator: memberCount <= 1,
    db: tenantDb(org.id),
  }
})

/** Use at the top of every authenticated page, layout and server action. */
export async function requireSession(): Promise<AppSession> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

export async function requirePermission(permission: Permission): Promise<AppSession> {
  const session = await requireSession()
  if (!roleCan(session.role, permission)) throw new ForbiddenError(permission)
  return session
}

export async function requirePlatformStaff() {
  const session = await getSession()
  if (!session || !isPlatformStaff(session.platformRole)) redirect('/today')
  return session
}
