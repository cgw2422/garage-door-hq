import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { roleCan } from '@/lib/rbac'
import type { AppSession } from '@/lib/session'
import {
  acceptInvitation,
  inviteMember,
  previewInvitation,
  resendInvitation,
  revokeInvitation,
  TeamError,
  updateMember,
} from '@/server/team/service'
import { addTestMember, createTestCompany, membershipFor, ownerMembership } from './helpers'

/**
 * Role boundaries and the invitation lifecycle.
 *
 * Everything here is asserted against the service, not the screen, because
 * that is where the rules are enforced — a hidden button is not a control.
 */

let owner: AppSession

beforeAll(async () => {
  const company = await createTestCompany({ companySize: 'SMALL_2_5' })
  owner = company.session
})

describe('role permissions', () => {
  it('keeps owner-only and admin-only actions away from office and technicians', () => {
    expect(roleCan('OWNER', 'subscription:manage')).toBe(true)
    expect(roleCan('ADMIN', 'subscription:manage')).toBe(false)
    expect(roleCan('OFFICE', 'subscription:manage')).toBe(false)
    expect(roleCan('TECHNICIAN', 'subscription:manage')).toBe(false)

    for (const role of ['OFFICE', 'TECHNICIAN'] as const) {
      expect(roleCan(role, 'team:manage')).toBe(false)
      expect(roleCan(role, 'settings:manage')).toBe(false)
      expect(roleCan(role, 'pricebook:write')).toBe(false)
      expect(roleCan(role, 'reports:financial')).toBe(false)
      expect(roleCan(role, 'invoice:void')).toBe(false)
    }

    // A technician still does their own job.
    expect(roleCan('TECHNICIAN', 'job:write')).toBe(true)
    expect(roleCan('TECHNICIAN', 'estimate:write')).toBe(true)
    expect(roleCan('TECHNICIAN', 'inventory:adjust')).toBe(true)
    // But not other people's schedules.
    expect(roleCan('TECHNICIAN', 'schedule:assign')).toBe(false)
    expect(roleCan('OFFICE', 'schedule:assign')).toBe(true)
  })
})

describe('changing a team member', () => {
  it('refuses to let anyone change their own role', async () => {
    const membership = await ownerMembership(owner)
    await expect(
      updateMember(owner, { membershipId: membership.id, role: 'ADMIN' }),
    ).rejects.toThrow(/your own role/i)
  })

  it('refuses to let anyone deactivate themselves', async () => {
    const membership = await ownerMembership(owner)
    await expect(
      updateMember(owner, { membershipId: membership.id, isActive: false }),
    ).rejects.toThrow(/your own account/i)
  })

  it('refuses to demote the only owner', async () => {
    const admin = await addTestMember(owner, 'ADMIN')
    const ownerRow = await ownerMembership(owner)

    // An admin acting on an owner is refused outright.
    await expect(
      updateMember(admin, { membershipId: ownerRow.id, role: 'TECHNICIAN' }),
    ).rejects.toThrow(/only an owner/i)

    // And a second owner cannot strand the company either, until there are two.
    const second = await addTestMember(owner, 'OWNER')
    const secondRow = await membershipFor(owner, second.userId)

    await updateMember(owner, { membershipId: secondRow.id, role: 'TECHNICIAN' })
    expect((await membershipFor(owner, second.userId)).role).toBe('TECHNICIAN')

    await expect(
      updateMember(second, { membershipId: ownerRow.id, role: 'ADMIN' }),
    ).rejects.toThrow()
  })

  it('only lets an owner create another owner', async () => {
    const admin = await addTestMember(owner, 'ADMIN')
    const technician = await addTestMember(owner, 'TECHNICIAN')
    const technicianRow = await membershipFor(owner, technician.userId)

    await expect(
      updateMember(admin, { membershipId: technicianRow.id, role: 'OWNER' }),
    ).rejects.toThrow(/only an owner/i)

    await updateMember(owner, { membershipId: technicianRow.id, role: 'OWNER' })
    expect((await membershipFor(owner, technician.userId)).role).toBe('OWNER')
  })

  it('cannot reach a membership in another organization', async () => {
    const other = await createTestCompany()
    const foreign = await ownerMembership(other.session)

    await expect(
      updateMember(owner, { membershipId: foreign.id, role: 'TECHNICIAN' }),
    ).rejects.toThrow(/not found/i)

    expect((await prisma.membership.findUniqueOrThrow({ where: { id: foreign.id } })).role).toBe(
      'OWNER',
    )
  })

  it('refuses a truck from another organization', async () => {
    const other = await createTestCompany()
    const foreignLocation = await prisma.inventoryLocation.findFirstOrThrow({
      where: { organizationId: other.session.organizationId },
    })
    const technician = await addTestMember(owner, 'TECHNICIAN')
    const row = await membershipFor(owner, technician.userId)

    await expect(
      updateMember(owner, { membershipId: row.id, defaultLocationId: foreignLocation.id }),
    ).rejects.toThrow(/does not exist/i)
  })
})

describe('invitations', () => {
  it('stores only a hash and returns the token once', async () => {
    const result = await inviteMember(owner, {
      email: 'new-tech@test.invalid',
      role: 'TECHNICIAN',
    })

    expect(result.token.length).toBeGreaterThan(30)
    expect(result.acceptUrl).toContain(result.token)

    const stored = await prisma.invitation.findUniqueOrThrow({
      where: { id: result.invitationId },
    })
    expect(stored.tokenHash).not.toBe(result.token)
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('shows an invitee only what they need to decide', async () => {
    const { token } = await inviteMember(owner, {
      email: 'preview@test.invalid',
      role: 'OFFICE',
    })

    const preview = await previewInvitation(token)
    expect(preview).toMatchObject({
      email: 'preview@test.invalid',
      role: 'OFFICE',
      organizationName: owner.organizationName,
      used: false,
      revoked: false,
      expired: false,
    })
    // No ids of any kind leak into the preview.
    expect(JSON.stringify(preview)).not.toContain(owner.organizationId)
  })

  it('creates the user and the membership on accept, and burns the token', async () => {
    const { token } = await inviteMember(owner, {
      email: 'joiner@test.invalid',
      role: 'TECHNICIAN',
    })

    const accepted = await acceptInvitation({
      token,
      firstName: 'Jo',
      lastName: 'Iner',
      password: 'a-long-enough-password',
    })
    expect(accepted.isNewUser).toBe(true)

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'joiner@test.invalid' } })
    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: user.id, organizationId: owner.organizationId },
    })
    expect(membership.role).toBe('TECHNICIAN')
    expect(membership.isActive).toBe(true)

    await expect(acceptInvitation({ token })).rejects.toThrow(/already been used/i)
  })

  it('refuses a revoked invitation', async () => {
    const invite = await inviteMember(owner, {
      email: 'revoked@test.invalid',
      role: 'OFFICE',
    })
    await revokeInvitation(owner, invite.invitationId)

    await expect(
      acceptInvitation({
        token: invite.token,
        firstName: 'No',
        lastName: 'Entry',
        password: 'a-long-enough-password',
      }),
    ).rejects.toThrow(/cancelled/i)
  })

  it('refuses an expired invitation', async () => {
    const invite = await inviteMember(owner, {
      email: 'expired@test.invalid',
      role: 'OFFICE',
    })
    await prisma.invitation.update({
      where: { id: invite.invitationId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    await expect(acceptInvitation({ token: invite.token })).rejects.toThrow(/expired/i)
  })

  it('invalidates the old link when a new one is issued', async () => {
    const first = await inviteMember(owner, {
      email: 'reissued@test.invalid',
      role: 'TECHNICIAN',
    })
    const second = await resendInvitation(owner, first.invitationId)

    expect(second.token).not.toBe(first.token)
    expect(await previewInvitation(first.token)).toBeNull()
    expect(await previewInvitation(second.token)).not.toBeNull()
  })

  it('refuses to invite someone who is already on the team', async () => {
    await expect(
      inviteMember(owner, { email: owner.email, role: 'ADMIN' }),
    ).rejects.toBeInstanceOf(TeamError)
  })

  it('will not let an admin invite an owner', async () => {
    const admin = await addTestMember(owner, 'ADMIN')
    await expect(
      inviteMember(admin, { email: 'wannabe-owner@test.invalid', role: 'OWNER' }),
    ).rejects.toThrow(/only an owner/i)
  })

  it('requires a password for someone with no account', async () => {
    const invite = await inviteMember(owner, {
      email: 'nopassword@test.invalid',
      role: 'TECHNICIAN',
    })
    await expect(acceptInvitation({ token: invite.token })).rejects.toThrow(/password/i)
  })
})
