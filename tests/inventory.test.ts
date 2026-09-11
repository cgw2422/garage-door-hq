import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { LedgerError, postLedgerMoves, recomputeStockLevel } from '@/server/inventory/ledger'

/**
 * The ledger is the source of truth for stock. These tests prove the two
 * properties the rest of the product relies on: quantities only ever move
 * through transactions, and the materialized StockLevel can always be rebuilt
 * from those transactions.
 */

let orgId = ''
let itemId = ''
let warehouseId = ''
let truckId = ''

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: 'Ledger Co', slug: `ledger-${Date.now()}` },
  })
  orgId = org.id

  const item = await prisma.priceBookItem.create({
    data: {
      organizationId: orgId,
      category: 'SPRINGS',
      name: 'Torsion Spring .225 x 2" x 27" LH',
      sku: `TS-TEST-${Date.now()}`,
      costCents: 2850,
      priceCents: 8900,
      trackInventory: true,
    },
  })
  itemId = item.id

  const warehouse = await prisma.inventoryLocation.create({
    data: { organizationId: orgId, name: 'Warehouse', kind: 'WAREHOUSE' },
  })
  const truck = await prisma.inventoryLocation.create({
    data: { organizationId: orgId, name: 'Truck #1', kind: 'TRUCK' },
  })
  warehouseId = warehouse.id
  truckId = truck.id
})

afterAll(async () => {
  await prisma.inventoryTransaction.deleteMany({ where: { organizationId: orgId } })
  await prisma.stockLevel.deleteMany({ where: { organizationId: orgId } })
  await prisma.priceBookItem.deleteMany({ where: { organizationId: orgId } })
  await prisma.inventoryLocation.deleteMany({ where: { organizationId: orgId } })
  await prisma.organization.delete({ where: { id: orgId } })
  await prisma.$disconnect()
})

async function quantityAt(locationId: string) {
  const level = await prisma.stockLevel.findUnique({
    where: { locationId_priceBookItemId: { locationId, priceBookItemId: itemId } },
  })
  return Number((level?.quantity ?? 0).toString())
}

describe('inventory ledger', () => {
  it('receives stock into a location', async () => {
    await postLedgerMoves({
      organizationId: orgId,
      actorId: null,
      moves: [{ priceBookItemId: itemId, kind: 'RECEIPT', quantity: 20, toLocationId: warehouseId }],
    })
    expect(await quantityAt(warehouseId)).toBe(20)
  })

  it('moves stock between locations without changing the total', async () => {
    await postLedgerMoves({
      organizationId: orgId,
      actorId: null,
      moves: [
        {
          priceBookItemId: itemId,
          kind: 'TRANSFER',
          quantity: 6,
          fromLocationId: warehouseId,
          toLocationId: truckId,
        },
      ],
    })
    expect(await quantityAt(warehouseId)).toBe(14)
    expect(await quantityAt(truckId)).toBe(6)
  })

  it('deducts parts consumed on a job', async () => {
    await postLedgerMoves({
      organizationId: orgId,
      actorId: null,
      moves: [
        { priceBookItemId: itemId, kind: 'CONSUMPTION', quantity: 2, fromLocationId: truckId },
      ],
    })
    expect(await quantityAt(truckId)).toBe(4)
  })

  it('refuses to drive a location negative', async () => {
    await expect(
      postLedgerMoves({
        organizationId: orgId,
        actorId: null,
        moves: [
          { priceBookItemId: itemId, kind: 'CONSUMPTION', quantity: 99, fromLocationId: truckId },
        ],
      }),
    ).rejects.toBeInstanceOf(LedgerError)
    expect(await quantityAt(truckId)).toBe(4)
  })

  it('rejects a negative quantity instead of inferring direction from the sign', async () => {
    await expect(
      postLedgerMoves({
        organizationId: orgId,
        actorId: null,
        moves: [
          { priceBookItemId: itemId, kind: 'ADJUSTMENT', quantity: -3, toLocationId: truckId },
        ],
      }),
    ).rejects.toBeInstanceOf(LedgerError)
  })

  it('rolls the whole batch back when one move fails', async () => {
    const before = await quantityAt(warehouseId)
    await expect(
      postLedgerMoves({
        organizationId: orgId,
        actorId: null,
        moves: [
          { priceBookItemId: itemId, kind: 'RECEIPT', quantity: 5, toLocationId: warehouseId },
          { priceBookItemId: itemId, kind: 'CONSUMPTION', quantity: 500, fromLocationId: truckId },
        ],
      }),
    ).rejects.toBeInstanceOf(LedgerError)
    expect(await quantityAt(warehouseId)).toBe(before)
  })

  it('rebuilds the materialized level from the ledger alone', async () => {
    // Corrupt the cached quantity, then prove the ledger can restore it.
    await prisma.stockLevel.update({
      where: { locationId_priceBookItemId: { locationId: truckId, priceBookItemId: itemId } },
      data: { quantity: 999 },
    })
    const rebuilt = await recomputeStockLevel({
      organizationId: orgId,
      locationId: truckId,
      priceBookItemId: itemId,
    })
    expect(Number(rebuilt.toString())).toBe(4)
    expect(await quantityAt(truckId)).toBe(4)
  })
})
