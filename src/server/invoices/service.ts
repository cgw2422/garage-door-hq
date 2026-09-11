import { Prisma, type InvoiceStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { nextNumber } from '@/lib/numbering'
import { recordAudit } from '@/lib/audit'
import { taxCentsFor } from '@/lib/money'
import type { AppSession } from '@/lib/session'

export class InvoiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvoiceError'
  }
}

/**
 * Build the invoice from the option the customer actually signed.
 *
 * Lines are copied from the accepted estimate option, not re-derived from the
 * price book, and the tax rate comes from the estimate rather than from company
 * settings — so the invoice total equals the number on the signed document even
 * if either has changed since.
 */
export async function createInvoiceFromEstimateTx(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string
    estimateId: string
    jobId: string | null
    dueInDays: number
    issuedAt: Date
  },
) {
  const estimate = await tx.estimate.findFirstOrThrow({
    where: { id: params.estimateId, organizationId: params.organizationId },
    include: {
      selectedOption: { include: { items: { orderBy: { sortOrder: 'asc' } } } },
    },
  })

  if (!estimate.selectedOption) {
    throw new InvoiceError('The customer has not chosen an option on this estimate.')
  }

  const option = estimate.selectedOption
  const number = await nextNumber(tx, params.organizationId, 'INVOICE')
  const organization = await tx.organization.findUniqueOrThrow({
    where: { id: params.organizationId },
    select: { invoiceTermsText: true },
  })

  const subtotalCents = option.items.reduce(
    (sum, item) => sum + Math.round(Number(item.quantity.toString()) * item.unitPriceCents),
    0,
  )
  const taxableCents = option.items
    .filter((item) => item.taxable)
    .reduce(
      (sum, item) => sum + Math.round(Number(item.quantity.toString()) * item.unitPriceCents),
      0,
    )
  const taxCents = taxCentsFor(Math.max(taxableCents, 0), estimate.taxRateBps)
  const totalCents = subtotalCents + taxCents

  return tx.invoice.create({
    data: {
      organizationId: params.organizationId,
      number,
      jobId: params.jobId,
      estimateId: estimate.id,
      customerId: estimate.customerId,
      status: 'DRAFT',
      issuedAt: params.issuedAt,
      dueAt: new Date(params.issuedAt.getTime() + params.dueInDays * 24 * 60 * 60 * 1000),
      taxRateBps: estimate.taxRateBps,
      taxRateOverridden: estimate.taxRateOverridden,
      taxJurisdiction: estimate.taxJurisdiction,
      subtotalCents,
      discountCents: option.discountCents,
      taxCents,
      totalCents,
      paidCents: 0,
      balanceCents: totalCents,
      termsText: organization.invoiceTermsText,
      items: {
        create: option.items.map((item, index) => ({
          priceBookItemId: item.priceBookItemId,
          kind: item.kind,
          name: item.name,
          description: item.description,
          sku: item.sku,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          unitCostCents: item.unitCostCents,
          taxable: item.taxable,
          sortOrder: index,
        })),
      },
    },
    include: { items: true },
  })
}

/** Fallback for a job with no estimate: bill the parts and labor recorded. */
export async function createInvoiceFromLinesTx(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string
    customerId: string
    jobId: string | null
    taxRateBps: number
    dueInDays: number
    issuedAt: Date
    lines: Array<{
      priceBookItemId?: string | null
      kind: 'PART' | 'LABOR' | 'SERVICE_CALL' | 'DISCOUNT' | 'FEE' | 'CUSTOM'
      name: string
      sku?: string | null
      quantity: number
      unitPriceCents: number
      unitCostCents?: number
      taxable: boolean
    }>
  },
) {
  if (params.lines.length === 0) {
    throw new InvoiceError('There is nothing to invoice on this job yet.')
  }

  const number = await nextNumber(tx, params.organizationId, 'INVOICE')
  const organization = await tx.organization.findUniqueOrThrow({
    where: { id: params.organizationId },
    select: { invoiceTermsText: true },
  })

  const subtotalCents = params.lines.reduce(
    (sum, line) => sum + Math.round(line.quantity * line.unitPriceCents),
    0,
  )
  const taxableCents = params.lines
    .filter((line) => line.taxable)
    .reduce((sum, line) => sum + Math.round(line.quantity * line.unitPriceCents), 0)
  const taxCents = taxCentsFor(Math.max(taxableCents, 0), params.taxRateBps)
  const totalCents = subtotalCents + taxCents

  return tx.invoice.create({
    data: {
      organizationId: params.organizationId,
      number,
      jobId: params.jobId,
      customerId: params.customerId,
      status: 'DRAFT',
      issuedAt: params.issuedAt,
      dueAt: new Date(params.issuedAt.getTime() + params.dueInDays * 24 * 60 * 60 * 1000),
      taxRateBps: params.taxRateBps,
      subtotalCents,
      taxCents,
      totalCents,
      paidCents: 0,
      balanceCents: totalCents,
      termsText: organization.invoiceTermsText,
      items: {
        create: params.lines.map((line, index) => ({
          priceBookItemId: line.priceBookItemId ?? null,
          kind: line.kind,
          name: line.name,
          sku: line.sku ?? null,
          quantity: new Prisma.Decimal(line.quantity),
          unitPriceCents: line.unitPriceCents,
          unitCostCents: line.unitCostCents ?? 0,
          taxable: line.taxable,
          sortOrder: index,
        })),
      },
    },
    include: { items: true },
  })
}

export function statusForBalance(
  totalCents: number,
  paidCents: number,
  dueAt: Date | null,
  now: Date,
): InvoiceStatus {
  if (paidCents >= totalCents && totalCents > 0) return 'PAID'
  if (paidCents > 0) return 'PARTIAL'
  if (dueAt && dueAt < now) return 'PAST_DUE'
  return 'SENT'
}

export async function markInvoiceSent(session: AppSession, invoiceId: string) {
  const invoice = await session.db.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) throw new InvoiceError('Invoice not found')
  if (invoice.status !== 'DRAFT') return invoice

  const updated = await session.db.invoice.update({
    where: { id: invoiceId },
    data: { status: 'SENT', issuedAt: invoice.issuedAt ?? new Date() },
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'invoice.sent',
    entityType: 'Invoice',
    entityId: invoiceId,
    after: { number: invoice.number },
  })

  return updated
}

export interface RecordPaymentInput {
  invoiceId: string
  method: 'CARD' | 'ACH' | 'CASH' | 'CHECK' | 'OTHER'
  amountCents: number
  feeCents?: number
  reference?: string | null
  memo?: string | null
  receivedAt?: Date
}

/**
 * Manual payment recording.
 *
 * No card data touches this path: `method: CARD` here means "the customer paid
 * by card somewhere else and we are writing it down". The provider fields on
 * Payment stay null until a real processor is integrated.
 *
 * The invoice balance, its status and the job's costing are all updated in the
 * same transaction as the payment row, so the Money dashboard can never show a
 * payment the invoice does not know about.
 */
export async function recordPayment(session: AppSession, input: RecordPaymentInput) {
  if (!(input.amountCents > 0)) throw new InvoiceError('Enter an amount greater than zero.')

  const invoice = await session.db.invoice.findUnique({
    where: { id: input.invoiceId },
    select: {
      id: true,
      customerId: true,
      jobId: true,
      totalCents: true,
      paidCents: true,
      dueAt: true,
      status: true,
      number: true,
    },
  })
  if (!invoice) throw new InvoiceError('Invoice not found')
  if (invoice.status === 'VOID') throw new InvoiceError('This invoice has been voided.')

  const balance = invoice.totalCents - invoice.paidCents
  if (input.amountCents > balance) {
    throw new InvoiceError(
      `That is more than the ${(balance / 100).toFixed(2)} still outstanding on this invoice.`,
    )
  }

  const receivedAt = input.receivedAt ?? new Date()

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        organizationId: session.organizationId,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        method: input.method,
        status: 'SUCCEEDED',
        amountCents: input.amountCents,
        feeCents: input.feeCents ?? 0,
        receivedAt,
        reference: input.reference ?? null,
        memo: input.memo ?? null,
      },
    })

    const paidCents = invoice.paidCents + input.amountCents
    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        paidCents,
        balanceCents: invoice.totalCents - paidCents,
        status: statusForBalance(invoice.totalCents, paidCents, invoice.dueAt, receivedAt),
        paidAt: paidCents >= invoice.totalCents ? receivedAt : null,
      },
    })

    if (invoice.jobId) {
      await recomputeJobCostingTx(tx, session.organizationId, invoice.jobId)
    }

    return { payment, invoice: updated }
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'payment.recorded',
    entityType: 'Payment',
    entityId: result.payment.id,
    after: {
      invoiceNumber: invoice.number,
      method: input.method,
      amountCents: input.amountCents,
    },
  })

  return result
}

/**
 * Recompute a job's stored costing from its own records.
 *
 * Called from every path that can change the numbers — completion, payments,
 * refunds — so the Money dashboard never drifts from the underlying rows.
 */
export async function recomputeJobCostingTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  jobId: string,
) {
  const [parts, invoices, payments, organization] = await Promise.all([
    tx.jobPart.findMany({ where: { jobId } }),
    tx.invoice.findMany({
      where: { jobId, organizationId, status: { not: 'VOID' } },
      select: { totalCents: true },
    }),
    tx.payment.findMany({
      where: { organizationId, invoice: { jobId }, status: 'SUCCEEDED' },
      select: { feeCents: true },
    }),
    tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { laborCostEnabled: true, laborCostPerHourCents: true },
    }),
  ])

  const job = await tx.job.findFirstOrThrow({
    where: { id: jobId, organizationId },
    select: { startedAt: true, completedAt: true },
  })

  const partsCostCents = parts.reduce(
    (sum, part) => sum + Math.round(Number(part.quantity.toString()) * part.unitCostCents),
    0,
  )
  const revenueCents = invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0)
  const processingFeeCents = payments.reduce((sum, payment) => sum + payment.feeCents, 0)

  // Labor cost is opt-in. With it off — the default, and what a solo operator
  // wants — a job's own time is simply not counted as a cost.
  let laborCostCents = 0
  if (organization.laborCostEnabled && organization.laborCostPerHourCents && job.startedAt && job.completedAt) {
    const hours = (job.completedAt.getTime() - job.startedAt.getTime()) / 3_600_000
    laborCostCents = Math.round(Math.max(hours, 0) * organization.laborCostPerHourCents)
  }

  return tx.job.update({
    where: { id: jobId },
    data: { revenueCents, partsCostCents, processingFeeCents, laborCostCents },
  })
}
