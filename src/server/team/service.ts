import { createHash, randomBytes } from 'node:crypto'
import type { OrgRole } from '@prisma/client'
import { prisma } from '@/lib/db'
import { appBaseUrl } from '@/lib/app-url'
import { recordAudit } from '@/lib/audit'
import { hashPassword } from '@/lib/password'
import type { AppSession } from '@/lib/session'

/**
 * Team management.
 *
 * The rules here are about privilege, so they are enforced in the service
 * rather than the screen:
 *
 *   - Nobody edits their own role or their own active flag. Self-service
 *     escalation is the most obvious way a role system gets defeated.
 *   - Only an OWNER can create or change an OWNER.
 *   - The last active owner cannot be demoted or deactivated, or the company
 *     locks itself out of its own billing and settings.
 *   - An ADMIN cannot modify an OWNER.
 */

export class TeamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TeamError'
  }
}

const INVITE_TTL_DAYS = 14

export { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/roles'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/** Opaque, 256 bits. Only the hash is stored. */
function generateToken() {
  return randomBytes(32).toString('base64url')
}

export async function listMembers(session: AppSession) {
  return session.db.membership.findMany({
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          lastLoginAt: true,
        },
      },
      defaultLocation: { select: { id: true, name: true } },
    },
  })
}

export async function listInvitations(session: AppSession) {
  return session.db.invitation.findMany({
    where: { acceptedAt: null, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { defaultLocation: { select: { name: true } } },
  })
}

export interface InviteResult {
  invitationId: string
  /** The raw token. Returned exactly once, never stored, never logged. */
  token: string
  acceptUrl: string
  expiresAt: Date
}

export async function inviteMember(
  session: AppSession,
  input: { email: string; role: OrgRole; defaultLocationId?: string | null },
): Promise<InviteResult> {
  const email = input.email.toLowerCase().trim()
  if (!email.includes('@')) throw new TeamError('Enter a valid email address.')

  assertMayAssignRole(session, input.role)

  const alreadyMember = await prisma.membership.findFirst({
    where: { organizationId: session.organizationId, user: { email } },
    select: { id: true },
  })
  if (alreadyMember) throw new TeamError('That person is already on your team.')

  if (input.defaultLocationId) await assertLocationBelongsToTenant(session, input.defaultLocationId)

  const token = generateToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  const invitation = await prisma.invitation.upsert({
    where: { organizationId_email: { organizationId: session.organizationId, email } },
    create: {
      organizationId: session.organizationId,
      email,
      role: input.role,
      tokenHash: hashToken(token),
      expiresAt,
      defaultLocationId: input.defaultLocationId ?? null,
      invitedById: session.userId,
    },
    update: {
      role: input.role,
      tokenHash: hashToken(token),
      expiresAt,
      defaultLocationId: input.defaultLocationId ?? null,
      invitedById: session.userId,
      revokedAt: null,
      acceptedAt: null,
      lastSentAt: new Date(),
      sendCount: { increment: 1 },
    },
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'team.invited',
    entityType: 'Invitation',
    entityId: invitation.id,
    after: { email, role: input.role },
  })

  return {
    invitationId: invitation.id,
    token,
    acceptUrl: acceptUrlFor(token),
    expiresAt,
  }
}

export function acceptUrlFor(token: string) {
  return `${appBaseUrl()}/invite/${token}`
}

/** Re-issues the token, which invalidates any link already handed out. */
export async function resendInvitation(session: AppSession, invitationId: string) {
  const invitation = await session.db.invitation.findUnique({ where: { id: invitationId } })
  if (!invitation) throw new TeamError('Invitation not found.')
  if (invitation.acceptedAt) throw new TeamError('That invitation has already been accepted.')

  const token = generateToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  await session.db.invitation.update({
    where: { id: invitationId },
    data: {
      tokenHash: hashToken(token),
      expiresAt,
      revokedAt: null,
      lastSentAt: new Date(),
      sendCount: { increment: 1 },
    },
  })

  return { invitationId, token, acceptUrl: acceptUrlFor(token), expiresAt }
}

export async function revokeInvitation(session: AppSession, invitationId: string) {
  const invitation = await session.db.invitation.findUnique({ where: { id: invitationId } })
  if (!invitation) throw new TeamError('Invitation not found.')

  await session.db.invitation.update({
    where: { id: invitationId },
    data: { revokedAt: new Date() },
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'team.invitation_revoked',
    entityType: 'Invitation',
    entityId: invitationId,
    after: { email: invitation.email },
  })
}

export interface AcceptInvitationInput {
  token: string
  firstName?: string
  lastName?: string
  password?: string
}

/**
 * Accept an invitation.
 *
 * Deliberately unscoped: the invitee is not yet a member of anything, and the
 * token is the only credential. It is looked up by hash, checked for expiry and
 * revocation, and consumed in the same transaction that creates the membership.
 */
export async function acceptInvitation(input: AcceptInvitationInput) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(input.token) },
    include: { organization: { select: { id: true, name: true } } },
  })

  if (!invitation) throw new TeamError('That invitation link is not valid.')
  if (invitation.revokedAt) throw new TeamError('That invitation was cancelled.')
  if (invitation.acceptedAt) throw new TeamError('That invitation has already been used.')
  if (invitation.expiresAt < new Date()) throw new TeamError('That invitation has expired.')

  const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } })

  if (!existingUser) {
    if (!input.password || input.password.length < 10) {
      throw new TeamError('Choose a password of at least 10 characters.')
    }
    if (!input.firstName?.trim() || !input.lastName?.trim()) {
      throw new TeamError('Enter your first and last name.')
    }
  }

  const passwordHash = input.password ? await hashPassword(input.password) : null

  const result = await prisma.$transaction(async (tx) => {
    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          email: invitation.email,
          passwordHash: passwordHash!,
          firstName: input.firstName!.trim(),
          lastName: input.lastName!.trim(),
          emailVerifiedAt: new Date(),
        },
      }))

    const membership = await tx.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: invitation.organizationId } },
      create: {
        userId: user.id,
        organizationId: invitation.organizationId,
        role: invitation.role,
        defaultLocationId: invitation.defaultLocationId,
        isActive: true,
      },
      update: { isActive: true, role: invitation.role },
    })

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    })

    return { user, membership }
  })

  await recordAudit({
    organizationId: invitation.organizationId,
    actorUserId: result.user.id,
    action: 'team.invitation_accepted',
    entityType: 'Membership',
    entityId: result.membership.id,
    after: { email: invitation.email, role: invitation.role },
  })

  return {
    organizationId: invitation.organizationId,
    organizationName: invitation.organization.name,
    email: invitation.email,
    isNewUser: !existingUser,
  }
}

/** What an invitee sees before accepting. Never exposes anything else. */
export async function previewInvitation(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      organization: { select: { name: true } },
    },
  })
  if (!invitation) return null

  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true, firstName: true },
  })

  return {
    email: invitation.email,
    role: invitation.role,
    organizationName: invitation.organization.name,
    expired: invitation.expiresAt < new Date(),
    used: invitation.acceptedAt !== null,
    revoked: invitation.revokedAt !== null,
    hasAccount: existingUser !== null,
    firstName: existingUser?.firstName ?? null,
  }
}

export interface UpdateMemberInput {
  membershipId: string
  role?: OrgRole
  isActive?: boolean
  defaultLocationId?: string | null
}

export async function updateMember(session: AppSession, input: UpdateMemberInput) {
  const membership = await session.db.membership.findUnique({
    where: { id: input.membershipId },
    include: { user: { select: { id: true, email: true } } },
  })
  if (!membership) throw new TeamError('Team member not found.')

  // Nobody changes their own role or switches themselves off.
  if (membership.userId === session.userId) {
    if (input.role !== undefined && input.role !== membership.role) {
      throw new TeamError('You cannot change your own role. Ask another owner or admin.')
    }
    if (input.isActive === false) {
      throw new TeamError('You cannot deactivate your own account.')
    }
  }

  // An admin cannot touch an owner, and only an owner can mint one.
  if (membership.role === 'OWNER' && session.role !== 'OWNER') {
    throw new TeamError('Only an owner can change another owner.')
  }
  if (input.role !== undefined) assertMayAssignRole(session, input.role)

  const losingOwner =
    membership.role === 'OWNER' &&
    ((input.role !== undefined && input.role !== 'OWNER') || input.isActive === false)

  if (losingOwner) {
    const owners = await session.db.membership.count({
      where: { role: 'OWNER', isActive: true },
    })
    if (owners <= 1) {
      throw new TeamError(
        'This is the only active owner. Promote someone else to owner first.',
      )
    }
  }

  if (input.defaultLocationId) {
    await assertLocationBelongsToTenant(session, input.defaultLocationId)
  }

  const updated = await session.db.membership.update({
    where: { id: input.membershipId },
    data: {
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.defaultLocationId !== undefined
        ? { defaultLocationId: input.defaultLocationId }
        : {}),
    },
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'team.member_updated',
    entityType: 'Membership',
    entityId: input.membershipId,
    before: { role: membership.role, isActive: membership.isActive },
    after: { role: updated.role, isActive: updated.isActive },
  })

  return updated
}

/** Only an owner can grant ownership. */
function assertMayAssignRole(session: AppSession, role: OrgRole) {
  if (role === 'OWNER' && session.role !== 'OWNER') {
    throw new TeamError('Only an owner can make someone else an owner.')
  }
}

async function assertLocationBelongsToTenant(session: AppSession, locationId: string) {
  const location = await session.db.inventoryLocation.findUnique({
    where: { id: locationId },
    select: { id: true },
  })
  if (!location) throw new TeamError('That inventory location does not exist.')
}
