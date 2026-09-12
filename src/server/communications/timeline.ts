import type { CommunicationStatus, MessageType } from '@prisma/client'
import type { AppSession } from '@/lib/session'
import { formatCents } from '@/lib/money'
import { formatEstimateNumber, formatInvoiceNumber } from '@/lib/numbering'

/**
 * One customer's history, as a person would tell it.
 *
 * The distinction this file exists to keep is between events that are easy to
 * blur together and mean very different things:
 *
 *   Generated  we made the document
 *   Sent       a provider accepted the message
 *   Delivered  a provider said it reached the mailbox
 *   Viewed     the customer actually opened the link
 *   Signed     they approved it
 *   Paid       the money arrived
 *
 * "Sent" is not "delivered" and neither is "viewed". A company chasing a
 * customer needs to know which of those is true, because the next thing they
 * do about it is different in each case.
 */

export type TimelineKind =
  | 'generated'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'viewed'
  | 'signed'
  | 'paid'
  | 'completed'

export interface TimelineEntry {
  id: string
  at: Date
  kind: TimelineKind
  /** "Estimate sent by Mike" */
  title: string
  detail: string | null
  href: string | null
}

const SENT_LABEL: Partial<Record<MessageType, string>> = {
  ESTIMATE_LINK: 'Estimate sent',
  INVOICE_LINK: 'Invoice sent',
  PAYMENT_RECEIPT: 'Receipt sent',
  REVIEW_REQUEST: 'Review request sent',
  APPOINTMENT_CONFIRMATION: 'Appointment confirmation sent',
  APPOINTMENT_REMINDER: 'Appointment reminder sent',
  TEAM_INVITATION: 'Invitation sent',
  PASSWORD_RESET: 'Password reset sent',
  GENERAL: 'Message sent',
}

const DELIVERED_LABEL: Partial<Record<MessageType, string>> = {
  ESTIMATE_LINK: 'Estimate delivered',
  INVOICE_LINK: 'Invoice delivered',
  PAYMENT_RECEIPT: 'Receipt delivered',
  REVIEW_REQUEST: 'Review request delivered',
}

function kindForStatus(status: CommunicationStatus): TimelineKind | null {
  switch (status) {
    case 'SENT':
      return 'sent'
    case 'DELIVERED':
      return 'delivered'
    case 'FAILED':
    case 'BOUNCED':
      return 'failed'
    default:
      // QUEUED and SENDING are in-flight; there is nothing to tell anybody yet.
      return null
  }
}

/**
 * Build the timeline.
 *
 * Everything is read through the tenant client, so another company's history
 * is not reachable even with a guessed customer id.
 */
export async function loadCustomerTimeline(
  session: AppSession,
  customerId: string,
  options?: { limit?: number },
): Promise<TimelineEntry[]> {
  const limit = options?.limit ?? 40

  const [messages, estimates, invoices, payments, jobs] = await Promise.all([
    session.db.communicationLog.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        messageType: true,
        status: true,
        subject: true,
        toAddress: true,
        sentAt: true,
        deliveredAt: true,
        failedAt: true,
        errorMessage: true,
        createdAt: true,
        estimateId: true,
        invoiceId: true,
      },
    }),
    session.db.estimate.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        number: true,
        displayNumber: true,
        createdAt: true,
        sentAt: true,
        acceptedAt: true,
        declinedAt: true,
        signatures: {
          where: { kind: 'ESTIMATE_APPROVAL' },
          orderBy: { signedAt: 'desc' },
          take: 1,
          select: { signerName: true, signedAt: true },
        },
      },
    }),
    session.db.invoice.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        number: true,
        displayNumber: true,
        createdAt: true,
        issuedAt: true,
        totalCents: true,
      },
    }),
    session.db.payment.findMany({
      where: { customerId },
      orderBy: { receivedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        amountCents: true,
        method: true,
        receivedAt: true,
        cardBrand: true,
        cardLast4: true,
        invoiceId: true,
        invoice: { select: { number: true, displayNumber: true } },
      },
    }),
    session.db.job.findMany({
      where: { customerId, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      take: limit,
      select: { id: true, number: true, displayNumber: true, completedAt: true },
    }),
  ])

  // Portal views are counted on the link, not per visit, so the timeline shows
  // the first time a document was opened rather than inventing a visit log.
  const links = await session.db.portalLink.findMany({
    where: {
      lastViewedAt: { not: null },
      OR: [
        { estimateId: { in: estimates.map((e) => e.id) } },
        { invoiceId: { in: invoices.map((i) => i.id) } },
      ],
    },
    select: {
      id: true,
      target: true,
      estimateId: true,
      invoiceId: true,
      lastViewedAt: true,
      viewCount: true,
    },
  })

  const entries: TimelineEntry[] = []
  const currency = session.currency

  for (const message of messages) {
    const kind = kindForStatus(message.status)
    if (!kind) continue

    const at =
      kind === 'delivered'
        ? (message.deliveredAt ?? message.sentAt ?? message.createdAt)
        : kind === 'failed'
          ? (message.failedAt ?? message.createdAt)
          : (message.sentAt ?? message.createdAt)

    const title =
      kind === 'delivered'
        ? (DELIVERED_LABEL[message.messageType] ?? 'Message delivered')
        : kind === 'failed'
          ? `${(SENT_LABEL[message.messageType] ?? 'Message sent').replace(' sent', '')} could not be sent`
          : (SENT_LABEL[message.messageType] ?? 'Message sent')

    entries.push({
      id: `msg-${message.id}-${kind}`,
      at,
      kind,
      title,
      detail:
        kind === 'failed'
          ? (message.errorMessage ?? 'Delivery failed.')
          : (message.toAddress ?? null),
      href: message.estimateId
        ? `/estimates/${message.estimateId}`
        : message.invoiceId
          ? `/invoices/${message.invoiceId}`
          : null,
    })
  }

  for (const estimate of estimates) {
    entries.push({
      id: `est-${estimate.id}-generated`,
      at: estimate.createdAt,
      kind: 'generated',
      title: `${formatEstimateNumber(estimate)} created`,
      detail: null,
      href: `/estimates/${estimate.id}`,
    })

    const signature = estimate.signatures[0]
    if (signature) {
      entries.push({
        id: `est-${estimate.id}-signed`,
        at: signature.signedAt,
        kind: 'signed',
        title: `${formatEstimateNumber(estimate)} signed`,
        detail: `by ${signature.signerName}`,
        href: `/estimates/${estimate.id}`,
      })
    } else if (estimate.declinedAt) {
      entries.push({
        id: `est-${estimate.id}-declined`,
        at: estimate.declinedAt,
        kind: 'failed',
        title: `${formatEstimateNumber(estimate)} declined`,
        detail: null,
        href: `/estimates/${estimate.id}`,
      })
    }
  }

  for (const invoice of invoices) {
    entries.push({
      id: `inv-${invoice.id}-generated`,
      at: invoice.issuedAt ?? invoice.createdAt,
      kind: 'generated',
      title: `${formatInvoiceNumber(invoice)} created`,
      detail: formatCents(invoice.totalCents, { currency }),
      href: `/invoices/${invoice.id}`,
    })
  }

  for (const link of links) {
    if (!link.lastViewedAt) continue
    const isEstimate = link.target === 'ESTIMATE'
    const document = isEstimate
      ? estimates.find((e) => e.id === link.estimateId)
      : invoices.find((i) => i.id === link.invoiceId)
    if (!document) continue

    entries.push({
      id: `view-${link.id}`,
      at: link.lastViewedAt,
      kind: 'viewed',
      title: `${
        isEstimate
          ? formatEstimateNumber(document as { number: number; displayNumber: string | null })
          : formatInvoiceNumber(document as { number: number; displayNumber: string | null })
      } opened by the customer`,
      detail:
        link.viewCount > 1
          ? `${link.viewCount} times · most recent shown`
          : null,
      href: isEstimate ? `/estimates/${link.estimateId}` : `/invoices/${link.invoiceId}`,
    })
  }

  for (const payment of payments) {
    entries.push({
      id: `pay-${payment.id}`,
      at: payment.receivedAt,
      kind: 'paid',
      title: `${formatCents(payment.amountCents, { currency })} paid`,
      detail: payment.cardLast4
        ? `${titleCase(payment.cardBrand ?? 'Card')} ending ${payment.cardLast4}${
            payment.invoice ? ` · ${formatInvoiceNumber(payment.invoice)}` : ''
          }`
        : `${titleCase(payment.method)}${
            payment.invoice ? ` · ${formatInvoiceNumber(payment.invoice)}` : ''
          }`,
      href: payment.invoiceId ? `/invoices/${payment.invoiceId}` : null,
    })
  }

  for (const job of jobs) {
    if (!job.completedAt) continue
    entries.push({
      id: `job-${job.id}`,
      at: job.completedAt,
      kind: 'completed',
      title: `Job ${job.displayNumber ?? job.number} completed`,
      detail: null,
      href: `/jobs/${job.id}`,
    })
  }

  entries.sort((a, b) => b.at.getTime() - a.at.getTime())
  return entries.slice(0, limit)
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}
