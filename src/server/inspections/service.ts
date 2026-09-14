import type { InspectionItemStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import {
  RESIDENTIAL_INSPECTION,
  STATUS_LABELS,
  isActionable,
  isValidResponse,
  severityOf,
} from '@/lib/inspection-template'

export class InspectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InspectionError'
  }
}

/**
 * Open the job's inspection, creating it with every template item on first use.
 *
 * Items are created up front rather than on demand so the checklist is a fixed
 * list a technician can work down without the page reordering under their thumb.
 */
export async function startInspection(session: AppSession, jobId: string) {
  const job = await session.db.job.findUnique({
    where: { id: jobId },
    select: { id: true, doorId: true },
  })
  if (!job) throw new InspectionError('Job not found')

  const existing = await session.db.inspection.findFirst({
    where: { jobId },
    orderBy: { createdAt: 'desc' },
  })
  if (existing) return existing

  return prisma.inspection.create({
    data: {
      organizationId: session.organizationId,
      jobId,
      doorId: job.doorId,
      templateKey: 'residential-standard',
      status: 'IN_PROGRESS',
      items: {
        create: RESIDENTIAL_INSPECTION.map((component, index) => ({
          componentKey: component.key,
          label: component.label,
          // Copied, not looked up later: an inspection keeps asking the
          // question it was started with even if the template changes.
          responseType: component.responseType,
          sortOrder: index,
        })),
      },
    },
  })
}

/** Inspection items carry no tenant column; they are reached via the inspection. */
async function loadOwnedItem(session: AppSession, itemId: string) {
  const item = await prisma.inspectionItem.findUnique({
    where: { id: itemId },
    include: { inspection: { select: { id: true, jobId: true, organizationId: true } } },
  })
  if (!item || item.inspection.organizationId !== session.organizationId) {
    throw new InspectionError('Inspection item not found')
  }
  return item
}

export async function setItemStatus(
  session: AppSession,
  params: { itemId: string; status: InspectionItemStatus },
) {
  const item = await loadOwnedItem(session, params.itemId)

  // "Door Balance — Worn" is not a thing a technician would say, and now it is
  // not a thing the database will hold either. The check is here rather than
  // only in the UI because the UI is not the only caller.
  if (!isValidResponse(item.responseType, params.status)) {
    throw new InspectionError(
      `"${STATUS_LABELS[params.status]}" is not one of the answers for ${item.label}.`,
    )
  }

  return prisma.inspectionItem.update({
    where: { id: item.id },
    data: { status: params.status },
  })
}

export async function setItemNote(
  session: AppSession,
  params: { itemId: string; note: string | null },
) {
  const item = await loadOwnedItem(session, params.itemId)
  return prisma.inspectionItem.update({
    where: { id: item.id },
    data: { note: params.note?.trim() || null },
  })
}

export async function completeInspection(
  session: AppSession,
  params: { inspectionId: string; summary?: string | null },
) {
  const inspection = await session.db.inspection.findUnique({
    where: { id: params.inspectionId },
    include: { items: true },
  })
  if (!inspection) throw new InspectionError('Inspection not found')

  const findings = inspection.items.filter((item) => isActionable(item.status))

  return session.db.inspection.update({
    where: { id: params.inspectionId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      summary:
        params.summary?.trim() ||
        (findings.length === 0
          ? 'All checked components in good condition.'
          : `${findings.length} item${findings.length === 1 ? '' : 's'} needing attention: ${findings
              .map((item) => item.label)
              .join(', ')}.`),
    },
  })
}

export interface RemedyOption {
  id: string
  name: string
  description: string | null
  /** Total price of everything the remedy adds, for the chip label. */
  priceCents: number
  tier: 'GOOD' | 'BETTER' | 'BEST' | 'STANDARD'
  isPackage: boolean
  /** Empty means "offer this for any actionable finding". */
  forStatuses: InspectionItemStatus[]
  /**
   * The catalog lines this option would put on the estimate.
   *
   * The identity of a recommendation is what it sells, not where it was
   * tapped: the same roller swap is offered under Rollers, under Lubrication
   * and under Noise, and all three have to agree about whether it is already
   * on the estimate. These ids are what they agree on.
   */
  targetItemIds: string[]
}

/**
 * The remedies offered for each component, priced.
 *
 * Loaded once for the whole checklist rather than per row, so marking twenty
 * items does not mean twenty round trips.
 */
export async function loadRemedies(
  session: AppSession,
): Promise<Map<string, RemedyOption[]>> {
  const remedies = await session.db.inspectionRemedy.findMany({
    where: { isActive: true },
    orderBy: [{ componentKey: 'asc' }, { sortOrder: 'asc' }],
    include: {
      priceBookItem: { select: { priceCents: true, isActive: true } },
      package: {
        select: {
          defaultTier: true,
          priceCents: true,
          isActive: true,
          items: {
            select: {
              quantity: true,
              priceBookItemId: true,
              priceBookItem: { select: { priceCents: true } },
            },
          },
        },
      },
    },
  })

  const byComponent = new Map<string, RemedyOption[]>()

  for (const remedy of remedies) {
    if (remedy.package && !remedy.package.isActive) continue
    if (remedy.priceBookItem && !remedy.priceBookItem.isActive) continue

    const priceCents = remedy.package
      ? (remedy.package.priceCents ??
        remedy.package.items.reduce(
          (sum, line) =>
            sum + Math.round(Number(line.quantity.toString()) * line.priceBookItem.priceCents),
          0,
        ))
      : Math.round(Number(remedy.quantity.toString()) * (remedy.priceBookItem?.priceCents ?? 0))

    const bucket = byComponent.get(remedy.componentKey) ?? []
    bucket.push({
      id: remedy.id,
      name: remedy.name,
      description: remedy.description,
      priceCents,
      tier: remedy.package?.defaultTier ?? 'STANDARD',
      isPackage: Boolean(remedy.packageId),
      forStatuses: remedy.forStatuses,
      targetItemIds: remedy.package
        ? remedy.package.items.map((line) => line.priceBookItemId)
        : remedy.priceBookItemId
          ? [remedy.priceBookItemId]
          : [],
    })
    byComponent.set(remedy.componentKey, bucket)
  }

  return byComponent
}

/**
 * What is already on the job's draft estimate, as `TIER:priceBookItemId`.
 *
 * This is the whole of the "already added" state. There is no per-button
 * memory anywhere: every recommendation that sells the same service reads
 * this same set, so adding a roller swap under Rollers lights it up under
 * Lubrication too, and removing it from the estimate turns both off. The
 * estimate is the truth; the buttons are a view of it.
 *
 * Keyed by tier as well as by service because the tiers are alternatives the
 * customer chooses between. A roller swap inside the BEST spring package is
 * not the same offer as a roller swap on its own, and treating them as one
 * would quietly drop a line from whichever the customer picked.
 */
export async function loadQuotedServices(
  session: AppSession,
  jobId: string,
): Promise<string[]> {
  const estimate = await session.db.estimate.findFirst({
    where: { jobId, status: 'DRAFT' },
    orderBy: { createdAt: 'desc' },
    select: {
      options: {
        select: { tier: true, items: { select: { priceBookItemId: true } } },
      },
    },
  })
  if (!estimate) return []

  const keys = new Set<string>()
  for (const option of estimate.options) {
    for (const item of option.items) {
      if (item.priceBookItemId) keys.add(quotedKey(option.tier, item.priceBookItemId))
    }
  }
  return [...keys]
}

export function quotedKey(tier: string, priceBookItemId: string): string {
  return `${tier}:${priceBookItemId}`
}

/** True when everything this recommendation sells is already on the estimate. */
export function isRemedyQuoted(remedy: RemedyOption, quoted: ReadonlySet<string>): boolean {
  if (remedy.targetItemIds.length === 0) return false
  return remedy.targetItemIds.every((id) => quoted.has(quotedKey(remedy.tier, id)))
}

/**
 * Whether a remedy is offered for a finding.
 *
 * Matched on severity rather than on the exact word, so a remedy written for a
 * FAILED spring is also offered for a photo eye that did not pass. Those are
 * the same event to whoever decides what to quote, and requiring every remedy
 * to list every synonym would mean a new answer type silently stops selling
 * anything.
 */
export function remedyApplies(
  forStatuses: InspectionItemStatus[],
  status: InspectionItemStatus,
): boolean {
  if (!isActionable(status)) return false
  if (forStatuses.length === 0) return true
  const severity = severityOf(status)
  return forStatuses.some((named) => severityOf(named) === severity)
}

/** Remedies apply when the finding matches, or when the remedy names no statuses. */
export function remediesFor(
  all: Map<string, RemedyOption[]>,
  componentKey: string,
  status: InspectionItemStatus,
): RemedyOption[] {
  if (!isActionable(status)) return []
  const options = all.get(componentKey) ?? []
  return options.filter((option) => remedyApplies(option.forStatuses, status))
}

/** True when a finding has a full Good/Better/Best set ready to present. */
export function hasTieredSet(options: RemedyOption[]): boolean {
  const tiers = new Set(options.map((option) => option.tier))
  return tiers.has('GOOD') && tiers.has('BETTER') && tiers.has('BEST')
}
