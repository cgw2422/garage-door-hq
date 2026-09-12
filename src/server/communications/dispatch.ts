import type { MessageType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { formatDate } from '@/server/jobs/queries'
import { formatEstimateNumber, formatInvoiceNumber } from '@/lib/numbering'
import { platformBranding } from '@/server/email/branding'
import { BRANDING_SELECT, brandingForOrganization, sendEmail, type SendOutcome } from '@/server/email/send'
import {
  estimateLinkMessage,
  invoiceLinkMessage,
  paymentReceiptMessage,
  reviewRequestMessage,
  teamInvitationMessage,
} from '@/server/email/templates/messages'
import { ROLE_LABELS } from '@/lib/roles'

/**
 * Business events, turned into branded email.
 *
 * This is the layer that knows a customer document needs the company's name on
 * it and a technician invitation needs the inviter's. It reads what it needs,
 * picks a template and hands the result to the send service — which owns the
 * delivery states. Nothing here decides that a message was delivered.
 *
 * Every function returns an outcome rather than throwing, because the thing
 * being announced has already happened. An estimate that could not be emailed
 * is still an estimate.
 */

export interface DispatchResult {
  ok: boolean
  error?: string | null
  retryable?: boolean
  deduplicated?: boolean
  logId: string | null
}

function toResult(outcome: SendOutcome): DispatchResult {
  return {
    ok: outcome.ok,
    error: outcome.error ?? null,
    retryable: outcome.retryable,
    deduplicated: outcome.deduplicated,
    logId: outcome.log.id,
  }
}

function noRecipient(reason: string): DispatchResult {
  return { ok: false, error: reason, retryable: false, logId: null }
}

/**
 * Send a customer a link to an estimate.
 *
 * The portal link is issued by the caller — this does not mint one, because
 * issuing a link revokes the previous one and that should be a deliberate act,
 * not a side effect of pressing Send.
 */
export async function sendEstimateEmail(params: {
  organizationId: string
  estimateId: string
  portalUrl: string
  /** Overrides the customer's stored address for this send only. */
  toAddress?: string | null
  /** Distinguishes a resend from a retry of the same send. */
  attemptKey?: string
}): Promise<DispatchResult> {
  const estimate = await prisma.estimate.findFirst({
    where: { id: params.estimateId, organizationId: params.organizationId },
    select: {
      id: true,
      number: true,
      displayNumber: true,
      expiresAt: true,
      jobId: true,
      customerId: true,
      customer: { select: { id: true, firstName: true, email: true } },
      options: {
        where: { isRecommended: true },
        select: { totalCents: true },
        take: 1,
      },
      organization: { select: { ...BRANDING_SELECT, currency: true, timezone: true } },
    },
  })
  if (!estimate) return noRecipient('That estimate no longer exists.')

  const to = (params.toAddress ?? estimate.customer.email)?.trim()
  if (!to) {
    return noRecipient('This customer has no email address. Add one, or copy the link instead.')
  }

  const branding = brandingForOrganization(estimate.organization)
  const recommended = estimate.options[0]

  const message = estimateLinkMessage(branding, {
    customerFirstName: estimate.customer.firstName,
    estimateNumber: formatEstimateNumber(estimate),
    totalLabel: recommended
      ? formatCents(recommended.totalCents, { currency: estimate.organization.currency })
      : null,
    url: params.portalUrl,
    expiresLabel: estimate.expiresAt
      ? `on ${formatDate(estimate.expiresAt, estimate.organization.timezone)}`
      : null,
  })

  const outcome = await sendEmail({
    organizationId: params.organizationId,
    messageType: 'ESTIMATE_LINK',
    to: { email: to, name: estimate.customer.firstName },
    branding,
    message,
    // Keyed on the link, so re-sending after issuing a new link is a new
    // message, while retrying the same send reuses its row.
    idempotencyKey: `estimate:${estimate.id}:${hashPart(params.portalUrl)}${
      params.attemptKey ? `:${params.attemptKey}` : ''
    }`,
    customerId: estimate.customerId,
    estimateId: estimate.id,
    jobId: estimate.jobId,
  })

  return toResult(outcome)
}

export async function sendInvoiceEmail(params: {
  organizationId: string
  invoiceId: string
  portalUrl: string
  toAddress?: string | null
  attemptKey?: string
}): Promise<DispatchResult> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, organizationId: params.organizationId },
    select: {
      id: true,
      number: true,
      displayNumber: true,
      balanceCents: true,
      dueAt: true,
      jobId: true,
      customerId: true,
      customer: { select: { firstName: true, email: true } },
      organization: {
        select: {
          ...BRANDING_SELECT,
          currency: true,
          timezone: true,
          paymentAccount: { select: { chargesEnabled: true, disconnectedAt: true } },
        },
      },
    },
  })
  if (!invoice) return noRecipient('That invoice no longer exists.')

  const to = (params.toAddress ?? invoice.customer.email)?.trim()
  if (!to) {
    return noRecipient('This customer has no email address. Add one, or copy the link instead.')
  }

  const branding = brandingForOrganization(invoice.organization)
  const account = invoice.organization.paymentAccount
  const payable =
    Boolean(account?.chargesEnabled && !account.disconnectedAt) && invoice.balanceCents > 0

  const message = invoiceLinkMessage(branding, {
    customerFirstName: invoice.customer.firstName,
    invoiceNumber: formatInvoiceNumber(invoice),
    balanceLabel: formatCents(invoice.balanceCents, { currency: invoice.organization.currency }),
    dueLabel: invoice.dueAt ? formatDate(invoice.dueAt, invoice.organization.timezone) : null,
    url: params.portalUrl,
    payable,
  })

  const outcome = await sendEmail({
    organizationId: params.organizationId,
    messageType: 'INVOICE_LINK',
    to: { email: to, name: invoice.customer.firstName },
    branding,
    message,
    idempotencyKey: `invoice:${invoice.id}:${hashPart(params.portalUrl)}${
      params.attemptKey ? `:${params.attemptKey}` : ''
    }`,
    customerId: invoice.customerId,
    invoiceId: invoice.id,
    jobId: invoice.jobId,
  })

  return toResult(outcome)
}

/**
 * A receipt for a card payment.
 *
 * Sent from the webhook that recorded the payment, and only on the delivery
 * that actually recorded it — a replay records nothing and sends nothing.
 */
export async function sendPaymentReceipt(params: {
  organizationId: string
  paymentId: string
}): Promise<DispatchResult> {
  const payment = await prisma.payment.findFirst({
    where: { id: params.paymentId, organizationId: params.organizationId },
    select: {
      id: true,
      amountCents: true,
      method: true,
      receivedAt: true,
      receiptEmail: true,
      cardBrand: true,
      cardLast4: true,
      customerId: true,
      customer: { select: { firstName: true, email: true } },
      invoice: {
        select: { id: true, number: true, displayNumber: true, balanceCents: true, jobId: true },
      },
      organization: { select: { ...BRANDING_SELECT, currency: true, timezone: true } },
    },
  })
  if (!payment) return noRecipient('That payment no longer exists.')

  const to = (payment.receiptEmail ?? payment.customer.email)?.trim()
  if (!to) return noRecipient('This customer has no email address for a receipt.')

  const branding = brandingForOrganization(payment.organization)
  const platform = platformBranding()

  const methodLabel = payment.cardLast4
    ? `${titleCase(payment.cardBrand ?? 'Card')} ending ${payment.cardLast4}`
    : titleCase(payment.method)

  const message = paymentReceiptMessage(branding, {
    customerFirstName: payment.customer.firstName,
    invoiceNumber: payment.invoice ? formatInvoiceNumber(payment.invoice) : 'Payment',
    amountLabel: formatCents(payment.amountCents, { currency: payment.organization.currency }),
    methodLabel,
    paidOnLabel: formatDate(payment.receivedAt, payment.organization.timezone),
    balanceLabel: formatCents(payment.invoice?.balanceCents ?? 0, {
      currency: payment.organization.currency,
    }),
    url: null,
  })
  void platform

  const outcome = await sendEmail({
    organizationId: params.organizationId,
    messageType: 'PAYMENT_RECEIPT',
    to: { email: to, name: payment.customer.firstName },
    branding,
    message,
    // One receipt per payment, forever.
    idempotencyKey: `receipt:${payment.id}`,
    customerId: payment.customerId,
    invoiceId: payment.invoice?.id ?? null,
    jobId: payment.invoice?.jobId ?? null,
    paymentId: payment.id,
  })

  return toResult(outcome)
}

/** The invitation email. The token is minted by the team service, not here. */
export async function sendInvitationEmail(params: {
  organizationId: string
  invitationId: string
  inviteUrl: string
  attemptKey?: string
}): Promise<DispatchResult> {
  const invitation = await prisma.invitation.findFirst({
    where: { id: params.invitationId, organizationId: params.organizationId },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      invitedBy: { select: { firstName: true, lastName: true } },
      organization: { select: { ...BRANDING_SELECT, timezone: true } },
    },
  })
  if (!invitation) return noRecipient('That invitation no longer exists.')

  const branding = brandingForOrganization(invitation.organization)
  const inviter = invitation.invitedBy
    ? `${invitation.invitedBy.firstName} ${invitation.invitedBy.lastName}`.trim()
    : null

  const message = teamInvitationMessage(branding, {
    inviterName: inviter,
    roleLabel: ROLE_LABELS[invitation.role] ?? invitation.role,
    url: params.inviteUrl,
    expiresLabel: `on ${formatDate(invitation.expiresAt, invitation.organization.timezone)}`,
  })

  const outcome = await sendEmail({
    organizationId: params.organizationId,
    messageType: 'TEAM_INVITATION',
    to: { email: invitation.email },
    branding,
    message,
    // Keyed on the link: re-sending mints a new token, so it is a new message.
    idempotencyKey: `invitation:${invitation.id}:${hashPart(params.inviteUrl)}`,
    invitationId: invitation.id,
  })

  return toResult(outcome)
}

/** The review request. Wording is the company's when they have set some. */
export async function sendReviewRequestEmail(params: {
  organizationId: string
  reviewRequestId: string
}): Promise<DispatchResult> {
  const request = await prisma.reviewRequest.findFirst({
    where: { id: params.reviewRequestId, organizationId: params.organizationId },
    select: {
      id: true,
      reviewUrl: true,
      jobId: true,
      customerId: true,
      customer: { select: { firstName: true, email: true } },
      organization: {
        select: { ...BRANDING_SELECT, reviewRequestSubject: true, reviewRequestBody: true },
      },
    },
  })
  if (!request) return noRecipient('That review request no longer exists.')

  const to = request.customer.email?.trim()
  if (!to) return noRecipient('This customer has no email address.')

  const branding = brandingForOrganization(request.organization)
  const message = reviewRequestMessage(branding, {
    customerFirstName: request.customer.firstName,
    url: request.reviewUrl,
    customSubject: request.organization.reviewRequestSubject,
    customBody: request.organization.reviewRequestBody,
  })

  const outcome = await sendEmail({
    organizationId: params.organizationId,
    messageType: 'REVIEW_REQUEST',
    to: { email: to, name: request.customer.firstName },
    branding,
    message,
    // One per request row, and one request row per job, so a customer is never
    // asked twice for the same job.
    idempotencyKey: `review:${request.id}`,
    customerId: request.customerId,
    jobId: request.jobId,
  })

  return toResult(outcome)
}

/** A short, stable suffix so an idempotency key stays a sensible length. */
function hashPart(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

export const CUSTOMER_MESSAGE_TYPES: MessageType[] = [
  'ESTIMATE_LINK',
  'INVOICE_LINK',
  'PAYMENT_RECEIPT',
  'REVIEW_REQUEST',
  'APPOINTMENT_CONFIRMATION',
  'APPOINTMENT_REMINDER',
]
