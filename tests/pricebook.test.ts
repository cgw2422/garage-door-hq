import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { roleCan } from '@/lib/rbac'
import type { AppSession } from '@/lib/session'
import {
  archiveItem,
  createItem,
  createPackage,
  duplicateItem,
  packageTotalCents,
  listItems,
  updateItem,
  updatePackage,
  PriceBookError,
} from '@/server/pricebook/service'
import { addRemedyToEstimate, ensureDraftEstimate } from '@/server/estimates/builder'
import { createTestCompany, createTestDoor, createTestJob } from './helpers'

let session: AppSession

beforeAll(async () => {
  const company = await createTestCompany({ taxRateBps: 700 })
  session = company.session
})

describe('price book permissions', () => {
  it('lets everyone read the catalog but only owners and admins change it', () => {
    for (const role of ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN'] as const) {
      expect(roleCan(role, 'pricebook:read')).toBe(true)
    }
    expect(roleCan('OWNER', 'pricebook:write')).toBe(true)
    expect(roleCan('ADMIN', 'pricebook:write')).toBe(true)
    expect(roleCan('OFFICE', 'pricebook:write')).toBe(false)
    expect(roleCan('TECHNICIAN', 'pricebook:write')).toBe(false)
  })
})

describe('items', () => {
  it('creates an item with money stored as integer cents', async () => {
    const item = await createItem(session, {
      name: 'Custom Bracket',
      category: 'HARDWARE',
      sku: 'brk-99',
      costCents: 1234,
      priceCents: 4999,
      taxable: true,
      trackInventory: true,
    })

    expect(item.costCents).toBe(1234)
    expect(item.priceCents).toBe(4999)
    // SKUs are normalized so matching and uniqueness are predictable.
    expect(item.sku).toBe('BRK-99')
  })

  it('refuses a SKU that is already in use', async () => {
    await expect(
      createItem(session, {
        name: 'Another Bracket',
        category: 'HARDWARE',
        sku: 'BRK-99',
        costCents: 0,
        priceCents: 100,
        taxable: true,
        trackInventory: false,
      }),
    ).rejects.toBeInstanceOf(PriceBookError)
  })

  it('duplicates an item with a free SKU and keeps a spring specification', async () => {
    const spring = await prisma.priceBookItem.findFirstOrThrow({
      where: { organizationId: session.organizationId, sku: 'TS-2250-200-270-L' },
    })

    const copy = await duplicateItem(session, spring.id)
    expect(copy.id).not.toBe(spring.id)
    expect(copy.sku).not.toBe(spring.sku)
    expect(copy.name).toContain('copy')

    // Without the spec the duplicate would silently stop matching measurements.
    const spec = await prisma.springSpec.findUnique({ where: { priceBookItemId: copy.id } })
    expect(spec).not.toBeNull()
    expect(Number(spec!.wireSizeInches.toString())).toBeCloseTo(0.225)
  })

  it('hides an archived item from the default list but keeps the row', async () => {
    const item = await createItem(session, {
      name: 'Discontinued Part',
      category: 'MISCELLANEOUS',
      costCents: 0,
      priceCents: 500,
      taxable: true,
      trackInventory: false,
    })

    await archiveItem(session, item.id)

    const visible = await listItems(session, { search: 'Discontinued' })
    expect(visible).toHaveLength(0)

    const withArchived = await listItems(session, {
      search: 'Discontinued',
      includeArchived: true,
    })
    expect(withArchived).toHaveLength(1)
    expect(withArchived[0]!.archivedAt).not.toBeNull()

    expect(await prisma.priceBookItem.findUnique({ where: { id: item.id } })).not.toBeNull()
  })

  it('searches by name, SKU and supplier', async () => {
    await createItem(session, {
      name: 'Findable Widget',
      category: 'HARDWARE',
      sku: 'FIND-1',
      supplier: 'Acme Supply',
      costCents: 100,
      priceCents: 200,
      taxable: true,
      trackInventory: false,
    })

    expect((await listItems(session, { search: 'findable' })).length).toBe(1)
    expect((await listItems(session, { search: 'FIND-1' })).length).toBe(1)
    expect((await listItems(session, { search: 'acme' })).length).toBe(1)
    expect((await listItems(session, { category: 'HARDWARE' })).length).toBeGreaterThan(0)
  })
})

describe('editing prices never rewrites a document', () => {
  it('leaves an existing estimate line at the price it was added with', async () => {
    const { customer, property, door } = await createTestDoor(session)
    const job = await createTestJob(session, {
      customerId: customer.id,
      propertyId: property.id,
      doorId: door.id,
    })

    const remedy = await prisma.inspectionRemedy.findFirstOrThrow({
      where: { organizationId: session.organizationId, componentKey: 'rollers' },
    })
    const result = await addRemedyToEstimate(session, { jobId: job.id, remedyId: remedy.id })

    const before = await prisma.estimateItem.findFirstOrThrow({
      where: { optionId: result.optionId, sku: 'RLR-NYL-13' },
    })
    const roller = await prisma.priceBookItem.findFirstOrThrow({
      where: { organizationId: session.organizationId, sku: 'RLR-NYL-13' },
    })

    await updateItem(session, roller.id, {
      name: roller.name,
      category: roller.category,
      sku: roller.sku,
      costCents: roller.costCents,
      // Double the price after the estimate was built.
      priceCents: roller.priceCents * 2,
      taxable: roller.taxable,
      trackInventory: roller.trackInventory,
    })

    const after = await prisma.estimateItem.findUniqueOrThrow({ where: { id: before.id } })
    expect(after.unitPriceCents).toBe(before.unitPriceCents)

    const option = await prisma.estimateOption.findUniqueOrThrow({
      where: { id: result.optionId },
    })
    expect(option.totalCents).toBeGreaterThan(0)

    // A new estimate picks up the new price, which is the point of changing it.
    const secondJob = await createTestJob(session, {
      customerId: customer.id,
      propertyId: property.id,
    })
    const second = await addRemedyToEstimate(session, {
      jobId: secondJob.id,
      remedyId: remedy.id,
    })
    const newLine = await prisma.estimateItem.findFirstOrThrow({
      where: { optionId: second.optionId, sku: 'RLR-NYL-13' },
    })
    expect(newLine.unitPriceCents).toBe(roller.priceCents * 2)

    await ensureDraftEstimate(session, job.id)
  })
})

describe('packages', () => {
  it('totals the sum of its components when it has no price of its own', async () => {
    const items = await prisma.priceBookItem.findMany({
      where: { organizationId: session.organizationId, sku: { in: ['RLR-NYL-13', 'LBR-ROLLER'] } },
    })
    const roller = items.find((item) => item.sku === 'RLR-NYL-13')!
    const labor = items.find((item) => item.sku === 'LBR-ROLLER')!

    const created = await createPackage(session, {
      name: 'Test Roller Package',
      isRecommendedDefault: false,
      defaultTier: 'STANDARD',
      priceCents: null,
      lines: [
        { priceBookItemId: roller.id, quantity: 10 },
        { priceBookItemId: labor.id, quantity: 1 },
      ],
    })

    const loaded = await prisma.priceBookPackage.findUniqueOrThrow({
      where: { id: created.id },
      include: { items: { include: { priceBookItem: true } } },
    })

    expect(packageTotalCents(loaded)).toBe(roller.priceCents * 10 + labor.priceCents)
  })

  it('uses its own price when one is set', async () => {
    const roller = await prisma.priceBookItem.findFirstOrThrow({
      where: { organizationId: session.organizationId, sku: 'RLR-NYL-13' },
    })

    const created = await createPackage(session, {
      name: 'Fixed Price Package',
      isRecommendedDefault: false,
      priceCents: 19900,
      lines: [{ priceBookItemId: roller.id, quantity: 10 }],
    })

    const loaded = await prisma.priceBookPackage.findUniqueOrThrow({
      where: { id: created.id },
      include: { items: { include: { priceBookItem: true } } },
    })
    expect(packageTotalCents(loaded)).toBe(19900)
  })

  it('stores the order the components were arranged in', async () => {
    const items = await prisma.priceBookItem.findMany({
      where: {
        organizationId: session.organizationId,
        sku: { in: ['LBR-ROLLER', 'RLR-NYL-13', 'LUB-KIT'] },
      },
    })
    const bySku = new Map(items.map((item) => [item.sku!, item.id]))

    const created = await createPackage(session, {
      name: 'Ordered Package',
      isRecommendedDefault: false,
      lines: [
        { priceBookItemId: bySku.get('LBR-ROLLER')!, quantity: 1 },
        { priceBookItemId: bySku.get('LUB-KIT')!, quantity: 1 },
        { priceBookItemId: bySku.get('RLR-NYL-13')!, quantity: 4 },
      ],
    })

    const first = await prisma.priceBookPackageItem.findMany({
      where: { packageId: created.id },
      orderBy: { sortOrder: 'asc' },
      include: { priceBookItem: { select: { sku: true } } },
    })
    expect(first.map((line) => line.priceBookItem.sku)).toEqual([
      'LBR-ROLLER',
      'LUB-KIT',
      'RLR-NYL-13',
    ])

    // Reordering is saved, because that is the order the customer reads.
    await updatePackage(session, created.id, {
      name: 'Ordered Package',
      isRecommendedDefault: false,
      lines: [
        { priceBookItemId: bySku.get('RLR-NYL-13')!, quantity: 4 },
        { priceBookItemId: bySku.get('LBR-ROLLER')!, quantity: 1 },
        { priceBookItemId: bySku.get('LUB-KIT')!, quantity: 1 },
      ],
    })

    const reordered = await prisma.priceBookPackageItem.findMany({
      where: { packageId: created.id },
      orderBy: { sortOrder: 'asc' },
      include: { priceBookItem: { select: { sku: true } } },
    })
    expect(reordered.map((line) => line.priceBookItem.sku)).toEqual([
      'RLR-NYL-13',
      'LBR-ROLLER',
      'LUB-KIT',
    ])
  })

  it('refuses a package built from another organization items', async () => {
    const other = await createTestCompany()
    const foreign = await prisma.priceBookItem.findFirstOrThrow({
      where: { organizationId: other.session.organizationId },
    })

    await expect(
      createPackage(session, {
        name: 'Cross Tenant Package',
        isRecommendedDefault: false,
        lines: [{ priceBookItemId: foreign.id, quantity: 1 }],
      }),
    ).rejects.toThrow(/not in your price book/i)
  })

  it('refuses an empty package', async () => {
    await expect(
      createPackage(session, { name: 'Empty', isRecommendedDefault: false, lines: [] }),
    ).rejects.toThrow(/at least one item/i)
  })
})
