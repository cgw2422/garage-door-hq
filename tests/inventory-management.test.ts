import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import {
  ADJUSTMENT_REASONS,
  InventoryError,
  addStockedItem,
  adjustStock,
  loadItemInventory,
  setMinimum,
  transferStock,
  usageSince,
} from '@/server/inventory/management'
import { recomputeStockLevel } from '@/server/inventory/ledger'
import { createTestCompany, stockOf, uniqueNumber } from './helpers'

/**
 * Inventory management, as an owner actually uses it: put an item on the
 * shelf, move it between a warehouse and a truck, and correct a count.
 *
 * The property under test throughout is that no quantity ever changes without
 * a transaction behind it — the materialized StockLevel must always be
 * reproducible from the ledger alone.
 */

async function trackedItem(session: AppSession, overrides?: { trackInventory?: boolean }) {
  return prisma.priceBookItem.create({
    data: {
      organizationId: session.organizationId,
      category: 'HARDWARE',
      name: `Nylon Roller ${uniqueNumber()}`,
      costCents: 240,
      priceCents: 900,
      trackInventory: overrides?.trackInventory ?? true,
    },
  })
}

async function warehouseFor(session: AppSession) {
  return prisma.inventoryLocation.create({
    data: { organizationId: session.organizationId, name: 'Shop', kind: 'WAREHOUSE' },
  })
}

/** Rebuild the on-hand figure from transactions and compare it to the row. */
async function ledgerAgreesWithStock(
  organizationId: string,
  locationId: string,
  priceBookItemId: string,
) {
  const before = await stockOf(locationId, priceBookItemId)
  await recomputeStockLevel({ organizationId, locationId, priceBookItemId })
  const after = await stockOf(locationId, priceBookItemId)
  return { before, after }
}

describe('adjustment reasons', () => {
  it('carries its own direction so a typed sign can never flip it', () => {
    for (const reason of ADJUSTMENT_REASONS) {
      expect(reason.direction === 'in' || reason.direction === 'out').toBe(true)
    }
    expect(ADJUSTMENT_REASONS.find((r) => r.value === 'DAMAGED')!.direction).toBe('out')
    expect(ADJUSTMENT_REASONS.find((r) => r.value === 'RECEIVED')!.direction).toBe('in')
  })

  it('refuses an unknown reason rather than guessing a direction', async () => {
    const { session } = await createTestCompany()
    const item = await trackedItem(session)
    const location = await warehouseFor(session)
    await addStockedItem(session, {
      priceBookItemId: item.id,
      locationId: location.id,
      minQuantity: 0,
    })

    await expect(
      adjustStock(session, {
        locationId: location.id,
        priceBookItemId: item.id,
        quantity: 1,
        reason: 'MADE_UP' as never,
      }),
    ).rejects.toThrow(InventoryError)
  })
})

describe('stocking an item', () => {
  it('posts the opening count as a receipt instead of writing the quantity', async () => {
    const { session } = await createTestCompany()
    const item = await trackedItem(session)
    const location = await warehouseFor(session)

    await addStockedItem(session, {
      priceBookItemId: item.id,
      locationId: location.id,
      minQuantity: 4,
      openingQuantity: 12,
      binLocation: 'A-3',
    })

    expect(await stockOf(location.id, item.id)).toBe(12)

    const transactions = await prisma.inventoryTransaction.findMany({
      where: { organizationId: session.organizationId, priceBookItemId: item.id },
    })
    expect(transactions).toHaveLength(1)
    expect(transactions[0]!.kind).toBe('RECEIPT')
    expect(Number(transactions[0]!.quantity.toString())).toBe(12)

    const rebuilt = await ledgerAgreesWithStock(
      session.organizationId,
      location.id,
      item.id,
    )
    expect(rebuilt.after).toBe(rebuilt.before)
  })

  it('refuses an item that is not set to track inventory', async () => {
    const { session } = await createTestCompany()
    const item = await trackedItem(session, { trackInventory: false })
    const location = await warehouseFor(session)

    await expect(
      addStockedItem(session, {
        priceBookItemId: item.id,
        locationId: location.id,
        minQuantity: 0,
      }),
    ).rejects.toThrow(/track inventory/i)
  })

  it('refuses to stock the same item twice at one location', async () => {
    const { session } = await createTestCompany()
    const item = await trackedItem(session)
    const location = await warehouseFor(session)

    await addStockedItem(session, {
      priceBookItemId: item.id,
      locationId: location.id,
      minQuantity: 0,
    })
    await expect(
      addStockedItem(session, {
        priceBookItemId: item.id,
        locationId: location.id,
        minQuantity: 0,
      }),
    ).rejects.toThrow(/already stocked/i)
  })

  it('cannot stock another company’s item', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()
    const theirItem = await trackedItem(b)
    const myLocation = await warehouseFor(a)

    await expect(
      addStockedItem(a, {
        priceBookItemId: theirItem.id,
        locationId: myLocation.id,
        minQuantity: 0,
      }),
    ).rejects.toThrow(/not in your price book/i)
  })
})

describe('the minimum', () => {
  it('is set directly, because it is a policy and not a count', async () => {
    const { session } = await createTestCompany()
    const item = await trackedItem(session)
    const location = await warehouseFor(session)
    await addStockedItem(session, {
      priceBookItemId: item.id,
      locationId: location.id,
      minQuantity: 2,
      openingQuantity: 5,
    })

    const updated = await setMinimum(session, {
      locationId: location.id,
      priceBookItemId: item.id,
      minQuantity: 9,
      binLocation: ' B-1 ',
    })

    expect(Number(updated.minQuantity.toString())).toBe(9)
    expect(updated.binLocation).toBe('B-1')
    // Changing the policy did not change the count.
    expect(await stockOf(location.id, item.id)).toBe(5)
  })
})

describe('adjustments', () => {
  it('subtracts for a damage reason even though the quantity is positive', async () => {
    const { session } = await createTestCompany()
    const item = await trackedItem(session)
    const location = await warehouseFor(session)
    await addStockedItem(session, {
      priceBookItemId: item.id,
      locationId: location.id,
      minQuantity: 0,
      openingQuantity: 10,
    })

    await adjustStock(session, {
      locationId: location.id,
      priceBookItemId: item.id,
      quantity: 3,
      reason: 'DAMAGED',
      note: 'Crushed in the bed of the truck',
    })

    expect(await stockOf(location.id, item.id)).toBe(7)

    const latest = await prisma.inventoryTransaction.findFirstOrThrow({
      where: { organizationId: session.organizationId, priceBookItemId: item.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(latest.kind).toBe('ADJUSTMENT')
    expect(latest.fromLocationId).toBe(location.id)
    expect(latest.toLocationId).toBeNull()
    expect(latest.reason).toContain('Crushed in the bed of the truck')
  })

  it('adds for a receipt reason', async () => {
    const { session } = await createTestCompany()
    const item = await trackedItem(session)
    const location = await warehouseFor(session)
    await addStockedItem(session, {
      priceBookItemId: item.id,
      locationId: location.id,
      minQuantity: 0,
      openingQuantity: 2,
    })

    await adjustStock(session, {
      locationId: location.id,
      priceBookItemId: item.id,
      quantity: 24,
      reason: 'RECEIVED',
    })

    expect(await stockOf(location.id, item.id)).toBe(26)
  })

  it('refuses a zero or negative quantity', async () => {
    const { session } = await createTestCompany()
    const item = await trackedItem(session)
    const location = await warehouseFor(session)
    await addStockedItem(session, {
      priceBookItemId: item.id,
      locationId: location.id,
      minQuantity: 0,
      openingQuantity: 5,
    })

    for (const quantity of [0, -4]) {
      await expect(
        adjustStock(session, {
          locationId: location.id,
          priceBookItemId: item.id,
          quantity,
          reason: 'RECEIVED',
        }),
      ).rejects.toThrow(InventoryError)
    }
    expect(await stockOf(location.id, item.id)).toBe(5)
  })

  it('will not let a correction take stock below zero', async () => {
    const { session } = await createTestCompany()
    const item = await trackedItem(session)
    const location = await warehouseFor(session)
    await addStockedItem(session, {
      priceBookItemId: item.id,
      locationId: location.id,
      minQuantity: 0,
      openingQuantity: 2,
    })

    await expect(
      adjustStock(session, {
        locationId: location.id,
        priceBookItemId: item.id,
        quantity: 3,
        reason: 'CORRECTION_DOWN',
      }),
    ).rejects.toThrow(/not enough stock/i)

    expect(await stockOf(location.id, item.id)).toBe(2)
    const transactions = await prisma.inventoryTransaction.count({
      where: { organizationId: session.organizationId, priceBookItemId: item.id },
    })
    // Only the opening receipt; the refused adjustment left nothing behind.
    expect(transactions).toBe(1)
  })
})

describe('transfers', () => {
  it('moves stock between locations in a single transaction', async () => {
    const { session } = await createTestCompany()
    const item = await trackedItem(session)
    const shop = await warehouseFor(session)
    const truck = await prisma.inventoryLocation.create({
      data: { organizationId: session.organizationId, name: 'Truck 2', kind: 'TRUCK' },
    })

    await addStockedItem(session, {
      priceBookItemId: item.id,
      locationId: shop.id,
      minQuantity: 0,
      openingQuantity: 20,
    })
    await addStockedItem(session, {
      priceBookItemId: item.id,
      locationId: truck.id,
      minQuantity: 2,
    })

    await transferStock(session, {
      fromLocationId: shop.id,
      toLocationId: truck.id,
      priceBookItemId: item.id,
      quantity: 6,
    })

    expect(await stockOf(shop.id, item.id)).toBe(14)
    expect(await stockOf(truck.id, item.id)).toBe(6)

    const transfers = await prisma.inventoryTransaction.findMany({
      where: { organizationId: session.organizationId, kind: 'TRANSFER' },
    })
    // One row carrying both sides, so the two halves can never diverge.
    expect(transfers).toHaveLength(1)
    expect(transfers[0]!.fromLocationId).toBe(shop.id)
    expect(transfers[0]!.toLocationId).toBe(truck.id)
  })

  it('refuses a transfer larger than what is on hand, and moves nothing', async () => {
    const { session } = await createTestCompany()
    const item = await trackedItem(session)
    const shop = await warehouseFor(session)
    const truck = await prisma.inventoryLocation.create({
      data: { organizationId: session.organizationId, name: 'Truck 3', kind: 'TRUCK' },
    })
    await addStockedItem(session, {
      priceBookItemId: item.id,
      locationId: shop.id,
      minQuantity: 0,
      openingQuantity: 3,
    })

    await expect(
      transferStock(session, {
        fromLocationId: shop.id,
        toLocationId: truck.id,
        priceBookItemId: item.id,
        quantity: 5,
      }),
    ).rejects.toThrow(/not enough stock/i)

    expect(await stockOf(shop.id, item.id)).toBe(3)
    expect(await stockOf(truck.id, item.id)).toBe(0)
  })

  it('refuses a transfer to the same location', async () => {
    const { session } = await createTestCompany()
    const item = await trackedItem(session)
    const shop = await warehouseFor(session)
    await addStockedItem(session, {
      priceBookItemId: item.id,
      locationId: shop.id,
      minQuantity: 0,
      openingQuantity: 3,
    })

    await expect(
      transferStock(session, {
        fromLocationId: shop.id,
        toLocationId: shop.id,
        priceBookItemId: item.id,
        quantity: 1,
      }),
    ).rejects.toThrow(/different locations/i)
  })

  it('cannot transfer into another company’s location', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()
    const item = await trackedItem(a)
    const mine = await warehouseFor(a)
    const theirs = await warehouseFor(b)

    await addStockedItem(a, {
      priceBookItemId: item.id,
      locationId: mine.id,
      minQuantity: 0,
      openingQuantity: 8,
    })

    await expect(
      transferStock(a, {
        fromLocationId: mine.id,
        toLocationId: theirs.id,
        priceBookItemId: item.id,
        quantity: 2,
      }),
    ).rejects.toThrow(/does not exist/i)

    expect(await stockOf(mine.id, item.id)).toBe(8)
    expect(await stockOf(theirs.id, item.id)).toBe(0)
  })
})

describe('reading inventory back', () => {
  it('shows the item, its stock levels and its recent history', async () => {
    const { session } = await createTestCompany()
    const item = await trackedItem(session)
    const shop = await warehouseFor(session)
    await addStockedItem(session, {
      priceBookItemId: item.id,
      locationId: shop.id,
      minQuantity: 1,
      openingQuantity: 4,
    })
    await adjustStock(session, {
      locationId: shop.id,
      priceBookItemId: item.id,
      quantity: 1,
      reason: 'LOST',
    })

    const loaded = await loadItemInventory(session, item.id)
    expect(loaded).not.toBeNull()
    expect(loaded!.item.stockLevels).toHaveLength(1)
    expect(Number(loaded!.item.stockLevels[0]!.quantity.toString())).toBe(3)
    expect(loaded!.transactions).toHaveLength(2)
    // Newest first, so the panel reads like a statement.
    expect(loaded!.transactions[0]!.kind).toBe('ADJUSTMENT')
  })

  it('returns null for another company’s item rather than leaking it', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()
    const theirItem = await trackedItem(b)

    expect(await loadItemInventory(a, theirItem.id)).toBeNull()
  })

  it('counts only consumption when reporting usage', async () => {
    const { session } = await createTestCompany()
    const item = await trackedItem(session)
    const shop = await warehouseFor(session)
    await addStockedItem(session, {
      priceBookItemId: item.id,
      locationId: shop.id,
      minQuantity: 0,
      openingQuantity: 30,
    })
    await adjustStock(session, {
      locationId: shop.id,
      priceBookItemId: item.id,
      quantity: 5,
      reason: 'USED_OFF_JOB',
    })
    await adjustStock(session, {
      locationId: shop.id,
      priceBookItemId: item.id,
      quantity: 2,
      reason: 'DAMAGED',
    })

    const used = await usageSince(session, {
      priceBookItemId: item.id,
      since: new Date(Date.now() - 60_000),
    })
    // Damage is a loss, not usage; restocking advice should not treat it as demand.
    expect(used).toBe(5)
  })
})
