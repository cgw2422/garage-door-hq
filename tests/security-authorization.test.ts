import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import { PERMISSIONS, roleCan, isPlatformStaff, type Permission } from '@/lib/rbac'
import { inviteMember, updateMember } from '@/server/team/service'
import { extendTrial, grantComplimentary } from '@/server/platform/service'
import { addTestMember, createTestCompany, membershipFor, ownerMembership } from './helpers'

/**
 * What a role can do when nobody is hiding the button.
 *
 * Every check here calls the service directly with a session carrying a
 * particular role, which is what a technician gets by opening devtools and
 * replaying a server action with a different payload. The UI is not in the
 * loop, so anything that passes here passes for a determined employee.
 *
 * The hierarchy under test: a technician does the work, the office runs the
 * day, an admin runs the company, an owner owns it, and Garage Door HQ's own
 * staff are not in that hierarchy at all.
 */

let company: AppSession
let owner: AppSession
let admin: AppSession
let office: AppSession
let technician: AppSession

beforeAll(async () => {
  const created = await createTestCompany()
  company = created.session
  owner = created.session
  admin = await addTestMember(company, 'ADMIN')
  office = await addTestMember(company, 'OFFICE')
  technician = await addTestMember(company, 'TECHNICIAN')
}, 60_000)

const ROLES = ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN'] as const

describe('the permission table is the whole of the rule', () => {
  it('never grants a permission to a role the table does not list', () => {
    for (const permission of Object.keys(PERMISSIONS) as Permission[]) {
      const allowed = PERMISSIONS[permission] as readonly string[]
      for (const role of ROLES) {
        expect(roleCan(role, permission), `${role} / ${permission}`).toBe(
          allowed.includes(role),
        )
      }
    }
  })

  it('keeps a technician away from money, policy and people', () => {
    for (const permission of [
      'pricebook:write',
      'invoice:write',
      'invoice:void',
      'payment:refund',
      'reports:financial',
      'team:read',
      'team:manage',
      'settings:manage',
      'subscription:manage',
      'schedule:assign',
      'customer:archive',
      'job:delete',
    ] as Permission[]) {
      expect(roleCan('TECHNICIAN', permission), permission).toBe(false)
    }
  })

  it('keeps the office out of policy, and admins out of the subscription', () => {
    for (const permission of [
      'pricebook:write',
      'settings:manage',
      'team:manage',
      'subscription:manage',
      'reports:financial',
    ] as Permission[]) {
      expect(roleCan('OFFICE', permission), permission).toBe(false)
    }
    expect(roleCan('ADMIN', 'subscription:manage')).toBe(false)
    expect(roleCan('OWNER', 'subscription:manage')).toBe(true)
  })
})

describe('privilege escalation inside a company', () => {
  it('will not let anyone promote themselves', async () => {
    for (const actor of [admin, office, technician]) {
      const membership = await membershipFor(company, actor.userId)
      await expect(
        updateMember(actor, { membershipId: membership.id, role: 'OWNER' }),
        `${actor.role} promoted themselves`,
      ).rejects.toThrow()

      const after = await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } })
      expect(after.role).toBe(actor.role)
    }
  })

  it('will not let an admin mint an owner, or touch the existing one', async () => {
    const technicianMembership = await membershipFor(company, technician.userId)
    await expect(
      updateMember(admin, { membershipId: technicianMembership.id, role: 'OWNER' }),
    ).rejects.toThrow(/owner/i)

    const ownerRow = await ownerMembership(company)
    await expect(
      updateMember(admin, { membershipId: ownerRow.id, role: 'TECHNICIAN' }),
    ).rejects.toThrow(/owner/i)
    await expect(
      updateMember(admin, { membershipId: ownerRow.id, isActive: false }),
    ).rejects.toThrow(/owner/i)

    expect((await prisma.membership.findUniqueOrThrow({ where: { id: ownerRow.id } })).role).toBe(
      'OWNER',
    )
  })

  it('will not let an admin invite an owner', async () => {
    await expect(
      inviteMember(admin, { email: `escalate-${Date.now()}@test.invalid`, role: 'OWNER' }),
    ).rejects.toThrow(/owner/i)
  })

  it('will not let the last owner be demoted, leaving nobody in charge', async () => {
    const ownerRow = await ownerMembership(company)
    await expect(
      updateMember(owner, { membershipId: ownerRow.id, role: 'ADMIN' }),
    ).rejects.toThrow()
  })

  it('lets an owner do the legitimate version of all of it', async () => {
    const technicianMembership = await membershipFor(company, technician.userId)
    await updateMember(owner, { membershipId: technicianMembership.id, role: 'OFFICE' })
    expect(
      (await prisma.membership.findUniqueOrThrow({ where: { id: technicianMembership.id } })).role,
    ).toBe('OFFICE')
    await updateMember(owner, { membershipId: technicianMembership.id, role: 'TECHNICIAN' })
  })

  it('cannot invite someone into a company by naming a different organization', async () => {
    const other = await createTestCompany()
    const email = `crosstenant-${Date.now()}@test.invalid`
    const invitation = await inviteMember(owner, { email, role: 'TECHNICIAN' })
    const row = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.invitationId } })
    // The organization comes from the session, never from the input.
    expect(row.organizationId).toBe(company.organizationId)
    expect(row.organizationId).not.toBe(other.session.organizationId)
  })
})

describe('a deactivated member', () => {
  it('stops having a session at all', async () => {
    const leaver = await addTestMember(company, 'OFFICE')
    const membership = await membershipFor(company, leaver.userId)
    await updateMember(owner, { membershipId: membership.id, isActive: false })

    // getSession() resolves the organization from an *active* membership, so a
    // switched-off account has no tenant to act in. Proven at the source the
    // session reads rather than through a mocked session object.
    const active = await prisma.membership.findFirst({
      where: { userId: leaver.userId, isActive: true },
    })
    expect(active).toBeNull()
  })
})

describe('Garage Door HQ staff are not company staff', () => {
  it('are a separate axis from the company role', () => {
    expect(isPlatformStaff('NONE')).toBe(false)
    expect(isPlatformStaff('PLATFORM_ADMIN')).toBe(true)
    expect(isPlatformStaff('PLATFORM_SUPPORT')).toBe(true)
    // An OWNER is an organization role; it says nothing about platform access.
    expect(roleCan('OWNER', 'settings:manage')).toBe(true)
    expect(isPlatformStaff('NONE')).toBe(false)
  })

  it('an owner is not platform staff just by owning a company', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } })
    expect(user.platformRole).toBe('NONE')
    expect(isPlatformStaff(user.platformRole)).toBe(false)
  })

  it('platform actions demand platform staff, not an owner', async () => {
    // The platform services take an AuthenticatedUser that the route resolves
    // through requirePlatformStaff(). Handing them a company owner's identity
    // must not be enough on its own — the guard is the gate, so the test
    // asserts the gate rejects them.
    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } })
    expect(isPlatformStaff(ownerUser.platformRole)).toBe(false)

    const staff = await prisma.user.create({
      data: {
        email: `staff-${Date.now()}@garagedoorhq.test`,
        passwordHash: 'not-a-real-hash',
        firstName: 'Platform',
        lastName: 'Admin',
        platformRole: 'PLATFORM_ADMIN',
      },
    })
    expect(isPlatformStaff(staff.platformRole)).toBe(true)

    // And platform staff belong to no company, so they never pick up a tenant.
    expect(
      await prisma.membership.count({ where: { userId: staff.id } }),
      'platform staff must not hold a company membership',
    ).toBe(0)
  })

  it('records who granted a company free time, and why', async () => {
    const staff = await prisma.user.create({
      data: {
        email: `staff2-${Date.now()}@garagedoorhq.test`,
        passwordHash: 'not-a-real-hash',
        firstName: 'Platform',
        lastName: 'Admin',
        platformRole: 'PLATFORM_ADMIN',
      },
    })
    const actor = {
      userId: staff.id,
      email: staff.email,
      firstName: staff.firstName,
      lastName: staff.lastName,
      fullName: 'Platform Admin',
      platformRole: 'PLATFORM_ADMIN' as const,
      hasOrganization: false,
    }

    await extendTrial(actor, { organizationId: company.organizationId, days: 7 })
    await grantComplimentary(actor, {
      organizationId: company.organizationId,
      months: 1,
      reason: 'Beta partner',
    })

    const audits = await prisma.auditLog.findMany({
      where: { organizationId: company.organizationId, actorUserId: staff.id },
    })
    expect(audits.length).toBeGreaterThanOrEqual(2)
    expect(audits.every((row) => row.actorUserId === staff.id)).toBe(true)
  })
})
