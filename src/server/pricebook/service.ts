import { Prisma, type PriceBookCategory } from '@prisma/client'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import type { AppSession } from '@/lib/session'

/**
 * Price book management.
 *
 * Two rules carry over from Phase 1a and are the reason this file is careful:
 *
 * 1. Editing a catalog item never changes a document. Estimate and invoice
 *    lines snapshot their name and price when they are added, so a price change
 *    today cannot alter what a customer agreed to yesterday.
 * 2. "Archive" is not "delete". Catalog rows are referenced by historical
 *    documents, inventory transactions and packages; they are deactivated and
 *    hidden, never removed.
 */

export class PriceBookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PriceBookError'
  }
}

export { CATEGORY_LABELS, CATEGORY_ORDER } from '@/lib/price-book-categories'

export interface ItemInput {
  name: string
  category: PriceBookCategory
  description?: string | null
  sku?: string | null
  costCents: number
  priceCents: number
  taxable: boolean
  trackInventory: boolean
  unit?: string
  supplier?: string | null
  supplierPartNo?: string | null
}

export interface ListItemsQuery {
  search?: string
  category?: PriceBookCategory | null
  /** Archived items are hidden unless asked for. */
  includeArchived?: boolean
}

export async function listItems(session: AppSession, query: ListItemsQuery = {}) {
  const search = query.search?.trim()

  return session.db.priceBookItem.findMany({
    where: {
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.category ? { category: query.category } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { supplier: { contains: search, mode: 'insensitive' } },
              { supplierPartNo: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    take: 300,
    include: {
      springSpec: true,
      photos: {
        where: { uploadStatus: 'READY' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true },
      },
      _count: { select: { stockLevels: true } },
    },
  })
}

async function assertSkuFree(session: AppSession, sku: string | null, exceptId?: string) {
  if (!sku) return
  const existing = await session.db.priceBookItem.findFirst({
    where: { sku, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, name: true },
  })
  if (existing) {
    throw new PriceBookError(`SKU ${sku} is already used by "${existing.name}".`)
  }
}

function normalize(input: ItemInput) {
  return {
    name: input.name.trim(),
    category: input.category,
    description: input.description?.trim() || null,
    sku: input.sku?.trim().toUpperCase() || null,
    costCents: Math.max(0, Math.round(input.costCents)),
    priceCents: Math.max(0, Math.round(input.priceCents)),
    taxable: input.taxable,
    trackInventory: input.trackInventory,
    unit: input.unit?.trim() || 'ea',
    supplier: input.supplier?.trim() || null,
    supplierPartNo: input.supplierPartNo?.trim() || null,
  }
}

export async function createItem(session: AppSession, input: ItemInput) {
  const data = normalize(input)
  if (!data.name) throw new PriceBookError('Give the item a name.')
  await assertSkuFree(session, data.sku)

  const item = await session.db.priceBookItem.create({
    data: { organizationId: session.organizationId, ...data },
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'pricebook.item_created',
    entityType: 'PriceBookItem',
    entityId: item.id,
    after: { name: item.name, sku: item.sku, priceCents: item.priceCents },
  })

  return item
}

export async function updateItem(session: AppSession, itemId: string, input: ItemInput) {
  const existing = await session.db.priceBookItem.findUnique({ where: { id: itemId } })
  if (!existing) throw new PriceBookError('Item not found.')

  const data = normalize(input)
  if (!data.name) throw new PriceBookError('Give the item a name.')
  await assertSkuFree(session, data.sku, itemId)

  const item = await session.db.priceBookItem.update({ where: { id: itemId }, data })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'pricebook.item_updated',
    entityType: 'PriceBookItem',
    entityId: itemId,
    before: { priceCents: existing.priceCents, costCents: existing.costCents, name: existing.name },
    after: { priceCents: item.priceCents, costCents: item.costCents, name: item.name },
  })

  return item
}

/**
 * Hide an item from new work.
 *
 * Historical documents and inventory transactions keep pointing at it — a
 * delete would either fail on a foreign key or destroy an audit trail.
 */
export async function archiveItem(session: AppSession, itemId: string) {
  const item = await session.db.priceBookItem.update({
    where: { id: itemId },
    data: { isActive: false, archivedAt: new Date() },
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'pricebook.item_archived',
    entityType: 'PriceBookItem',
    entityId: itemId,
    after: { name: item.name },
  })

  return item
}

export async function restoreItem(session: AppSession, itemId: string) {
  return session.db.priceBookItem.update({
    where: { id: itemId },
    data: { isActive: true, archivedAt: null },
  })
}

/** Copy an item as a starting point, with a name and SKU that cannot collide. */
export async function duplicateItem(session: AppSession, itemId: string) {
  const source = await session.db.priceBookItem.findUnique({
    where: { id: itemId },
    include: { springSpec: true },
  })
  if (!source) throw new PriceBookError('Item not found.')

  const name = `${source.name} (copy)`
  const sku = source.sku ? await nextFreeSku(session, source.sku) : null

  const copy = await session.db.priceBookItem.create({
    data: {
      organizationId: session.organizationId,
      name,
      sku,
      category: source.category,
      description: source.description,
      costCents: source.costCents,
      priceCents: source.priceCents,
      taxable: source.taxable,
      trackInventory: source.trackInventory,
      unit: source.unit,
      supplier: source.supplier,
      supplierPartNo: source.supplierPartNo,
      // A spring copy keeps its typed specification, otherwise the duplicate
      // would silently stop matching in the Spring Calculator.
      ...(source.springSpec
        ? {
            springSpec: {
              create: {
                type: source.springSpec.type,
                wireSizeInches: source.springSpec.wireSizeInches,
                insideDiameterInches: source.springSpec.insideDiameterInches,
                lengthInches: source.springSpec.lengthInches,
                wind: source.springSpec.wind,
                cycleRating: source.springSpec.cycleRating,
                colorCode: source.springSpec.colorCode,
              },
            },
          }
        : {}),
    },
  })

  return copy
}

async function nextFreeSku(session: AppSession, base: string): Promise<string> {
  for (let attempt = 2; attempt < 100; attempt += 1) {
    const candidate = `${base}-${attempt}`
    const taken = await session.db.priceBookItem.findFirst({
      where: { sku: candidate },
      select: { id: true },
    })
    if (!taken) return candidate
  }
  return `${base}-${Date.now()}`
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

export interface PackageInput {
  name: string
  description?: string | null
  defaultTier?: 'GOOD' | 'BETTER' | 'BEST' | 'STANDARD' | null
  isRecommendedDefault: boolean
  /** Null means "price it as the sum of its components". */
  priceCents?: number | null
  lines: Array<{ priceBookItemId: string; quantity: number }>
}

export async function listPackages(session: AppSession) {
  return session.db.priceBookPackage.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
        include: {
          priceBookItem: {
            select: { id: true, name: true, sku: true, priceCents: true, isActive: true },
          },
        },
      },
    },
  })
}

export async function createPackage(session: AppSession, input: PackageInput) {
  if (!input.name.trim()) throw new PriceBookError('Give the package a name.')
  await assertLinesBelongToTenant(session, input.lines)

  const maxOrder = await session.db.priceBookPackage.aggregate({ _max: { sortOrder: true } })

  const created = await session.db.priceBookPackage.create({
    data: {
      organizationId: session.organizationId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      defaultTier: input.defaultTier ?? null,
      isRecommendedDefault: input.isRecommendedDefault,
      priceCents: input.priceCents ?? null,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      items: {
        create: input.lines.map((line, index) => ({
          priceBookItemId: line.priceBookItemId,
          quantity: new Prisma.Decimal(line.quantity),
          sortOrder: index,
        })),
      },
    },
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'pricebook.package_created',
    entityType: 'PriceBookPackage',
    entityId: created.id,
    after: { name: created.name, lines: input.lines.length },
  })

  return created
}

/**
 * Replace a package's contents in one transaction.
 *
 * The line order the owner sets here is the order a customer reads on the
 * estimate, so it is stored rather than inferred.
 */
export async function updatePackage(
  session: AppSession,
  packageId: string,
  input: PackageInput,
) {
  const existing = await session.db.priceBookPackage.findUnique({ where: { id: packageId } })
  if (!existing) throw new PriceBookError('Package not found.')
  if (!input.name.trim()) throw new PriceBookError('Give the package a name.')
  await assertLinesBelongToTenant(session, input.lines)

  return prisma.$transaction(async (tx) => {
    await tx.priceBookPackageItem.deleteMany({ where: { packageId } })

    return tx.priceBookPackage.update({
      where: { id: packageId },
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        defaultTier: input.defaultTier ?? null,
        isRecommendedDefault: input.isRecommendedDefault,
        priceCents: input.priceCents ?? null,
        items: {
          create: input.lines.map((line, index) => ({
            priceBookItemId: line.priceBookItemId,
            quantity: new Prisma.Decimal(line.quantity),
            sortOrder: index,
          })),
        },
      },
    })
  })
}

export async function archivePackage(session: AppSession, packageId: string) {
  return session.db.priceBookPackage.update({
    where: { id: packageId },
    data: { isActive: false },
  })
}

export async function restorePackage(session: AppSession, packageId: string) {
  return session.db.priceBookPackage.update({
    where: { id: packageId },
    data: { isActive: true },
  })
}

/** Every component must belong to this organization; ids come from a form. */
async function assertLinesBelongToTenant(
  session: AppSession,
  lines: Array<{ priceBookItemId: string; quantity: number }>,
) {
  if (lines.length === 0) throw new PriceBookError('A package needs at least one item.')
  if (lines.some((line) => !(line.quantity > 0))) {
    throw new PriceBookError('Package quantities must be greater than zero.')
  }

  const ids = [...new Set(lines.map((line) => line.priceBookItemId))]
  const found = await session.db.priceBookItem.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  })
  if (found.length !== ids.length) {
    throw new PriceBookError('One of those items is not in your price book.')
  }
}

/** What a package costs a customer: its own price, or the sum of its parts. */
export function packageTotalCents(pkg: {
  priceCents: number | null
  items: Array<{ quantity: Prisma.Decimal | number; priceBookItem: { priceCents: number } }>
}): number {
  if (pkg.priceCents !== null) return pkg.priceCents
  return pkg.items.reduce(
    (sum, line) =>
      sum + Math.round(Number(line.quantity.toString()) * line.priceBookItem.priceCents),
    0,
  )
}
