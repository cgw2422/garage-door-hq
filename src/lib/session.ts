import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { OrgRole, PlatformRole } from '@prisma/client'
import { auth } from './auth'
import { prisma } from './db'
import { tenantDb, type TenantDb } from './tenancy'
import { ForbiddenError, isPlatformStaff, roleCan, type Permission } from './rbac'

/**
 * The minimum an operation needs to act on one organization's data.
 *
 * `AppSession` satisfies it, and so does the customer portal — which has a real
 * organization and no user at all. Domain services take this rather than a full
 * session so a signed-in technician and a customer following a secure link run
 * the same code, with the same tenant boundary.
 */
export interface TenantContext {
  organizationId: string
  /** Null when the actor is a customer on a portal link rather than a user. */
  userId: string | null
  db: TenantDb
}

export interface AppSession extends TenantContext {
  userId: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  avatarUrl: string | null
  platformRole: PlatformRole
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
}

export interface AuthenticatedUser {
  userId: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  platformRole: PlatformRole
  /** False between signing up and finishing the company step of onboarding. */
  hasOrganization: boolean
}

/**
 * The signed-in user, with or without a company.
 *
 * Onboarding needs this: between creating an account and provisioning an
 * organization there is a real, valid session that simply has no tenant yet.
 * Everything past onboarding uses `getSession()` instead.
 */
export const getAuthenticatedUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const authSession = await auth()
  const userId = authSession?.user?.id
  if (!userId) return null

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { where: { isActive: true }, select: { id: true } } },
  })
  if (!user) return null
  if (user.sessionEpoch !== authSession.user.sessionEpoch) return null

  return {
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    platformRole: user.platformRole,
    hasOrganization: user.memberships.length > 0,
  }
})

/** Where a signed-in user belongs, given what they are. */
export function landingFor(user: AuthenticatedUser): string {
  if (user.hasOrganization) return '/today'
  if (isPlatformStaff(user.platformRole)) return '/admin'
  return '/onboarding/company'
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')
  return user
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

/**
 * Use at the top of every authenticated page, layout and server action.
 *
 * A user who is signed in but has not finished onboarding is sent to finish it
 * rather than back to the login screen they just came from.
 */
export async function requireSession(): Promise<AppSession> {
  const session = await getSession()
  if (session) return session

  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')
  // Platform staff belong to no customer company, so onboarding is not where
  // they should land — their admin area is.
  if (isPlatformStaff(user.platformRole)) redirect('/admin')
  redirect('/onboarding/company')
}

export async function requirePermission(permission: Permission): Promise<AppSession> {
  const session = await requireSession()
  if (!roleCan(session.role, permission)) throw new ForbiddenError(permission)
  return session
}

/**
 * Garage Door HQ staff.
 *
 * Deliberately checked against the authenticated user rather than a company
 * session: platform staff belong to no customer organization, so requiring a
 * membership would lock them out of their own admin area.
 */
export async function requirePlatformStaff(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')
  if (!isPlatformStaff(user.platformRole)) redirect('/today')
  return user
}
