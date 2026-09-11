import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { taxCentsFor } from '@/lib/money'

/**
 * Estimate totals and immutable versions.
 *
 * Two rules drive this file:
 *
 * 1. Money on a saved document never recomputes from the price book. Line
 *    items snapshot their name and unit price when added, and option totals
 *    are stored. Editing a price book entry tomorrow cannot change what a
 *    customer agreed to today.
 *
 * 2. A signature points at a specific version and its content hash. Changing
 *    an estimate after it was signed produces a NEW version; the signed one
 *    stays exactly as the customer saw it.
 */

export interface LineInput {
  quantity: number
  unitPriceCents: number
  taxable: boolean
}

export interface OptionTotals {
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
}

/**
 * Discount lines carry a negative unit price and are excluded from the taxable
 * base only to the extent they are themselves marked non-taxable, so a company
 * can model either convention without the app guessing.
 */
export function computeTotals(lines: LineInput[], taxRateBps: number): OptionTotals {
  let subtotalCents = 0
  let discountCents = 0
  let taxableBaseCents = 0

  for (const line of lines) {
    const lineCents = Math.round(line.quantity * line.unitPriceCents)
    if (lineCents < 0) discountCents += -lineCents
    subtotalCents += lineCents
    if (line.taxable) taxableBaseCents += lineCents
  }

  const taxCents = taxCentsFor(Math.max(taxableBaseCents, 0), taxRateBps)

  return {
    subtotalCents,
    discountCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  }
}

/** Stable key ordering so the same document always hashes to the same value. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Prisma.Decimal) return value.toString()
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

export function hashDocument(snapshot: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(snapshot))).digest('hex')
}

/**
 * Freeze the current state of an estimate as a new version. Call this when an
 * estimate is sent and again before a signature is captured, so the document
 * the signer saw is recoverable byte for byte.
 */
export async function snapshotEstimate(params: {
  organizationId: string
  estimateId: string
  createdById?: string | null
}) {
  const { organizationId, estimateId } = params

  return prisma.$transaction(async (tx) => {
    const estimate = await tx.estimate.findFirst({
      where: { id: estimateId, organizationId },
      include: {
        customer: true,
        options: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
      },
    })
    if (!estimate) throw new Error('Estimate not found')

    const organization = await tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        name: true, logoUrl: true, phone: true, email: true, website: true,
        addressLine1: true, addressLine2: true, city: true, state: true, postalCode: true,
      },
    })

    const last = await tx.estimateVersion.findFirst({
      where: { estimateId },
      orderBy: { version: 'desc' },
      select: { version: true },
    })

    const snapshot = {
      estimateNumber: estimate.number,
      title: estimate.title,
      customerMessage: estimate.customerMessage,
      termsText: estimate.termsText,
      taxRateBps: estimate.taxRateBps,
      expiresAt: estimate.expiresAt,
      organization,
      customer: {
        firstName: estimate.customer.firstName,
        lastName: estimate.customer.lastName,
        companyName: estimate.customer.companyName,
        email: estimate.customer.email,
        phone: estimate.customer.phone,
      },
      options: estimate.options.map((option) => ({
        tier: option.tier,
        name: option.name,
        description: option.description,
        isRecommended: option.isRecommended,
        subtotalCents: option.subtotalCents,
        discountCents: option.discountCents,
        taxCents: option.taxCents,
        totalCents: option.totalCents,
        items: option.items.map((item) => ({
          kind: item.kind,
          name: item.name,
          description: item.description,
          sku: item.sku,
          quantity: item.quantity.toString(),
          unitPriceCents: item.unitPriceCents,
          taxable: item.taxable,
        })),
      })),
    }

    return tx.estimateVersion.create({
      data: {
        estimateId,
        version: (last?.version ?? 0) + 1,
        snapshot: canonicalize(snapshot) as Prisma.InputJsonValue,
        contentHash: hashDocument(snapshot),
        createdById: params.createdById ?? null,
      },
    })
  })
}
