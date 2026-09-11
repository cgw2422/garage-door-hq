import type { CompanySize } from '@prisma/client'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { recordAudit } from '@/lib/audit'
import { provisionOrganization, slugify } from './provision'

export class OnboardingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OnboardingError'
  }
}

/**
 * Create the owner's account. Deliberately just name, email and password — the
 * company comes next, so nobody is staring at a long form before they have seen
 * anything.
 */
export async function registerOwner(input: {
  firstName: string
  lastName: string
  email: string
  password: string
}) {
  const email = input.email.toLowerCase().trim()

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    throw new OnboardingError('An account with that email already exists. Try signing in.')
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
    },
  })

  await recordAudit({
    actorUserId: user.id,
    action: 'user.registered',
    entityType: 'User',
    entityId: user.id,
  })

  return user
}

/**
 * Step two: create the company. The account becomes usable here — everything
 * after this point is optional and can be done from inside the app.
 */
export async function createCompany(input: {
  ownerUserId: string
  name: string
  phone?: string | null
  postalCode?: string | null
  timezone?: string
  referralCode?: string | null
  /** False starts with an empty price book instead of the starter catalog. */
  includeStarterCatalog?: boolean
}) {
  const alreadyIn = await prisma.membership.findFirst({
    where: { userId: input.ownerUserId, isActive: true },
    select: { organizationId: true },
  })
  if (alreadyIn) return { organizationId: alreadyIn.organizationId, created: false }

  const slug = await slugify(input.name)
  const { organization } = await provisionOrganization({
    ownerUserId: input.ownerUserId,
    name: input.name,
    slug,
    // Solo until they say otherwise on the next screen; it is the least
    // presumptuous default and the one most new accounts actually are.
    companySize: 'SOLO',
    phone: input.phone,
    postalCode: input.postalCode,
    timezone: input.timezone,
    referralCode: input.referralCode,
    includeStarterCatalog: input.includeStarterCatalog !== false,
  })

  await recordAudit({
    organizationId: organization.id,
    actorUserId: input.ownerUserId,
    action: 'organization.created',
    entityType: 'Organization',
    entityId: organization.id,
    after: { name: organization.name, slug: organization.slug },
  })

  return { organizationId: organization.id, created: true }
}

/**
 * Step three: company size.
 *
 * A solo operator keeps one location called "My Truck" and is never asked which
 * truck. Choosing a team size adds a warehouse and renames the truck, because
 * from that point on transfers between locations are a real workflow.
 */
export async function applyCompanySize(input: {
  organizationId: string
  actorUserId: string
  companySize: CompanySize
}) {
  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.update({
      where: { id: input.organizationId },
      data: { companySize: input.companySize },
    })

    if (input.companySize === 'SOLO') return organization

    const locations = await tx.inventoryLocation.findMany({
      where: { organizationId: input.organizationId },
    })

    const myTruck = locations.find((location) => location.name === 'My Truck')
    if (myTruck) {
      await tx.inventoryLocation.update({
        where: { id: myTruck.id },
        data: { name: 'Truck #1' },
      })
    }

    if (!locations.some((location) => location.kind === 'WAREHOUSE')) {
      await tx.inventoryLocation.create({
        data: { organizationId: input.organizationId, name: 'Warehouse', kind: 'WAREHOUSE' },
      })
    }

    return organization
  })
}

export async function completeOnboarding(organizationId: string) {
  return prisma.organization.update({
    where: { id: organizationId },
    data: { onboardingCompletedAt: new Date() },
  })
}
