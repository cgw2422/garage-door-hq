import { Prisma, type EstimateTier, type LineItemKind } from '@prisma/client'
import { prisma } from '@/lib/db'
import { nextIdentifier } from '@/lib/numbering'
import { recordAudit } from '@/lib/audit'
import type { AppSession } from '@/lib/session'
import { estimateKindForJobType, optionNameFor } from '@/lib/estimate-presentation'
import { computeTotals } from './documents'

/**
 * Estimate construction.
 *
 * An estimate is a list of options — one, two, three, occasionally more. Each
 * is an `EstimateOption` with its own itemized lines and its own stored
 * totals. A package is a reusable option: dropping one in copies its
 * components as individual priced lines, so the customer always sees what they
 * are buying.
 *
 * Good/Better/Best is one way to use that structure, not the structure itself.
 * A technician who has one appropriate repair quotes one option; nothing here
 * asks them to invent two more to fill a layout.
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

function kindForCategory(category: string): LineItemKind {
  if (category === 'LABOR') return 'LABOR'
  if (category === 'SERVICE_CALL') return 'SERVICE_CALL'
  return 'PART'
}

/** Find the job's open draft estimate, or start one. */
export async function ensureDraftEstimate(session: AppSession, jobId: string) {
  const job = await session.db.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      customerId: true,
      jobType: { select: { name: true, slug: true } },
    },
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
        // A new door is a different sale from a repair: it defaults to being
        // sent rather than presented, and is where the richer proposal will
        // hang. Read from the job type rather than asked for.
        kind: estimateKindForJobType(job.jobType?.slug),
        // Company defaults at creation time; the document owns them from here,
        // so editing settings later cannot rewrite this estimate.
        taxRateBps: session.defaultTaxRateBps,
        termsText: organization.estimateTermsText,
      },
    })
  })
}

/**
 * Find the option this work belongs in, or start one.
 *
 * Identified by name rather than by a tier slot, because most estimates have
 * no tiers: "Replace Both Springs" is an option in its own right, and adding
 * the same recommendation twice should land in the option it already made
 * rather than opening a second one beside it.
 *
 * `tier` is passed only when the caller is deliberately building a
 * Good/Better/Best set. Everywhere else it stays null, and the option's own
 * name is what the customer reads.
 */
async function ensureOptionTx(
  tx: Prisma.TransactionClient,
  params: {
    estimateId: string
    name: string
    tier?: EstimateTier | null
    description?: string | null
    isRecommended?: boolean
  },
) {
  const existing = await tx.estimateOption.findFirst({
    where: params.tier
      ? { estimateId: params.estimateId, tier: params.tier }
      : { estimateId: params.estimateId, name: params.name },
  })
  if (existing) return existing

  const last = await tx.estimateOption.findFirst({
    where: { estimateId: params.estimateId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  return tx.estimateOption.create({
    data: {
      estimateId: params.estimateId,
      tier: params.tier ?? null,
      name: params.name,
      description: params.description ?? null,
      isRecommended: params.isRecommended ?? false,
      sortOrder: last ? last.sortOrder + 1 : 0,
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

/**
 * What to do when a line is already on this option.
 *
 * `increment` is right when someone deliberately adds ten more rollers.
 * `skip` is right for a recommendation, because the same service is offered
 * under several inspection items — a roller swap hangs off Rollers, off
 * Lubrication and off Noise — and tapping it in two places means "put this on
 * the estimate", not "charge for it twice".
 */
type DuplicatePolicy = 'increment' | 'skip'

/**
 * What a quantity is allowed to be.
 *
 * Checked in the service rather than only in the action's schema, because the
 * action is not the only caller and a quantity is the one number on an
 * estimate that does come from the browser. The ceiling is not a business
 * rule — it is arithmetic: quantity times unit price has to stay inside the
 * integer cents the rest of the system counts in.
 */
const MAX_QUANTITY = 9999

function assertQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new EstimateError('Quantity must be greater than zero.')
  }
  if (quantity > MAX_QUANTITY) {
    throw new EstimateError(`Quantity cannot be more than ${MAX_QUANTITY}.`)
  }
}

async function appendLinesTx(
  tx: Prisma.TransactionClient,
  params: { optionId: string; organizationId: string },
  lines: Array<{ priceBookItemId: string; quantity: number }>,
  onDuplicate: DuplicatePolicy = 'increment',
) {
  const { optionId, organizationId } = params
  const itemIds = lines.map((line) => line.priceBookItemId)

  // Scoped to the estimate's own organization, and not negotiable.
  //
  // This is the one place every priced line enters an estimate, and the only
  // place that reads a catalog id the caller supplied. Without the tenant
  // filter, posting another company's price book id here would copy their
  // name, SKU, price and *cost* onto this estimate — a direct read of a
  // competitor's numbers through a write nobody would think to check.
  const catalog = await tx.priceBookItem.findMany({
    where: { id: { in: itemIds }, organizationId },
  })
  const byId = new Map(catalog.map((item) => [item.id, item]))

  // A line that resolved to nothing is either a deleted item or an id from
  // somewhere it should not have come from. Either way the caller asked for
  // work this estimate cannot price, so it fails rather than quietly
  // returning a shorter estimate than the one they thought they built.
  const missing = itemIds.filter((id) => !byId.has(id))
  if (missing.length > 0) {
    throw new EstimateError('That item is not in your price book.')
  }

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
      if (onDuplicate === 'skip') {
        created.push(duplicate)
        continue
      }
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
  params: {
    jobId: string
    inspectionItemId?: string | null
    remedyId: string
    /**
     * Only set by the Build Options shortcut, which is deliberately building
     * a Good/Better/Best set. Adding a recommendation from a finding leaves
     * this alone, and the option is named after the work instead.
     */
    asTier?: EstimateTier | null
  },
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
      tier: params.asTier ?? null,
      name: optionNameFor(remedy),
      description: remedy.package?.description ?? remedy.description,
      isRecommended: remedy.package?.isRecommendedDefault ?? false,
    })

    // A recommendation offered under three different findings is still one
    // service. Tapping it again must not move the total.
    const created = await appendLinesTx(
      tx,
      { optionId: option.id, organizationId: session.organizationId },
      lines,
      'skip',
    )
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
 * Take a recommendation back off the estimate.
 *
 * The inverse of adding one, and keyed the same way: the lines the remedy
 * sells, on the tier it sells them into. It does not matter which finding the
 * technician tapped to add it or which one they tapped to take it off — the
 * service is the identity, so removing it under Lubrication removes the same
 * line that was added under Rollers.
 *
 * An option left with nothing in it goes too. An empty "Standard" heading on
 * an estimate a customer is about to read is clutter that says nothing.
 */
export async function removeRemedyFromEstimate(
  session: AppSession,
  params: { jobId: string; remedyId: string },
) {
  const remedy = await session.db.inspectionRemedy.findUnique({
    where: { id: params.remedyId },
    include: { package: { include: { items: true } } },
  })
  if (!remedy) throw new EstimateError('That option is no longer available.')

  const estimate = await session.db.estimate.findFirst({
    where: { jobId: params.jobId, status: 'DRAFT', archivedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, taxRateBps: true },
  })
  if (!estimate) return { estimateId: null, removed: 0 }
  assertEditable(estimate.status)

  const targetItemIds = remedy.package
    ? remedy.package.items.map((line) => line.priceBookItemId)
    : remedy.priceBookItemId
      ? [remedy.priceBookItemId]
      : []
  if (targetItemIds.length === 0) return { estimateId: estimate.id, removed: 0 }

  // The same option the add path would have used, found the same way — by
  // name. Looking it up by tier would miss every estimate that has no tiers,
  // which is now most of them.
  const option = await prisma.estimateOption.findFirst({
    where: { estimateId: estimate.id, name: optionNameFor(remedy) },
    select: { id: true },
  })
  if (!option) return { estimateId: estimate.id, removed: 0 }

  const removed = await prisma.$transaction(async (tx) => {
    const lines = await tx.estimateItem.findMany({
      where: { optionId: option.id, priceBookItemId: { in: targetItemIds } },
      select: { id: true },
    })
    if (lines.length === 0) return 0

    const ids = lines.map((line) => line.id)
    await tx.inspectionItem.updateMany({
      where: { estimateItemId: { in: ids } },
      data: { estimateItemId: null },
    })
    await tx.estimateItem.deleteMany({ where: { id: { in: ids } } })

    const left = await tx.estimateItem.count({ where: { optionId: option.id } })
    if (left === 0) {
      await tx.estimate.updateMany({
        where: { id: estimate.id, selectedOptionId: option.id },
        data: { selectedOptionId: null },
      })
      await tx.estimateOption.delete({ where: { id: option.id } })
    } else {
      await recalcOptionTx(tx, option.id, estimate.taxRateBps)
    }

    return ids.length
  })

  return { estimateId: estimate.id, removed }
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
      asTier: remedy.package?.defaultTier ?? null,
    })
    estimateId = result.estimateId
    addedItemIds.push(...result.addedItemIds)
  }

  // Asked for explicitly, so recorded explicitly. Nothing infers tiers from
  // the fact that an estimate happens to have three options.
  if (estimateId) {
    await prisma.estimate.update({
      where: { id: estimateId },
      data: { presentation: 'GOOD_BETTER_BEST' },
    })
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

  return prisma.$transaction(async (tx) => {
    const option = await ensureOptionTx(tx, {
      estimateId: estimate.id,
      tier: params.tier ?? null,
      name: pkg.name,
      description: pkg.description,
      isRecommended: pkg.isRecommendedDefault,
    })
    await appendLinesTx(
      tx,
      { optionId: option.id, organizationId: session.organizationId },
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
  assertQuantity(params.quantity)

  const estimate = await session.db.estimate.findUnique({ where: { id: params.estimateId } })
  if (!estimate) throw new EstimateError('Estimate not found')
  assertEditable(estimate.status)

  return prisma.$transaction(async (tx) => {
    const option = params.optionId
      ? await tx.estimateOption.findFirstOrThrow({
          where: { id: params.optionId, estimateId: estimate.id },
        })
      : await ensureOptionTx(tx, {
          estimateId: estimate.id,
          tier: params.tier ?? null,
          name: TIER_NAMES[params.tier ?? 'STANDARD'],
        })

    await appendLinesTx(tx, { optionId: option.id, organizationId: session.organizationId }, [
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

  await prisma.$transaction(async (tx) => {
    await tx.inspectionItem.updateMany({
      where: { estimateItemId: itemId },
      data: { estimateItemId: null },
    })
    await tx.estimateItem.delete({ where: { id: itemId } })
    await recalcOptionTx(tx, item.optionId, item.option.estimate.taxRateBps)
  })

  // The caller revalidates the inspection too: taking a service off here has
  // to turn its "Added" buttons back on, wherever they are offered.
  return { jobId: item.option.estimate.jobId }
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

  return { jobId: option.estimate.jobId }
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
  assertQuantity(params.quantity)

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
