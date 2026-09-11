import type { PropertyKind } from '@prisma/client'
import { prisma } from '@/lib/db'
import { nextNumber } from '@/lib/numbering'
import { recordAudit } from '@/lib/audit'
import type { AppSession } from '@/lib/session'

export interface CustomerInput {
  firstName: string
  lastName: string
  companyName?: string | null
  phone?: string | null
  altPhone?: string | null
  email?: string | null
  notesSummary?: string | null
  tags?: string[]
}

export interface PropertyInput {
  nickname?: string | null
  line1: string
  line2?: string | null
  city: string
  state: string
  postalCode: string
  kind?: PropertyKind
  accessInstructions?: string | null
  gateInfo?: string | null
}

/**
 * Create a customer, optionally with their first service address in the same
 * transaction. A new call almost always arrives as "name, phone, address", so
 * making the address a second screen would be friction for no reason.
 */
export async function createCustomer(
  session: AppSession,
  input: CustomerInput & { property?: PropertyInput },
) {
  const result = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, session.organizationId, 'CUSTOMER')

    const customer = await tx.customer.create({
      data: {
        organizationId: session.organizationId,
        number,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        companyName: input.companyName?.trim() || null,
        phone: input.phone?.trim() || null,
        altPhone: input.altPhone?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
        notesSummary: input.notesSummary?.trim() || null,
        tags: input.tags ?? [],
      },
    })

    const property = input.property
      ? await tx.property.create({
          data: {
            organizationId: session.organizationId,
            customerId: customer.id,
            nickname: input.property.nickname?.trim() || null,
            line1: input.property.line1.trim(),
            line2: input.property.line2?.trim() || null,
            city: input.property.city.trim(),
            state: input.property.state.trim().toUpperCase(),
            postalCode: input.property.postalCode.trim(),
            kind: input.property.kind ?? 'RESIDENTIAL',
            accessInstructions: input.property.accessInstructions?.trim() || null,
            gateInfo: input.property.gateInfo?.trim() || null,
          },
        })
      : null

    return { customer, property }
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'customer.created',
    entityType: 'Customer',
    entityId: result.customer.id,
    after: { number: result.customer.number, name: `${input.firstName} ${input.lastName}` },
  })

  return result
}

export async function createProperty(
  session: AppSession,
  customerId: string,
  input: PropertyInput,
) {
  // Scoped read first: a customer id from another tenant simply does not exist.
  const customer = await session.db.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  })
  if (!customer) throw new Error('Customer not found')

  const property = await session.db.property.create({
    data: {
      organizationId: session.organizationId,
      customerId,
      nickname: input.nickname?.trim() || null,
      line1: input.line1.trim(),
      line2: input.line2?.trim() || null,
      city: input.city.trim(),
      state: input.state.trim().toUpperCase(),
      postalCode: input.postalCode.trim(),
      kind: input.kind ?? 'RESIDENTIAL',
      accessInstructions: input.accessInstructions?.trim() || null,
      gateInfo: input.gateInfo?.trim() || null,
    },
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'property.created',
    entityType: 'Property',
    entityId: property.id,
    after: { customerId, line1: property.line1 },
  })

  return property
}
