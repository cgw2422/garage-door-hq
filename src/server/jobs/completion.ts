import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import type { AppSession } from '@/lib/session'
import { postLedgerMovesTx } from '@/server/inventory/ledger'
import {
  createInvoiceFromEstimateTx,
  createInvoiceFromLinesTx,
  recomputeJobCostingTx,
} from '@/server/invoices/service'
import {
  addDoorEventTx,
  describeSprings,
  replaceSpringSystemTx,
  type SpringInput,
} from '@/server/doors/service'
import { storeSignatureImage } from '@/server/media/signatures'

/**
 * Job completion.
 *
 * This is the one place in the product where several systems have to move
 * together: inventory comes off the truck, the Door Passport gains a new
 * spring system and a timeline entry, an invoice is generated from what the
 * customer signed, and the job's costing is recalculated.
 *
 * All of it runs inside a single database transaction. A partial completion —
 * parts deducted but no invoice, or an invoice with no passport entry — would
 * leave a business with books it cannot trust, so there is no path here that
 * commits some of the work and not the rest.
 *
 * The one thing that cannot join the transaction is the signature image, which
 * lives in object storage. It is written first: a stranded image is harmless,
 * a signature row pointing at nothing is not.
 */

export class CompletionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompletionError'
  }
}

export interface PartUsedInput {
  priceBookItemId: string
  quantity: number
}

export interface CompleteJobInput {
  jobId: string
  /** What actually came off the truck. */
  partsUsed: PartUsedInput[]
  /** Where the parts came from; defaults to the technician's own truck. */
  inventoryLocationId?: string | null
  workSummary?: string | null
  /** Generate the invoice now (from the signed estimate when there is one). */
  createInvoice?: boolean
  /** Mark that invoice as sent rather than leaving it a draft. */
  sendInvoice?: boolean
  /** Optional work-completion signature. */
  signature?: { signerName: string; dataUrl: string } | null
  /** Queue a review request when the company has a destination configured. */
  requestReview?: boolean
  ipAddress?: string | null
  userAgent?: string | null
  now?: Date
}

export interface CompleteJobResult {
  jobId: string
  invoiceId: string | null
  invoiceNumber: number | null
  springSystemReplaced: boolean
  partsConsumed: number
  doorEventTitles: string[]
}

export async function completeJob(
  session: AppSession,
  input: CompleteJobInput,
): Promise<CompleteJobResult> {
  const now = input.now ?? new Date()

  const job = await session.db.job.findUnique({
    where: { id: input.jobId },
    include: {
      door: { select: { id: true } },
      jobType: { select: { name: true } },
      estimates: {
        where: { status: 'ACCEPTED' },
        orderBy: { acceptedAt: 'desc' },
        take: 1,
        select: { id: true, selectedOptionId: true },
      },
    },
  })
  if (!job) throw new CompletionError('Job not found')
  if (job.status === 'COMPLETED') throw new CompletionError('This job is already completed.')
  if (job.status === 'CANCELLED') throw new CompletionError('This job was cancelled.')

  const locationId =
    input.inventoryLocationId ?? session.defaultLocationId ?? (await firstLocationId(session))

  if (input.partsUsed.length > 0 && !locationId) {
    throw new CompletionError(
      'No inventory location is set up, so parts cannot be deducted. Add a truck first.',
    )
  }

  const acceptedEstimate = job.estimates[0] ?? null

  // Resolve catalog details up front so the transaction stays short.
  const catalog =
    input.partsUsed.length > 0
      ? await session.db.priceBookItem.findMany({
          where: { id: { in: input.partsUsed.map((part) => part.priceBookItemId) } },
          include: { springSpec: true },
        })
      : []
  const catalogById = new Map(catalog.map((item) => [item.id, item]))

  for (const part of input.partsUsed) {
    if (!catalogById.has(part.priceBookItemId)) {
      throw new CompletionError('One of the parts used is no longer in your price book.')
    }
    if (!(part.quantity > 0)) {
      throw new CompletionError('Part quantities must be greater than zero.')
    }
  }

  // Written before the transaction; object storage cannot participate in it.
  const signatureImageKey = input.signature
    ? await storeSignatureImage(session, input.signature.dataUrl)
    : null

  // Both the company switch and the technician's checkbox have to be on.
  const organization = await session.db.organization.findUniqueOrThrow({
    where: { id: session.organizationId },
    select: { reviewRequestEnabled: true },
  })
  const reviewDestination =
    input.requestReview && organization.reviewRequestEnabled
      ? await session.db.reviewDestination.findFirst({
          where: { isActive: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        })
      : null

  const result = await prisma.$transaction(
    async (tx) => {
      // Re-read inside the transaction so two technicians tapping Complete at
      // the same time cannot both pass the status check.
      const locked = await tx.job.findFirstOrThrow({
        where: { id: job.id, organizationId: session.organizationId },
        select: { status: true, startedAt: true, customerId: true },
      })
      if (locked.status === 'COMPLETED') {
        throw new CompletionError('This job is already completed.')
      }

      // --- Parts used -------------------------------------------------------
      const partRows = []
      for (const part of input.partsUsed) {
        const item = catalogById.get(part.priceBookItemId)!
        partRows.push(
          await tx.jobPart.create({
            data: {
              jobId: job.id,
              priceBookItemId: item.id,
              description: item.name,
              sku: item.sku,
              quantity: new Prisma.Decimal(part.quantity),
              unitCostCents: item.costCents,
            },
          }),
        )
      }

      // --- Inventory --------------------------------------------------------
      const trackedParts = input.partsUsed.filter(
        (part) => catalogById.get(part.priceBookItemId)?.trackInventory,
      )
      if (trackedParts.length > 0 && locationId) {
        await postLedgerMovesTx(tx, {
          organizationId: session.organizationId,
          actorId: session.userId,
          moves: trackedParts.map((part) => ({
            priceBookItemId: part.priceBookItemId,
            kind: 'CONSUMPTION' as const,
            quantity: part.quantity,
            fromLocationId: locationId,
            unitCostCents: catalogById.get(part.priceBookItemId)?.costCents ?? 0,
            jobId: job.id,
            reason: 'Parts used on job',
          })),
        })
      }

      // --- Door Passport ----------------------------------------------------
      const doorEventTitles: string[] = []
      let springSystemReplaced = false

      if (job.door) {
        const springs = buildSpringsFromParts(input.partsUsed, catalogById)

        if (springs.length > 0) {
          await replaceSpringSystemTx(tx, {
            organizationId: session.organizationId,
            doorId: job.door.id,
            jobId: job.id,
            occurredAt: now,
            input: {
              type: springs[0]!.type,
              springs: springs.map((spring) => spring.spring),
            },
          })
          springSystemReplaced = true
          doorEventTitles.push('Torsion Springs Replaced')
        }

        const otherParts = partRows.filter(
          (row) => !catalogById.get(row.priceBookItemId ?? '')?.springSpec,
        )
        const title = job.jobType?.name ?? 'Service Visit'
        await addDoorEventTx(tx, {
          doorId: job.door.id,
          jobId: job.id,
          kind: springSystemReplaced ? 'REPAIR' : 'SERVICE',
          occurredAt: now,
          title,
          detail:
            input.workSummary?.trim() ||
            (otherParts.length > 0
              ? `Parts used: ${otherParts.map((part) => `${Number(part.quantity.toString())} × ${part.description}`).join(', ')}`
              : null),
          metadata: {
            partsUsed: partRows.map((row) => ({
              sku: row.sku,
              description: row.description,
              quantity: Number(row.quantity.toString()),
            })),
          } as Prisma.InputJsonValue,
        })
        doorEventTitles.push(title)
      }

      // --- Invoice ----------------------------------------------------------
      let invoice: { id: string; number: number } | null = null

      if (input.createInvoice !== false) {
        if (acceptedEstimate?.selectedOptionId) {
          const created = await createInvoiceFromEstimateTx(tx, {
            organizationId: session.organizationId,
            estimateId: acceptedEstimate.id,
            jobId: job.id,
            dueInDays: 0,
            issuedAt: now,
          })
          invoice = { id: created.id, number: created.number }
        } else if (partRows.length > 0) {
          const created = await createInvoiceFromLinesTx(tx, {
            organizationId: session.organizationId,
            customerId: locked.customerId,
            jobId: job.id,
            taxRateBps: session.defaultTaxRateBps,
            dueInDays: 0,
            issuedAt: now,
            lines: partRows.map((row) => {
              const item = catalogById.get(row.priceBookItemId ?? '')
              return {
                priceBookItemId: row.priceBookItemId,
                kind: item?.category === 'LABOR' ? ('LABOR' as const) : ('PART' as const),
                name: row.description,
                sku: row.sku,
                quantity: Number(row.quantity.toString()),
                unitPriceCents: item?.priceCents ?? 0,
                unitCostCents: row.unitCostCents,
                taxable: item?.taxable ?? true,
              }
            }),
          })
          invoice = { id: created.id, number: created.number }
        }

        if (invoice && input.sendInvoice) {
          await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'SENT' } })
        }
      }

      // --- Signature --------------------------------------------------------
      if (input.signature && signatureImageKey) {
        await tx.signature.create({
          data: {
            organizationId: session.organizationId,
            kind: 'JOB_COMPLETION',
            signerName: input.signature.signerName.trim(),
            imageKey: signatureImageKey,
            signedAt: now,
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ?? null,
            jobId: job.id,
            invoiceId: invoice?.id ?? null,
          },
        })
      }

      // --- The job itself ---------------------------------------------------
      await tx.job.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          startedAt: locked.startedAt ?? job.arrivedAt ?? now,
          internalNotes: input.workSummary?.trim() || job.internalNotes,
        },
      })

      await recomputeJobCostingTx(tx, session.organizationId, job.id)

      // --- Review request ---------------------------------------------------
      if (reviewDestination) {
        await tx.reviewRequest.create({
          data: {
            organizationId: session.organizationId,
            customerId: locked.customerId,
            jobId: job.id,
            destinationId: reviewDestination.id,
            // Snapshot: an edited setting cannot rewrite what was sent.
            reviewUrl: reviewDestination.url,
            status: 'QUEUED',
            scheduledFor: new Date(now.getTime() + 2 * 60 * 60 * 1000),
          },
        })
      }

      return {
        jobId: job.id,
        invoiceId: invoice?.id ?? null,
        invoiceNumber: invoice?.number ?? null,
        springSystemReplaced,
        partsConsumed: trackedParts.length,
        doorEventTitles,
      }
    },
    { timeout: 30_000 },
  )

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'job.completed',
    entityType: 'Job',
    entityId: job.id,
    after: {
      invoiceNumber: result.invoiceNumber,
      partsConsumed: result.partsConsumed,
      springSystemReplaced: result.springSystemReplaced,
    },
  })

  return result
}

type CatalogEntry = Prisma.PriceBookItemGetPayload<{ include: { springSpec: true } }>

/**
 * Turn the springs among the parts used into the door's new configuration.
 *
 * A spring SKU carries its own typed specification, so replacing springs never
 * asks the technician to re-key what they just fitted.
 */
function buildSpringsFromParts(
  parts: PartUsedInput[],
  catalog: Map<string, CatalogEntry>,
): Array<{ type: 'TORSION' | 'EXTENSION' | 'TORQUEMASTER' | 'COMMERCIAL_TORSION' | 'OTHER'; spring: SpringInput }> {
  const springs: Array<{
    type: 'TORSION' | 'EXTENSION' | 'TORQUEMASTER' | 'COMMERCIAL_TORSION' | 'OTHER'
    spring: SpringInput
  }> = []

  for (const part of parts) {
    const item = catalog.get(part.priceBookItemId)
    if (!item?.springSpec) continue

    springs.push({
      type: item.springSpec.type,
      spring: {
        wireSizeInches: Number(item.springSpec.wireSizeInches.toString()),
        insideDiameterInches: Number(item.springSpec.insideDiameterInches.toString()),
        lengthInches: Number(item.springSpec.lengthInches.toString()),
        wind: item.springSpec.wind,
        quantity: part.quantity,
        cycleRating: item.springSpec.cycleRating,
        colorCode: item.springSpec.colorCode,
        priceBookItemId: item.id,
      },
    })
  }

  return springs
}

async function firstLocationId(session: AppSession): Promise<string | null> {
  const location = await session.db.inventoryLocation.findFirst({
    where: { isActive: true },
    orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  })
  return location?.id ?? null
}

export { describeSprings }
