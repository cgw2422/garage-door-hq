import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { tenantDb } from '@/lib/tenancy'
import {
  SizingNotAvailableError,
  matchInventorySprings,
  sizeSprings,
  sizingAvailable,
} from '@/server/springs/calculator'

/**
 * The spring calculator's contract: matching is a real inventory lookup, and
 * sizing from a door weight refuses to answer until verified data exists.
 */

let orgId = ''
let truckId = ''
let warehouseId = ''

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: 'Spring Co', slug: `spring-${Date.now()}` },
  })
  orgId = org.id

  const warehouse = await prisma.inventoryLocation.create({
    data: { organizationId: orgId, name: 'Warehouse', kind: 'WAREHOUSE' },
  })
  const truck = await prisma.inventoryLocation.create({
    data: { organizationId: orgId, name: 'Truck #1', kind: 'TRUCK' },
  })
  warehouseId = warehouse.id
  truckId = truck.id

  const springs = [
    { sku: 'A-LH-10K', wire: 0.225, id: 2.0, len: 27, wind: 'LEFT_HAND', cycles: 10000, truck: 2, wh: 14 },
    { sku: 'A-LH-25K', wire: 0.225, id: 2.0, len: 27, wind: 'LEFT_HAND', cycles: 25000, truck: 0, wh: 9 },
    { sku: 'A-RH-10K', wire: 0.225, id: 2.0, len: 27, wind: 'RIGHT_HAND', cycles: 10000, truck: 2, wh: 14 },
    { sku: 'B-LH-10K', wire: 0.25, id: 2.0, len: 32, wind: 'LEFT_HAND', cycles: 10000, truck: 3, wh: 5 },
  ] as const

  for (const spring of springs) {
    const item = await prisma.priceBookItem.create({
      data: {
        organizationId: orgId,
        category: 'SPRINGS',
        name: spring.sku,
        sku: spring.sku,
        costCents: 2850,
        priceCents: 8900,
        trackInventory: true,
        springSpec: {
          create: {
            type: 'TORSION',
            wireSizeInches: spring.wire,
            insideDiameterInches: spring.id,
            lengthInches: spring.len,
            wind: spring.wind,
            cycleRating: spring.cycles,
          },
        },
      },
    })
    await prisma.stockLevel.createMany({
      data: [
        { organizationId: orgId, locationId: truckId, priceBookItemId: item.id, quantity: spring.truck },
        { organizationId: orgId, locationId: warehouseId, priceBookItemId: item.id, quantity: spring.wh },
      ],
    })
  }
})

afterAll(async () => {
  await prisma.stockLevel.deleteMany({ where: { organizationId: orgId } })
  await prisma.springSpec.deleteMany({ where: { priceBookItem: { organizationId: orgId } } })
  await prisma.priceBookItem.deleteMany({ where: { organizationId: orgId } })
  await prisma.inventoryLocation.deleteMany({ where: { organizationId: orgId } })
  await prisma.organization.delete({ where: { id: orgId } })
  await prisma.$disconnect()
})

describe('spring matching', () => {
  it('matches exactly on size and wind', async () => {
    const result = await matchInventorySprings(
      tenantDb(orgId),
      { wireSizeInches: 0.225, insideDiameterInches: 2, lengthInches: 27, wind: 'LEFT_HAND' },
      { myLocationId: truckId },
    )

    expect(result.noCatalogEntry).toBe(false)
    expect(result.matches.map((m) => m.sku).sort()).toEqual(['A-LH-10K', 'A-LH-25K'])
    // A right-hand spring is never offered as a substitute for a left-hand one.
    expect(result.matches.some((m) => m.sku === 'A-RH-10K')).toBe(false)
  })

  it('does not match a different wire size', async () => {
    const result = await matchInventorySprings(tenantDb(orgId), {
      wireSizeInches: 0.2437,
      insideDiameterInches: 2,
      lengthInches: 27,
    })
    expect(result.noCatalogEntry).toBe(true)
    expect(result.matches).toHaveLength(0)
  })

  it('puts what is on my truck first', async () => {
    const result = await matchInventorySprings(
      tenantDb(orgId),
      { wireSizeInches: 0.225, insideDiameterInches: 2, lengthInches: 27, wind: 'LEFT_HAND' },
      { myLocationId: truckId },
    )
    expect(result.matches[0]?.sku).toBe('A-LH-10K')
    expect(result.matches[0]?.onMyTruck).toBe(2)
    expect(result.matches[0]?.totalOnHand).toBe(16)
  })

  it('flags a higher cycle rating as an upgrade rather than hiding it', async () => {
    const result = await matchInventorySprings(tenantDb(orgId), {
      wireSizeInches: 0.225,
      insideDiameterInches: 2,
      lengthInches: 27,
      wind: 'LEFT_HAND',
      existingCycleRating: 10000,
    })
    const upgrade = result.matches.find((m) => m.sku === 'A-LH-25K')
    expect(upgrade?.matchQuality).toBe('cycle-upgrade')
  })

  it("never reaches another organization's catalog", async () => {
    const other = await prisma.organization.create({
      data: { name: 'Other Co', slug: `other-${Date.now()}` },
    })
    const result = await matchInventorySprings(tenantDb(other.id), {
      wireSizeInches: 0.225,
      insideDiameterInches: 2,
      lengthInches: 27,
      wind: 'LEFT_HAND',
    })
    expect(result.matches).toHaveLength(0)
    await prisma.organization.delete({ where: { id: other.id } })
  })
})

describe('spring sizing', () => {
  it('is not available until verified data is registered', () => {
    expect(sizingAvailable()).toBe(false)
  })

  it('refuses to guess a spring from a door weight', async () => {
    await expect(
      sizeSprings({ doorWeightLbs: 178, doorHeightInches: 84, drumModel: '400-8' }),
    ).rejects.toBeInstanceOf(SizingNotAvailableError)
  })
})
