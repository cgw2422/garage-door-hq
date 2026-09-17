import { randomUUID } from 'node:crypto'
import type { OrgRole } from '@prisma/client'
import { prisma } from '@/lib/db'
import { tenantDb } from '@/lib/tenancy'
import type { AppSession } from '@/lib/session'
import { provisionOrganization } from '@/server/organizations/provision'

/**
 * Build a real organization through the same provisioning path signup uses, and
 * return a session object shaped exactly like the one server actions receive.
 * Tests then exercise the production code path rather than a fixture of it.
 */
export async function createTestCompany(options?: {
  companySize?: 'SOLO' | 'SMALL_2_5' | 'LARGE_6_PLUS'
  taxRateBps?: number
}) {
  const suffix = randomUUID().slice(0, 8)

  const user = await prisma.user.create({
    data: {
      email: `owner-${suffix}@test.invalid`,
      passwordHash: 'not-a-real-hash',
      firstName: 'Test',
      lastName: 'Owner',
    },
  })

  const { organization, defaultLocationId } = await provisionOrganization({
    ownerUserId: user.id,
    name: `Test Doors ${suffix}`,
    slug: `test-doors-${suffix}`,
    companySize: options?.companySize ?? 'SOLO',
  })

  if (options?.taxRateBps !== undefined) {
    await prisma.organization.update({
      where: { id: organization.id },
      data: { defaultTaxRateBps: options.taxRateBps },
    })
  }

  const session: AppSession = {
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    avatarUrl: null,
    platformRole: 'NONE',
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    timezone: organization.timezone,
    currency: organization.currency,
    defaultTaxRateBps: options?.taxRateBps ?? organization.defaultTaxRateBps,
    role: 'OWNER',
    defaultLocationId,
    isSoloOperator: (options?.companySize ?? 'SOLO') === 'SOLO',
    db: tenantDb(organization.id),
  }

  return { session, organizationId: organization.id, userId: user.id, locationId: defaultLocationId }
}

/**
 * A number nothing else in the suite will pick.
 *
 * These fixtures used `uniqueNumber()` for columns the
 * database requires to be unique per organization. That is not a unique number
 * generator, it is a collision with a low probability — and a suite that runs
 * on every push eventually finds it. It did: a `(organizationId, number)`
 * violation in `completion.test.ts`, on a commit that touched nothing near it,
 * passing on a re-run.
 *
 * A counter cannot collide with itself. It starts well above the values tests
 * write by hand (the largest is 999_999 in `numbering.test.ts`) so those cannot
 * collide with it either.
 */
let nextNumber = 500_000

export function uniqueNumber(): number {
  return nextNumber++
}

/** A customer with an address and a door carrying a current spring system. */
export async function createTestDoor(session: AppSession) {
  const customer = await prisma.customer.create({
    data: {
      organizationId: session.organizationId,
      number: uniqueNumber(),
      firstName: 'Sam',
      lastName: 'Tester',
      phone: '(555) 000-0000',
      properties: {
        create: {
          organizationId: session.organizationId,
          line1: '1 Test Ln',
          city: 'Charlotte',
          state: 'NC',
          postalCode: '28202',
        },
      },
    },
    include: { properties: true },
  })

  const property = customer.properties[0]!

  const door = await prisma.door.create({
    data: {
      organizationId: session.organizationId,
      propertyId: property.id,
      number: uniqueNumber(),
      nickname: 'Front Garage',
      widthInches: 192,
      heightInches: 84,
      weightLbs: 178,
      springSystems: {
        create: {
          organizationId: session.organizationId,
          type: 'TORSION',
          drumModel: '400-8',
          isCurrent: true,
          installedAt: new Date('2024-01-01'),
          springs: {
            create: [
              { wireSizeInches: 0.225, insideDiameterInches: 2, lengthInches: 27, wind: 'LEFT_HAND', quantity: 1, cycleRating: 10000 },
              { wireSizeInches: 0.225, insideDiameterInches: 2, lengthInches: 27, wind: 'RIGHT_HAND', quantity: 1, cycleRating: 10000 },
            ],
          },
        },
      },
    },
  })

  return { customer, property, door }
}

export async function createTestJob(
  session: AppSession,
  ids: { customerId: string; propertyId: string; doorId?: string | null },
) {
  return prisma.job.create({
    data: {
      organizationId: session.organizationId,
      number: uniqueNumber(),
      customerId: ids.customerId,
      propertyId: ids.propertyId,
      doorId: ids.doorId ?? null,
      assignedToId: session.userId,
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    },
  })
}

/** Put stock on the technician's truck so completion has something to consume. */
export async function stockTruck(
  session: AppSession,
  entries: Array<{ sku: string; quantity: number }>,
) {
  const items = await prisma.priceBookItem.findMany({
    where: { organizationId: session.organizationId, sku: { in: entries.map((e) => e.sku) } },
  })
  const bySku = new Map(items.map((item) => [item.sku!, item]))

  for (const entry of entries) {
    const item = bySku.get(entry.sku)
    if (!item) throw new Error(`Unknown SKU in test setup: ${entry.sku}`)

    await prisma.inventoryTransaction.create({
      data: {
        organizationId: session.organizationId,
        priceBookItemId: item.id,
        kind: 'RECEIPT',
        toLocationId: session.defaultLocationId!,
        quantity: entry.quantity,
      },
    })
    await prisma.stockLevel.upsert({
      where: {
        locationId_priceBookItemId: {
          locationId: session.defaultLocationId!,
          priceBookItemId: item.id,
        },
      },
      create: {
        organizationId: session.organizationId,
        locationId: session.defaultLocationId!,
        priceBookItemId: item.id,
        quantity: entry.quantity,
      },
      update: { quantity: { increment: entry.quantity } },
    })
  }

  return bySku
}

export async function skuId(organizationId: string, sku: string) {
  const item = await prisma.priceBookItem.findFirstOrThrow({
    where: { organizationId, sku },
    select: { id: true },
  })
  return item.id
}

export async function stockOf(locationId: string, priceBookItemId: string) {
  const level = await prisma.stockLevel.findUnique({
    where: { locationId_priceBookItemId: { locationId, priceBookItemId } },
  })
  return Number((level?.quantity ?? 0).toString())
}

/**
 * A second (or third) member of an existing company, with any role.
 *
 * Used by the authorization tests: the point is to exercise the same service
 * functions the app calls, with a session that differs only by role.
 */
export async function addTestMember(
  session: AppSession,
  role: OrgRole,
  options?: { isActive?: boolean },
): Promise<AppSession> {
  const suffix = randomUUID().slice(0, 8)

  const user = await prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${suffix}@test.invalid`,
      passwordHash: 'not-a-real-hash',
      firstName: role.charAt(0) + role.slice(1).toLowerCase(),
      lastName: 'Member',
    },
  })

  const membership = await prisma.membership.create({
    data: {
      userId: user.id,
      organizationId: session.organizationId,
      role,
      isActive: options?.isActive ?? true,
      defaultLocationId: session.defaultLocationId,
    },
  })

  return {
    ...session,
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    role,
    isSoloOperator: false,
    defaultLocationId: membership.defaultLocationId,
  }
}

/** The owner's membership row, for tests that change roles. */
export async function ownerMembership(session: AppSession) {
  return prisma.membership.findFirstOrThrow({
    where: { organizationId: session.organizationId, userId: session.userId },
  })
}

export async function membershipFor(session: AppSession, userId: string) {
  return prisma.membership.findFirstOrThrow({
    where: { organizationId: session.organizationId, userId },
  })
}
