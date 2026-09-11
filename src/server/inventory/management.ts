import { Prisma, type InventoryTxnKind } from '@prisma/client'
import { recordAudit } from '@/lib/audit'
import type { AppSession } from '@/lib/session'
import { postLedgerMoves } from './ledger'

/**
 * Inventory management.
 *
 * Every quantity change in this file goes through the ledger. There is
 * deliberately no "set the quantity to N" path: a count that disagrees with
 * the shelf is corrected by posting the difference with a reason, so the
 * history explains itself and can always rebuild the on-hand figure.
 *
 * The only thing set directly is the minimum, which is a policy, not a count.
 */

export class InventoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InventoryError'
  }
}

/** Why stock moved, in the words a technician would use. */
export const ADJUSTMENT_REASONS = [
  { value: 'RECEIVED', label: 'Received a shipment', kind: 'RECEIPT', direction: 'in' },
  { value: 'RETURNED', label: 'Returned to the truck', kind: 'RETURN', direction: 'in' },
  { value: 'CORRECTION_UP', label: 'Count correction (found more)', kind: 'COUNT', direction: 'in' },
  { value: 'CORRECTION_DOWN', label: 'Count correction (found fewer)', kind: 'COUNT', direction: 'out' },
  { value: 'DAMAGED', label: 'Damaged', kind: 'ADJUSTMENT', direction: 'out' },
  { value: 'LOST', label: 'Lost or stolen', kind: 'ADJUSTMENT', direction: 'out' },
  { value: 'USED_OFF_JOB', label: 'Used without a job', kind: 'CONSUMPTION', direction: 'out' },
] as const

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]['value']

export function reasonFor(value: AdjustmentReason) {
  const reason = ADJUSTMENT_REASONS.find((entry) => entry.value === value)
  if (!reason) throw new InventoryError('Choose a reason for this adjustment.')
  return reason
}

/**
 * Start tracking a catalog item at a location.
 *
 * Creates the stock row at zero. Any opening quantity is posted as a receipt
 * so even the first number has a transaction behind it.
 */
export async function addStockedItem(
  session: AppSession,
  input: {
    priceBookItemId: string
    locationId: string
    minQuantity: number
    binLocation?: string | null
    openingQuantity?: number
  },
) {
  const [item, location] = await Promise.all([
    session.db.priceBookItem.findUnique({
      where: { id: input.priceBookItemId },
      select: { id: true, name: true, trackInventory: true, costCents: true },
    }),
    session.db.inventoryLocation.findUnique({
      where: { id: input.locationId },
      select: { id: true },
    }),
  ])
  if (!item) throw new InventoryError('That item is not in your price book.')
  if (!location) throw new InventoryError('That location does not exist.')
  if (!item.trackInventory) {
    throw new InventoryError(
      `"${item.name}" is not set to track inventory. Turn that on in the price book first.`,
    )
  }

  const existing = await session.db.stockLevel.findUnique({
    where: {
      locationId_priceBookItemId: {
        locationId: input.locationId,
        priceBookItemId: input.priceBookItemId,
      },
    },
  })
  if (existing) {
    throw new InventoryError(`"${item.name}" is already stocked at this location.`)
  }

  await session.db.stockLevel.create({
    data: {
      organizationId: session.organizationId,
      locationId: input.locationId,
      priceBookItemId: input.priceBookItemId,
      quantity: 0,
      minQuantity: new Prisma.Decimal(Math.max(input.minQuantity, 0)),
      binLocation: input.binLocation?.trim() || null,
    },
  })

  if (input.openingQuantity && input.openingQuantity > 0) {
    await postLedgerMoves({
      organizationId: session.organizationId,
      actorId: session.userId,
      moves: [
        {
          priceBookItemId: input.priceBookItemId,
          kind: 'RECEIPT',
          quantity: input.openingQuantity,
          toLocationId: input.locationId,
          unitCostCents: item.costCents,
          reason: 'Opening count',
        },
      ],
    })
  }

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'inventory.item_stocked',
    entityType: 'StockLevel',
    entityId: input.priceBookItemId,
    after: { locationId: input.locationId, openingQuantity: input.openingQuantity ?? 0 },
  })
}

/** The minimum is a restocking policy, not a count, so it is set directly. */
export async function setMinimum(
  session: AppSession,
  input: { locationId: string; priceBookItemId: string; minQuantity: number; binLocation?: string | null },
) {
  return session.db.stockLevel.update({
    where: {
      locationId_priceBookItemId: {
        locationId: input.locationId,
        priceBookItemId: input.priceBookItemId,
      },
    },
    data: {
      minQuantity: new Prisma.Decimal(Math.max(input.minQuantity, 0)),
      ...(input.binLocation !== undefined
        ? { binLocation: input.binLocation?.trim() || null }
        : {}),
    },
  })
}

/**
 * Adjust stock with a stated reason.
 *
 * Direction comes from the reason, not from a sign the user types, so "damaged
 * 3" can never accidentally add three.
 */
export async function adjustStock(
  session: AppSession,
  input: {
    locationId: string
    priceBookItemId: string
    quantity: number
    reason: AdjustmentReason
    note?: string | null
  },
) {
  if (!(input.quantity > 0)) {
    throw new InventoryError('Enter how many, as a positive number.')
  }

  const reason = reasonFor(input.reason)
  const item = await session.db.priceBookItem.findUnique({
    where: { id: input.priceBookItemId },
    select: { costCents: true },
  })
  if (!item) throw new InventoryError('That item is not in your price book.')

  await postLedgerMoves({
    organizationId: session.organizationId,
    actorId: session.userId,
    moves: [
      {
        priceBookItemId: input.priceBookItemId,
        kind: reason.kind as InventoryTxnKind,
        quantity: input.quantity,
        ...(reason.direction === 'in'
          ? { toLocationId: input.locationId }
          : { fromLocationId: input.locationId }),
        unitCostCents: item.costCents,
        reason: input.note?.trim() ? `${reason.label} — ${input.note.trim()}` : reason.label,
      },
    ],
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'inventory.adjusted',
    entityType: 'PriceBookItem',
    entityId: input.priceBookItemId,
    after: {
      locationId: input.locationId,
      quantity: input.quantity,
      reason: reason.value,
      direction: reason.direction,
    },
  })
}

export async function transferStock(
  session: AppSession,
  input: {
    fromLocationId: string
    toLocationId: string
    priceBookItemId: string
    quantity: number
    note?: string | null
  },
) {
  if (input.fromLocationId === input.toLocationId) {
    throw new InventoryError('Pick two different locations.')
  }
  if (!(input.quantity > 0)) throw new InventoryError('Enter how many to move.')

  const locations = await session.db.inventoryLocation.findMany({
    where: { id: { in: [input.fromLocationId, input.toLocationId] } },
    select: { id: true },
  })
  if (locations.length !== 2) throw new InventoryError('One of those locations does not exist.')

  const item = await session.db.priceBookItem.findUnique({
    where: { id: input.priceBookItemId },
    select: { costCents: true },
  })
  if (!item) throw new InventoryError('That item is not in your price book.')

  await postLedgerMoves({
    organizationId: session.organizationId,
    actorId: session.userId,
    moves: [
      {
        priceBookItemId: input.priceBookItemId,
        kind: 'TRANSFER',
        quantity: input.quantity,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        unitCostCents: item.costCents,
        reason: input.note?.trim() || 'Transfer',
      },
    ],
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'inventory.transferred',
    entityType: 'PriceBookItem',
    entityId: input.priceBookItemId,
    after: {
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      quantity: input.quantity,
    },
  })
}

export async function loadItemInventory(
  session: AppSession,
  priceBookItemId: string,
) {
  const item = await session.db.priceBookItem.findUnique({
    where: { id: priceBookItemId },
    include: {
      springSpec: true,
      stockLevels: {
        include: { location: { select: { id: true, name: true, kind: true, isActive: true } } },
      },
    },
  })
  if (!item) return null

  const transactions = await session.db.inventoryTransaction.findMany({
    where: { priceBookItemId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      fromLocation: { select: { name: true } },
      toLocation: { select: { name: true } },
      actor: { select: { firstName: true, lastName: true } },
      job: { select: { id: true, number: true } },
    },
  })

  return { item, transactions }
}

/** Usage over a window, so restocking advice has something behind it. */
export async function usageSince(
  session: AppSession,
  input: { priceBookItemId: string; locationId?: string; since: Date },
) {
  const result = await session.db.inventoryTransaction.aggregate({
    where: {
      priceBookItemId: input.priceBookItemId,
      kind: 'CONSUMPTION',
      createdAt: { gte: input.since },
      ...(input.locationId ? { fromLocationId: input.locationId } : {}),
    },
    _sum: { quantity: true },
  })
  return Number((result._sum.quantity ?? new Prisma.Decimal(0)).toString())
}
