import { Prisma, type EstimateTier, type LineItemKind } from '@prisma/client'
import { prisma } from '@/lib/db'
import { nextIdentifier } from '@/lib/numbering'
import { recordAudit } from '@/lib/audit'
import type { AppSession } from '@/lib/session'
import { computeTotals } from './documents'

/**
 * Estimate construction.
 *
 * Good/Better/Best is a real structure here, not three text boxes: each tier is
 * an `EstimateOption` with its own itemized lines and its own stored totals. A
 * package is a reusable option — dropping one in copies its components as
 * individual priced lines, so the customer always sees what they are buying.
 *
 * Every line snapshots its name and unit price at the moment it is added. The
 * price book is never re-read to compute money on a saved document.
 */

export class EstimateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EstimateError'
  }
}

const TIER_NAMES: Record<EstimateTier, string> = {
  GOOD: 'Good',
  BETTER: 'Better',
  BEST: 'Best',
  STANDARD: 'Recommended Work',
}

const TIER_ORDER: Record<EstimateTier, number> = {
  GOOD: 0,
  BETTER: 1,
  BEST: 2,
  STANDARD: 3,
}

function kindForCategory(category: string): LineItemKind {
  if (category === 'LABOR') return 'LABOR'
  if (category === 'SERVICE_CALL') return 'SERVICE_CALL'
  return 'PART'
}

/** Find the job's open draft estimate, or start one. */
export async function ensureDraftEstimate(session: AppSession, jobId: string) {
  const job = await session.db.job.findUnique({
    where: { id: jobId },
    select: { id: true, customerId: true, jobType: { select: { name: true } } },
  })
  if (!job) throw new EstimateError('Job not found')

  const existing = await session.db.estimate.findFirst({
    where: { jobId, status: 'DRAFT', archivedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (existing) return existing

  const organization = await session.db.organization.findUniqueOrThrow({
    where: { id: session.organizationId },
    select: { estimateTermsText: true },
  })

  return prisma.$transaction(async (tx) => {
    const { number, displayNumber } = await nextIdentifier(
      tx,
      session.organizationId,
      'ESTIMATE',
    )
    return tx.estimate.create({
      data: {
        organizationId: session.organizationId,
        number,
        displayNumber,
        jobId,
        customerId: job.customerId,
        title: job.jobType?.name ?? 'Recommended Work',
        status: 'DRAFT',
        // Company defaults at creation time; the document owns them from here,
        // so editing settings later cannot rewrite this estimate.
        taxRateBps: session.defaultTaxRateBps,
        termsText: organization.estimateTermsText,
      },
    })
  })
}

async function ensureOptionTx(
  tx: Prisma.TransactionClient,
  params: {
    estimateId: string
    tier: EstimateTier
    name?: string
    description?: string | null
    isRecommended?: boolean
  },
) {
  const existing = await tx.estimateOption.findFirst({
    where: { estimateId: params.estimateId, tier: params.tier },
  })
  if (existing) return existing

  return tx.estimateOption.create({
    data: {
      estimateId: params.estimateId,
      tier: params.tier,
      name: params.name ?? TIER_NAMES[params.tier],
      description: params.description ?? null,
      isRecommended: params.isRecommended ?? false,
      sortOrder: TIER_ORDER[params.tier],
    },
  })
}

/** Recompute one option's stored totals from its own lines. */
export async function recalcOptionTx(
  tx: Prisma.TransactionClient,
  optionId: string,
  taxRateBps: number,
) {
  const items = await tx.estimateItem.findMany({ where: { optionId } })
  const totals = computeTotals(
    items.map((item) => ({
      quantity: Number(item.quantity.toString()),
      unitPriceCents: item.unitPriceCents,
      taxable: item.taxable,
    })),
    taxRateBps,
  )
  return tx.estimateOption.update({ where: { id: optionId }, data: totals })
}

export async function recalcEstimateTx(tx: Prisma.TransactionClient, estimateId: string) {
  const estimate = await tx.estimate.findUniqueOrThrow({
    where: { id: estimateId },
    include: { options: { select: { id: true } } },
  })
  for (const option of estimate.options) {
    await recalcOptionTx(tx, option.id, estimate.taxRateBps)
  }
}

async function appendLinesTx(
  tx: Prisma.TransactionClient,
  optionId: string,
  lines: Array<{ priceBookItemId: string; quantity: number }>,
) {
  const itemIds = lines.map((line) => line.priceBookItemId)
  const catalog = await tx.priceBookItem.findMany({ where: { id: { in: itemIds } } })
  const byId = new Map(catalog.map((item) => [item.id, item]))

  const existingCount = await tx.estimateItem.count({ where: { optionId } })
  const created = []

  for (const [index, line] of lines.entries()) {
    const item = byId.get(line.priceBookItemId)
    if (!item) continue

    // If the same catalog line is already on this option, bump the quantity
    // rather than listing it twice — a customer reading "Roller ×10, Roller ×10"
    // reasonably assumes they are being double-charged.
    const duplicate = await tx.estimateItem.findFirst({
      where: { optionId, priceBookItemId: item.id },
    })

    if (duplicate) {
      created.push(
        await tx.estimateItem.update({
          where: { id: duplicate.id },
          data: { quantity: { increment: new Prisma.Decimal(line.quantity) } },
        }),
      )
      continue
    }

    created.push(
      await tx.estimateItem.create({
        data: {
          optionId,
          priceBookItemId: item.id,
          kind: kindForCategory(item.category),
          name: item.name,
          description: item.description,
          sku: item.sku,
          quantity: new Prisma.Decimal(line.quantity),
          unitPriceCents: item.priceCents,
          unitCostCents: item.costCents,
          taxable: item.taxable,
          sortOrder: existingCount + index,
        },
      }),
    )
  }

  return created
}

export interface AddRemedyResult {
  estimateId: string
  optionId: string
  addedItemIds: string[]
}

/**
 * The inspection-to-estimate path.
 *
 * A technician marks Rollers as Worn and taps the roller upgrade. That single
 * action finds or creates the job's draft estimate, finds or creates the option
 * the remedy belongs in, copies the package's components in as itemized lines,
 * recalculates totals, and links the finding to what was quoted.
 */
export async function addRemedyToEstimate(
  session: AppSession,
  params: { jobId: string; inspectionItemId?: string | null; remedyId: string },
): Promise<AddRemedyResult> {
  const remedy = await session.db.inspectionRemedy.findUnique({
    where: { id: params.remedyId },
    include: {
      package: { include: { items: true } },
      priceBookItem: true,
    },
  })
  if (!remedy || !remedy.isActive) throw new EstimateError('That option is no longer available.')

  const estimate = await ensureDraftEstimate(session, params.jobId)

  const tier: EstimateTier = remedy.package?.defaultTier ?? 'STANDARD'
  const lines = remedy.package
    ? remedy.package.items.map((item) => ({
        priceBookItemId: item.priceBookItemId,
        quantity: Number(item.quantity.toString()),
      }))
    : remedy.priceBookItemId
      ? [{ priceBookItemId: remedy.priceBookItemId, quantity: Number(remedy.quantity.toString()) }]
      : []

  if (lines.length === 0) throw new EstimateError('That option has nothing priced in it yet.')

  const result = await prisma.$transaction(async (tx) => {
    const option = await ensureOptionTx(tx, {
      estimateId: estimate.id,
      tier,
      name: remedy.package?.name ?? TIER_NAMES[tier],
      description: remedy.package?.description ?? remedy.description,
      isRecommended: remedy.package?.isRecommendedDefault ?? false,
    })

    const created = await appendLinesTx(tx, option.id, lines)
    await recalcOptionTx(tx, option.id, estimate.taxRateBps)

    if (params.inspectionItemId && created[0]) {
      await tx.inspectionItem.update({
        where: { id: params.inspectionItemId },
        data: { estimateItemId: created[0].id },
      })
    }

    return { optionId: option.id, addedItemIds: created.map((item) => item.id) }
  })

  return { estimateId: estimate.id, ...result }
}

/**
 * Add every remedy for one finding at once, each landing in its own tier.
 *
 * This is what makes a broken spring a single tap: Good, Better and Best are
 * all on the estimate, priced and itemized, before the technician stands up.
 */
export async function addAllRemediesToEstimate(
  session: AppSession,
  params: { jobId: string; inspectionItemId?: string | null; componentKey: string },
) {
  const remedies = await session.db.inspectionRemedy.findMany({
    where: { componentKey: params.componentKey, isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: { package: { select: { defaultTier: true } } },
  })

  const tiered = remedies.filter((remedy) => {
    const tier = remedy.package?.defaultTier
    return tier === 'GOOD' || tier === 'BETTER' || tier === 'BEST'
  })
  if (tiered.length === 0) throw new EstimateError('This finding has no tiered options set up.')

  let estimateId = ''
  const addedItemIds: string[] = []
  for (const remedy of tiered) {
    const result = await addRemedyToEstimate(session, {
      jobId: params.jobId,
      // Link the finding to the first option only; it is one finding, and the
      // link exists to show "already quoted", not to track every line.
      inspectionItemId: addedItemIds.length === 0 ? params.inspectionItemId : null,
      remedyId: remedy.id,
    })
    estimateId = result.estimateId
    addedItemIds.push(...result.addedItemIds)
  }

  return { estimateId, addedItemIds }
}

export async function addPackageToEstimate(
  session: AppSession,
  params: { estimateId: string; packageId: string; tier?: EstimateTier },
) {
  const [estimate, pkg] = await Promise.all([
    session.db.estimate.findUnique({ where: { id: params.estimateId } }),
    session.db.priceBookPackage.findUnique({
      where: { id: params.packageId },
      include: { items: true },
    }),
  ])
  if (!estimate) throw new EstimateError('Estimate not found')
  if (!pkg) throw new EstimateError('Package not found')
  assertEditable(estimate.status)

  const tier = params.tier ?? pkg.defaultTier ?? 'STANDARD'

  return prisma.$transaction(async (tx) => {
    const option = await ensureOptionTx(tx, {
      estimateId: estimate.id,
      tier,
      name: pkg.name,
      description: pkg.description,
      isRecommended: pkg.isRecommendedDefault,
    })
    await appendLinesTx(
      tx,
      option.id,
      pkg.items.map((item) => ({
        priceBookItemId: item.priceBookItemId,
        quantity: Number(item.quantity.toString()),
      })),
    )
    await recalcOptionTx(tx, option.id, estimate.taxRateBps)
    return option
  })
}

export async function addCatalogItemToEstimate(
  session: AppSession,
  params: { estimateId: string; optionId?: string; tier?: EstimateTier; priceBookItemId: string; quantity: number },
) {
  const estimate = await session.db.estimate.findUnique({ where: { id: params.estimateId } })
  if (!estimate) throw new EstimateError('Estimate not found')
  assertEditable(estimate.status)

  return prisma.$transaction(async (tx) => {
    const option = params.optionId
      ? await tx.estimateOption.findFirstOrThrow({
          where: { id: params.optionId, estimateId: estimate.id },
        })
      : await ensureOptionTx(tx, { estimateId: estimate.id, tier: params.tier ?? 'STANDARD' })

    await appendLinesTx(tx, option.id, [
      { priceBookItemId: params.priceBookItemId, quantity: params.quantity },
    ])
    await recalcOptionTx(tx, option.id, estimate.taxRateBps)
    return option
  })
}

export async function removeEstimateItem(session: AppSession, itemId: string) {
  const item = await prisma.estimateItem.findUnique({
    where: { id: itemId },
    include: { option: { include: { estimate: true } } },
  })
  // Tenant check: the estimate must belong to this organization.
  if (!item || item.option.estimate.organizationId !== session.organizationId) {
    throw new EstimateError('Line not found')
  }
  assertEditable(item.option.estimate.status)

  return prisma.$transaction(async (tx) => {
    await tx.inspectionItem.updateMany({
      where: { estimateItemId: itemId },
      data: { estimateItemId: null },
    })
    await tx.estimateItem.delete({ where: { id: itemId } })
    await recalcOptionTx(tx, item.optionId, item.option.estimate.taxRateBps)
  })
}

export async function removeEstimateOption(session: AppSession, optionId: string) {
  const option = await prisma.estimateOption.findUnique({
    where: { id: optionId },
    include: { estimate: true, items: { select: { id: true } } },
  })
  if (!option || option.estimate.organizationId !== session.organizationId) {
    throw new EstimateError('Option not found')
  }
  assertEditable(option.estimate.status)

  await prisma.$transaction(async (tx) => {
    await tx.inspectionItem.updateMany({
      where: { estimateItemId: { in: option.items.map((item) => item.id) } },
      data: { estimateItemId: null },
    })
    if (option.estimate.selectedOptionId === optionId) {
      await tx.estimate.update({
        where: { id: option.estimateId },
        data: { selectedOptionId: null },
      })
    }
    await tx.estimateOption.delete({ where: { id: optionId } })
  })
}

export async function setRecommendedOption(session: AppSession, optionId: string) {
  const option = await prisma.estimateOption.findUnique({
    where: { id: optionId },
    include: { estimate: { select: { id: true, organizationId: true, status: true } } },
  })
  if (!option || option.estimate.organizationId !== session.organizationId) {
    throw new EstimateError('Option not found')
  }
  assertEditable(option.estimate.status)

  await prisma.$transaction(async (tx) => {
    await tx.estimateOption.updateMany({
      where: { estimateId: option.estimateId },
      data: { isRecommended: false },
    })
    await tx.estimateOption.update({ where: { id: optionId }, data: { isRecommended: true } })
  })
}

/**
 * Override the tax rate on this document only.
 *
 * The company default seeds it; changing it here is recorded as an override so
 * a later change to company settings never silently rewrites this estimate.
 */
export async function setEstimateTaxRate(
  session: AppSession,
  params: { estimateId: string; taxRateBps: number; jurisdiction?: string | null },
) {
  if (params.taxRateBps < 0 || params.taxRateBps > 5000) {
    throw new EstimateError('Enter a tax rate between 0% and 50%.')
  }

  const estimate = await session.db.estimate.findUnique({ where: { id: params.estimateId } })
  if (!estimate) throw new EstimateError('Estimate not found')
  assertEditable(estimate.status)

  return prisma.$transaction(async (tx) => {
    const updated = await tx.estimate.update({
      where: { id: params.estimateId },
      data: {
        taxRateBps: params.taxRateBps,
        taxRateOverridden: params.taxRateBps !== session.defaultTaxRateBps,
        taxJurisdiction: params.jurisdiction ?? estimate.taxJurisdiction,
      },
    })
    await recalcEstimateTx(tx, params.estimateId)
    return updated
  })
}

export async function updateEstimateItemQuantity(
  session: AppSession,
  params: { itemId: string; quantity: number },
) {
  if (!(params.quantity > 0)) throw new EstimateError('Quantity must be greater than zero.')

  const item = await prisma.estimateItem.findUnique({
    where: { id: params.itemId },
    include: { option: { include: { estimate: true } } },
  })
  if (!item || item.option.estimate.organizationId !== session.organizationId) {
    throw new EstimateError('Line not found')
  }
  assertEditable(item.option.estimate.status)

  return prisma.$transaction(async (tx) => {
    await tx.estimateItem.update({
      where: { id: params.itemId },
      data: { quantity: new Prisma.Decimal(params.quantity) },
    })
    await recalcOptionTx(tx, item.optionId, item.option.estimate.taxRateBps)
  })
}

/**
 * Editing is allowed while an estimate is a draft, or after it has been sent
 * but before anyone signed it. Once a customer has accepted, changes go to a
 * new version rather than over the top of what they agreed to.
 */
function assertEditable(status: string) {
  if (status === 'ACCEPTED') {
    throw new EstimateError(
      'This estimate has been accepted and signed. Create a new estimate for additional work.',
    )
  }
  if (status === 'VOID' || status === 'EXPIRED') {
    throw new EstimateError('This estimate is closed.')
  }
}

export async function auditEstimateChange(
  session: AppSession,
  estimateId: string,
  action: string,
  detail?: Prisma.InputJsonValue,
) {
  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action,
    entityType: 'Estimate',
    entityId: estimateId,
    after: detail,
  })
}
