import type Stripe from 'stripe'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { recomputeJobCostingTx, statusForBalance } from '@/server/invoices/service'
import { readStripeConfigFromEnv, stripe } from './stripe'
import { isUniqueViolation } from './webhooks'

/**
 * A garage door company's customer paying an invoice.
 *
 * Entirely separate from the $39.99 subscription. The charge is created **on
 * the connected account**, so the money settles with the company and the
 * cardholder's statement carries the company's name. See
 * docs/PAYMENT-MODEL.md.
 *
 * The invariant that matters: an invoice is marked paid by a webhook, never by
 * a browser reaching a success page. `recordStripePayment` is idempotent on
 * the provider's own ids, so a webhook delivered twice records one payment.
 */

export class PaymentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaymentError'
  }
}

export interface PayableInvoice {
  id: string
  organizationId: string
  customerId: string
  balanceCents: number
  currency: string
  displayNumber: string
  customerEmail: string | null
  companyName: string
  connectedAccountId: string
}

/**
 * Can this invoice be paid by card right now?
 *
 * Returns null rather than throwing: the portal simply does not show a Pay
 * button, which is the right behaviour for a customer who cannot act on a
 * problem they did not cause.
 */
export async function payableInvoice(invoiceId: string): Promise<PayableInvoice | null> {
  if (!readStripeConfigFromEnv()) return null

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      organizationId: true,
      customerId: true,
      balanceCents: true,
      status: true,
      number: true,
      displayNumber: true,
      customer: { select: { email: true } },
      organization: {
        select: {
          name: true,
          currency: true,
          paymentAccount: {
            select: { providerAccountId: true, chargesEnabled: true, disconnectedAt: true },
          },
        },
      },
    },
  })

  if (!invoice) return null
  if (invoice.status === 'VOID' || invoice.status === 'PAID') return null
  if (invoice.balanceCents <= 0) return null

  const account = invoice.organization.paymentAccount
  // A half-onboarded account must never be offered to a customer: they would
  // hit an error at the worst possible moment.
  if (!account || account.disconnectedAt || !account.chargesEnabled) return null

  return {
    id: invoice.id,
    organizationId: invoice.organizationId,
    customerId: invoice.customerId,
    balanceCents: invoice.balanceCents,
    currency: invoice.organization.currency,
    displayNumber: invoice.displayNumber ?? `INV-${invoice.number}`,
    customerEmail: invoice.customer.email,
    companyName: invoice.organization.name,
    connectedAccountId: account.providerAccountId,
  }
}

/**
 * Start a Checkout session on the company's connected account.
 *
 * `stripeAccount` on the request is what makes this a direct charge: Stripe
 * treats the connected account as the merchant, and the funds never touch a
 * platform balance.
 */
export async function createInvoiceCheckout(params: {
  invoice: PayableInvoice
  successUrl: string
  cancelUrl: string
}): Promise<{ url: string }> {
  const { invoice } = params

  const account = await prisma.paymentAccount.findUnique({
    where: { organizationId: invoice.organizationId },
    select: { applicationFeeBps: true },
  })

  // Zero at launch, and deliberately so. The plumbing stays because turning it
  // on must be a decision, not a rewrite. See docs/PAYMENT-MODEL.md.
  const feeBps = account?.applicationFeeBps ?? 0
  const applicationFeeCents =
    feeBps > 0 ? Math.floor((invoice.balanceCents * feeBps) / 10_000) : 0

  const checkout = await stripe().checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: invoice.currency.toLowerCase(),
            unit_amount: invoice.balanceCents,
            product_data: {
              name: `Invoice ${invoice.displayNumber}`,
              description: `${invoice.companyName}`,
            },
          },
          quantity: 1,
        },
      ],
      ...(invoice.customerEmail ? { customer_email: invoice.customerEmail } : {}),
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      payment_intent_data: {
        description: `Invoice ${invoice.displayNumber} — ${invoice.companyName}`,
        ...(applicationFeeCents > 0 ? { application_fee_amount: applicationFeeCents } : {}),
        metadata: {
          invoiceId: invoice.id,
          organizationId: invoice.organizationId,
        },
      },
      metadata: {
        invoiceId: invoice.id,
        organizationId: invoice.organizationId,
      },
    },
    {
      // The charge happens on their account, not ours.
      stripeAccount: invoice.connectedAccountId,
      // A double-click or a retried request reuses the same session rather
      // than creating a second one for the same balance.
      idempotencyKey: `invoice-checkout:${invoice.id}:${invoice.balanceCents}`,
    },
  )

  if (!checkout.url) throw new PaymentError('Could not start the payment. Please try again.')
  return { url: checkout.url }
}

export interface RecordStripePaymentInput {
  organizationId: string
  invoiceId: string
  providerIntentId: string
  providerChargeId: string | null
  providerAccountId: string
  amountCents: number
  feeCents?: number
  cardBrand?: string | null
  cardLast4?: string | null
  receiptEmail?: string | null
  receivedAt?: Date
}

export interface RecordStripePaymentResult {
  paymentId: string
  /** True when this call did nothing because the payment was already recorded. */
  duplicate: boolean
  invoicePaid: boolean
}

/**
 * Write a confirmed card payment against an invoice.
 *
 * Idempotent twice over: the unique index on (providerName, providerIntentId)
 * is the real guard, and the pre-check saves a pointless transaction. A
 * webhook delivered twice — which Stripe does routinely — records one payment,
 * moves the balance once, and does not send a second receipt.
 */
export async function recordStripePayment(
  input: RecordStripePaymentInput,
): Promise<RecordStripePaymentResult> {
  const existing = await prisma.payment.findFirst({
    where: { providerName: 'stripe', providerIntentId: input.providerIntentId },
    select: { id: true, invoiceId: true },
  })
  if (existing) {
    const invoice = existing.invoiceId
      ? await prisma.invoice.findUnique({
          where: { id: existing.invoiceId },
          select: { status: true },
        })
      : null
    return {
      paymentId: existing.id,
      duplicate: true,
      invoicePaid: invoice?.status === 'PAID',
    }
  }

  const receivedAt = input.receivedAt ?? new Date()

  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        select: {
          id: true,
          organizationId: true,
          customerId: true,
          jobId: true,
          totalCents: true,
          paidCents: true,
          dueAt: true,
          status: true,
        },
      })
      if (!invoice) throw new PaymentError('That invoice no longer exists.')
      if (invoice.organizationId !== input.organizationId) {
        // The invoice id came from Stripe metadata; it must still belong to
        // the account the charge was made on.
        throw new PaymentError('That payment does not belong to this invoice.')
      }

      const payment = await tx.payment.create({
        data: {
          organizationId: invoice.organizationId,
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          method: 'CARD',
          status: 'SUCCEEDED',
          amountCents: input.amountCents,
          feeCents: input.feeCents ?? 0,
          receivedAt,
          providerName: 'stripe',
          providerIntentId: input.providerIntentId,
          providerPaymentId: input.providerChargeId,
          providerAccountId: input.providerAccountId,
          cardBrand: input.cardBrand ?? null,
          cardLast4: input.cardLast4 ?? null,
          receiptEmail: input.receiptEmail ?? null,
          reference: input.providerChargeId ?? input.providerIntentId,
        },
      })

      // Recomputed from the row we just read inside this transaction, so two
      // concurrent payments cannot both add to a stale balance.
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
        await recomputeJobCostingTx(tx as Prisma.TransactionClient, invoice.organizationId, invoice.jobId)
      }

      return { paymentId: payment.id, invoicePaid: updated.status === 'PAID' }
    })

    await recordAudit({
      organizationId: input.organizationId,
      actorUserId: null,
      action: 'payment.card_confirmed',
      entityType: 'Payment',
      entityId: result.paymentId,
      after: {
        invoiceId: input.invoiceId,
        amountCents: input.amountCents,
        providerIntentId: input.providerIntentId,
      },
    })

    return { ...result, duplicate: false }
  } catch (error) {
    // Two deliveries arriving at once: one wins the unique index, the other
    // lands here. That is a duplicate, not a failure.
    if (isUniqueViolation(error)) {
      const winner = await prisma.payment.findFirst({
        where: { providerName: 'stripe', providerIntentId: input.providerIntentId },
        select: { id: true, invoice: { select: { status: true } } },
      })
      if (winner) {
        return {
          paymentId: winner.id,
          duplicate: true,
          invoicePaid: winner.invoice?.status === 'PAID',
        }
      }
    }
    throw error
  }
}

/** Pull the fields we record out of a Stripe PaymentIntent. */
export function paymentDetailsFromIntent(intent: Stripe.PaymentIntent) {
  const charge =
    typeof intent.latest_charge === 'object' && intent.latest_charge
      ? (intent.latest_charge as Stripe.Charge)
      : null
  const card = charge?.payment_method_details?.card ?? null

  return {
    providerIntentId: intent.id,
    providerChargeId: charge?.id ?? null,
    amountCents: intent.amount_received || intent.amount,
    // What Stripe took. Shown to the company, never added to what the customer
    // paid.
    feeCents:
      charge?.balance_transaction && typeof charge.balance_transaction === 'object'
        ? charge.balance_transaction.fee
        : 0,
    cardBrand: card?.brand ?? null,
    cardLast4: card?.last4 ?? null,
    receiptEmail: intent.receipt_email ?? charge?.billing_details?.email ?? null,
    invoiceId:
      typeof intent.metadata?.invoiceId === 'string' ? intent.metadata.invoiceId : null,
    organizationId:
      typeof intent.metadata?.organizationId === 'string' ? intent.metadata.organizationId : null,
  }
}

/**
 * Record a refund that happened on the company's own Stripe account.
 *
 * Refunds are issued by the company in their Stripe dashboard — Garage Door HQ
 * has no refund UI yet, deliberately, because moving money back out of
 * somebody's balance deserves its own confirmation design. What this does is
 * keep our books honest when they do it elsewhere.
 *
 * Idempotent: Stripe reports the cumulative `amount_refunded`, so applying the
 * same event twice writes the same number.
 */
export async function applyRefund(params: {
  organizationId: string
  providerChargeId: string
  refundedCents: number
}): Promise<{ paymentId: string } | null> {
  const payment = await prisma.payment.findFirst({
    where: {
      organizationId: params.organizationId,
      providerName: 'stripe',
      providerPaymentId: params.providerChargeId,
    },
    select: { id: true, invoiceId: true, amountCents: true, refundedCents: true },
  })
  if (!payment) return null
  if (payment.refundedCents === params.refundedCents) return { paymentId: payment.id }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        refundedCents: params.refundedCents,
        status:
          params.refundedCents >= payment.amountCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      },
    })

    if (!payment.invoiceId) return

    // Rebuild the invoice from its payments rather than adjusting by a delta,
    // so a refund arriving out of order still lands on the right number.
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: payment.invoiceId },
      select: { id: true, totalCents: true, dueAt: true, jobId: true, organizationId: true },
    })
    const payments = await tx.payment.findMany({
      where: { invoiceId: invoice.id, status: { not: 'FAILED' } },
      select: { amountCents: true, refundedCents: true },
    })
    const paidCents = payments.reduce(
      (sum, row) => sum + row.amountCents - row.refundedCents,
      0,
    )

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        paidCents,
        balanceCents: invoice.totalCents - paidCents,
        status: statusForBalance(invoice.totalCents, paidCents, invoice.dueAt, new Date()),
        paidAt: paidCents >= invoice.totalCents ? new Date() : null,
      },
    })

    if (invoice.jobId) {
      await recomputeJobCostingTx(
        tx as Prisma.TransactionClient,
        invoice.organizationId,
        invoice.jobId,
      )
    }
  })

  await recordAudit({
    organizationId: params.organizationId,
    actorUserId: null,
    action: 'payment.refunded',
    entityType: 'Payment',
    entityId: payment.id,
    before: { refundedCents: payment.refundedCents },
    after: { refundedCents: params.refundedCents },
  })

  return { paymentId: payment.id }
}
