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

/**
 * Corrections to a customer record.
 *
 * Editing a customer never touches the documents they are on: estimates and
 * invoices snapshot the name and contact details they were created with.
 */
export async function updateCustomer(
  session: AppSession,
  customerId: string,
  input: CustomerInput,
) {
  const before = await session.db.customer.findUnique({ where: { id: customerId } })
  if (!before) throw new Error('Customer not found')

  const customer = await session.db.customer.update({
    where: { id: customerId },
    data: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      companyName: input.companyName?.trim() || null,
      phone: input.phone?.trim() || null,
      altPhone: input.altPhone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      notesSummary: input.notesSummary?.trim() || null,
      ...(input.tags ? { tags: input.tags } : {}),
    },
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'customer.updated',
    entityType: 'Customer',
    entityId: customerId,
    before: { name: `${before.firstName} ${before.lastName}`, phone: before.phone },
    after: { name: `${customer.firstName} ${customer.lastName}`, phone: customer.phone },
  })

  return customer
}

/**
 * Archive rather than delete.
 *
 * A customer is referenced by jobs, estimates, invoices and payments. Removing
 * the row would either fail on a foreign key or destroy the financial history
 * that explains a year's revenue.
 */
export async function archiveCustomer(session: AppSession, customerId: string) {
  const open = await session.db.invoice.aggregate({
    where: { customerId, archivedAt: null, status: { in: ['SENT', 'PARTIAL', 'PAST_DUE'] } },
    _sum: { balanceCents: true },
    _count: true,
  })
  if (open._count > 0) {
    throw new Error(
      `This customer has ${open._count} unpaid invoice${open._count === 1 ? '' : 's'}. Settle or void ${open._count === 1 ? 'it' : 'them'} first.`,
    )
  }

  const customer = await session.db.customer.update({
    where: { id: customerId },
    data: { archivedAt: new Date() },
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'customer.archived',
    entityType: 'Customer',
    entityId: customerId,
    after: { name: `${customer.firstName} ${customer.lastName}` },
  })

  return customer
}

export async function restoreCustomer(session: AppSession, customerId: string) {
  return session.db.customer.update({
    where: { id: customerId },
    data: { archivedAt: null },
  })
}

export async function updateProperty(
  session: AppSession,
  propertyId: string,
  input: PropertyInput,
) {
  const property = await session.db.property.update({
    where: { id: propertyId },
    data: {
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
    action: 'property.updated',
    entityType: 'Property',
    entityId: propertyId,
    after: { line1: property.line1 },
  })

  return property
}

export async function archiveProperty(session: AppSession, propertyId: string) {
  const activeJobs = await session.db.job.count({
    where: {
      propertyId,
      archivedAt: null,
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    },
  })
  if (activeJobs > 0) {
    throw new Error('This address still has open jobs. Finish or cancel them first.')
  }

  return session.db.property.update({
    where: { id: propertyId },
    data: { archivedAt: new Date() },
  })
}

export async function restoreProperty(session: AppSession, propertyId: string) {
  return session.db.property.update({
    where: { id: propertyId },
    data: { archivedAt: null },
  })
}
