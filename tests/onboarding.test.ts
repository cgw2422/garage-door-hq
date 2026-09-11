import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { applyCompanySize, createCompany, registerOwner } from '@/server/organizations/onboarding'
import { trialDays } from '@/server/organizations/provision'

/**
 * Signup and provisioning. The behaviour worth protecting: a new account is
 * immediately usable, a solo operator is never asked which truck, and referral
 * attribution is captured once and never rewritten.
 */

let counter = 0
const unique = () => `t${Date.now()}${counter++}`

async function signUp(name: string, referralCode?: string) {
  const id = unique()
  const user = await registerOwner({
    firstName: 'New',
    lastName: 'Owner',
    email: `${id}@test.invalid`,
    password: 'a-long-enough-password',
  })
  const { organizationId } = await createCompany({
    ownerUserId: user.id,
    name: `${name} ${id}`,
    phone: '(555) 111-2222',
    postalCode: '28206',
    referralCode,
  })
  return { user, organizationId }
}

describe('signup', () => {
  it('refuses a duplicate email', async () => {
    const id = unique()
    await registerOwner({
      firstName: 'A',
      lastName: 'B',
      email: `${id}@test.invalid`,
      password: 'a-long-enough-password',
    })
    await expect(
      registerOwner({
        firstName: 'C',
        lastName: 'D',
        email: `${id}@test.invalid`,
        password: 'a-long-enough-password',
      }),
    ).rejects.toThrow(/already exists/i)
  })

  it('never stores the password itself', async () => {
    const { user } = await signUp('Hash Check')
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(stored.passwordHash).not.toContain('a-long-enough-password')
    expect(stored.passwordHash.startsWith('$2')).toBe(true)
  })
})

describe('provisioning a new company', () => {
  it('sets the account up so it is usable immediately', async () => {
    const { organizationId } = await signUp('Fresh Doors')

    const [jobTypes, catalog, packages, remedies, sequences, subscription] = await Promise.all([
      prisma.jobType.count({ where: { organizationId } }),
      prisma.priceBookItem.count({ where: { organizationId } }),
      prisma.priceBookPackage.count({ where: { organizationId } }),
      prisma.inspectionRemedy.count({ where: { organizationId } }),
      prisma.numberSequence.count({ where: { organizationId } }),
      prisma.subscription.findUniqueOrThrow({ where: { organizationId } }),
    ])

    expect(jobTypes).toBeGreaterThan(10)
    expect(catalog).toBeGreaterThan(20)
    expect(packages).toBeGreaterThan(0)
    expect(remedies).toBeGreaterThan(0)
    expect(sequences).toBe(5)

    expect(subscription.status).toBe('TRIALING')
    expect(subscription.priceCents).toBe(3999)
    const days = Math.round(
      (subscription.trialEndsAt!.getTime() - subscription.createdAt.getTime()) / 86_400_000,
    )
    expect(days).toBe(trialDays())
  })

  it('gives a solo operator one truck called My Truck and assigns it', async () => {
    const { user, organizationId } = await signUp('Solo Doors')

    const locations = await prisma.inventoryLocation.findMany({ where: { organizationId } })
    expect(locations).toHaveLength(1)
    expect(locations[0]!.name).toBe('My Truck')
    expect(locations[0]!.assignedUserId).toBe(user.id)

    const membership = await prisma.membership.findFirstOrThrow({
      where: { organizationId, userId: user.id },
    })
    expect(membership.role).toBe('OWNER')
    // "My Truck" is resolved from the membership, so the UI never has to ask.
    expect(membership.defaultLocationId).toBe(locations[0]!.id)
  })

  it('adds a warehouse and renames the truck when the company is a team', async () => {
    const { user, organizationId } = await signUp('Team Doors')

    await applyCompanySize({ organizationId, actorUserId: user.id, companySize: 'SMALL_2_5' })

    const locations = await prisma.inventoryLocation.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    })
    expect(locations.map((location) => location.name)).toEqual(['Truck #1', 'Warehouse'])
  })

  it('starts every stocked part at zero with a useful minimum', async () => {
    const { organizationId } = await signUp('Zero Stock')
    const levels = await prisma.stockLevel.findMany({ where: { organizationId } })

    expect(levels.length).toBeGreaterThan(0)
    expect(levels.every((level) => Number(level.quantity.toString()) === 0)).toBe(true)
    expect(levels.some((level) => Number(level.minQuantity.toString()) > 0)).toBe(true)
  })

  it('is idempotent: a second company step does not create a second company', async () => {
    const { user, organizationId } = await signUp('Once Only')
    const again = await createCompany({ ownerUserId: user.id, name: 'Should Not Happen' })

    expect(again.created).toBe(false)
    expect(again.organizationId).toBe(organizationId)
    expect(await prisma.membership.count({ where: { userId: user.id } })).toBe(1)
  })
})

describe('referral attribution', () => {
  it('records the affiliate at signup', async () => {
    const affiliate = await prisma.affiliate.create({
      data: {
        name: 'Partner',
        email: `partner-${unique()}@test.invalid`,
        code: `CODE${unique().toUpperCase()}`,
        commissionPercent: 20,
      },
    })

    const { organizationId } = await signUp('Referred Doors', affiliate.code.toLowerCase())

    const referral = await prisma.referral.findUniqueOrThrow({ where: { organizationId } })
    expect(referral.affiliateId).toBe(affiliate.id)
    expect(referral.code).toBe(affiliate.code)
  })

  it('ignores an unknown code rather than failing signup', async () => {
    const { organizationId } = await signUp('Bad Code Doors', 'NOPE-NOT-REAL')
    expect(await prisma.referral.findUnique({ where: { organizationId } })).toBeNull()
  })
})
