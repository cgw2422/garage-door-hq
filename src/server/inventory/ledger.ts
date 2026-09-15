import { Prisma, type InventoryTxnKind } from '@prisma/client'
import { prisma } from '@/lib/db'

/**
 * Inventory ledger.
 *
 * Quantities are never assigned - only moved. Every change writes an
 * append-only `InventoryTransaction` row and applies the same delta to the
 * materialized `StockLevel`, inside one database transaction. A miscount is
 * corrected by posting a compensating transaction, never by editing history.
 *
 * `StockLevel` exists purely so a truck screen is one indexed read instead of
 * a sum over the whole ledger; the ledger remains the source of truth and can
 * always rebuild it.
 */

export interface LedgerMove {
  priceBookItemId: string
  kind: InventoryTxnKind
  /** Always positive. Direction is carried by fromLocationId/toLocationId. */
  quantity: number
  fromLocationId?: string | null
  toLocationId?: string | null
  unitCostCents?: number
  jobId?: string | null
  reason?: string | null
  reference?: string | null
}

export class LedgerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LedgerError'
  }
}

function assertValid(move: LedgerMove) {
  if (!(move.quantity > 0)) {
    throw new LedgerError('Ledger quantities must be positive; use from/to to express direction.')
  }
  if (!move.fromLocationId && !move.toLocationId) {
    throw new LedgerError('A ledger move needs a source location, a destination location, or both.')
  }
  if (move.fromLocationId && move.fromLocationId === move.toLocationId) {
    throw new LedgerError('Source and destination locations must differ.')
  }
}

/**
 * Every location named in a move must belong to the posting organization.
 *
 * This runs here rather than in each caller because this is the only door into
 * the ledger, and a location id is exactly the sort of value that arrives from
 * a form. Without it, a company could post stock into — or take stock out of —
 * another company's truck simply by naming its id, and the row created would
 * carry their own organizationId while pointing at somebody else's shelf.
 *
 * It is cheap: one indexed query per post, and a post is never a hot path.
 */
async function assertLocationsOwned(
  tx: Prisma.TransactionClient,
  organizationId: string,
  moves: LedgerMove[],
) {
  const ids = [
    ...new Set(
      moves.flatMap((move) => [move.fromLocationId, move.toLocationId].filter(Boolean) as string[]),
    ),
  ]
  if (ids.length === 0) return

  const owned = await tx.inventoryLocation.findMany({
    where: { id: { in: ids }, organizationId },
    select: { id: true },
  })
  if (owned.length !== ids.length) {
    throw new LedgerError('That inventory location does not exist.')
  }
}

async function applyDelta(
  tx: Prisma.TransactionClient,
  organizationId: string,
  locationId: string,
  priceBookItemId: string,
  delta: Prisma.Decimal,
) {
  await tx.stockLevel.upsert({
    where: { locationId_priceBookItemId: { locationId, priceBookItemId } },
    create: {
      organizationId,
      locationId,
      priceBookItemId,
      quantity: delta,
    },
    update: { quantity: { increment: delta } },
  })
}

export interface PostMovesParams {
  organizationId: string
  actorId: string | null
  moves: LedgerMove[]
  /** Reject a move that would drive a location negative. */
  allowNegative?: boolean
}

/**
 * Post one or more moves atomically. Used by receiving, transfers, manual
 * adjustments and - most often - recording the parts used on a job.
 */
export async function postLedgerMoves(params: PostMovesParams) {
  return prisma.$transaction((tx) => postLedgerMovesTx(tx, params))
}

/**
 * The same posting logic inside a caller's transaction.
 *
 * Job completion needs the ledger, the Door Passport and the invoice to commit
 * or fail together, so it owns the transaction and calls this.
 */
export async function postLedgerMovesTx(
  tx: Prisma.TransactionClient,
  params: PostMovesParams,
) {
  const { organizationId, actorId, moves } = params
  moves.forEach(assertValid)
  await assertLocationsOwned(tx, organizationId, moves)

  {
    const created = []

    for (const move of moves) {
      const qty = new Prisma.Decimal(move.quantity)

      if (move.fromLocationId) {
        if (!params.allowNegative) {
          const level = await tx.stockLevel.findUnique({
            where: {
              locationId_priceBookItemId: {
                locationId: move.fromLocationId,
                priceBookItemId: move.priceBookItemId,
              },
            },
          })
          const onHand = level?.quantity ?? new Prisma.Decimal(0)
          if (onHand.lessThan(qty)) {
            throw new LedgerError(
              `Not enough stock at the source location: ${onHand.toString()} on hand, ${qty.toString()} requested.`,
            )
          }
        }
        await applyDelta(tx, organizationId, move.fromLocationId, move.priceBookItemId, qty.negated())
      }

      if (move.toLocationId) {
        await applyDelta(tx, organizationId, move.toLocationId, move.priceBookItemId, qty)
      }

      created.push(
        await tx.inventoryTransaction.create({
          data: {
            organizationId,
            priceBookItemId: move.priceBookItemId,
            kind: move.kind,
            fromLocationId: move.fromLocationId ?? null,
            toLocationId: move.toLocationId ?? null,
            quantity: qty,
            unitCostCents: move.unitCostCents ?? 0,
            jobId: move.jobId ?? null,
            actorId,
            reason: move.reason ?? null,
            reference: move.reference ?? null,
          },
        }),
      )
    }

    return created
  }
}

/**
 * Rebuild a materialized stock level from the ledger. Used by the periodic
 * consistency check and after any manual database intervention.
 */
export async function recomputeStockLevel(params: {
  organizationId: string
  locationId: string
  priceBookItemId: string
}) {
  const { organizationId, locationId, priceBookItemId } = params

  const [incoming, outgoing] = await Promise.all([
    prisma.inventoryTransaction.aggregate({
      where: { organizationId, priceBookItemId, toLocationId: locationId },
      _sum: { quantity: true },
    }),
    prisma.inventoryTransaction.aggregate({
      where: { organizationId, priceBookItemId, fromLocationId: locationId },
      _sum: { quantity: true },
    }),
  ])

  const quantity = (incoming._sum.quantity ?? new Prisma.Decimal(0)).minus(
    outgoing._sum.quantity ?? new Prisma.Decimal(0),
  )

  await prisma.stockLevel.upsert({
    where: { locationId_priceBookItemId: { locationId, priceBookItemId } },
    create: { organizationId, locationId, priceBookItemId, quantity },
    update: { quantity },
  })

  return quantity
}

export interface LowStockRow {
  priceBookItemId: string
  name: string
  sku: string | null
  quantity: number
  minQuantity: number
}

export async function lowStockForLocation(
  organizationId: string,
  locationId: string,
): Promise<LowStockRow[]> {
  const rows = await prisma.stockLevel.findMany({
    where: { organizationId, locationId, minQuantity: { gt: 0 } },
    include: { priceBookItem: true },
  })

  return rows
    .filter((row) => row.quantity.lessThanOrEqualTo(row.minQuantity))
    .map((row) => ({
      priceBookItemId: row.priceBookItemId,
      name: row.priceBookItem.name,
      sku: row.priceBookItem.sku,
      quantity: Number(row.quantity.toString()),
      minQuantity: Number(row.minQuantity.toString()),
    }))
    .sort((a, b) => a.quantity - b.quantity)
}
