import type { CommunicationLog, MessageType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { email } from './index'
import { platformBranding, type SenderBranding } from './branding'
import type { RenderedMessage } from './templates/messages'

/**
 * Sending, and the bookkeeping that goes with it.
 *
 * The rule this file exists to enforce: **a message is not "sent" because we
 * called an API.** A row is written first, moved to SENDING, and only moved to
 * SENT when a provider hands back an id. It reaches DELIVERED only if a
 * provider webhook says so, which is why nothing in this file can set it.
 *
 * The lifecycle:
 *
 *   QUEUED ──► SENDING ──► SENT ──► DELIVERED   (webhook)
 *                 │                └─► BOUNCED  (webhook)
 *                 └────────► FAILED ──► (retry restarts at SENDING)
 *
 * A failure never rolls back the thing being announced. An estimate that
 * exists but could not be emailed is an estimate that exists; the company sees
 * the failure and can retry or copy the link.
 */

export interface SendRequest {
  organizationId: string
  messageType: MessageType
  to: { email: string; name?: string | null }
  /** Whose branding the message wears. Omitted for platform messages. */
  branding: SenderBranding | null
  message: RenderedMessage
  /**
   * Makes a send repeatable. The same key finds the same row, so a double
   * click, a retried action or a replayed webhook cannot produce two emails.
   */
  idempotencyKey: string
  customerId?: string | null
  userId?: string | null
  jobId?: string | null
  estimateId?: string | null
  invoiceId?: string | null
  invitationId?: string | null
  paymentId?: string | null
}

export interface SendOutcome {
  ok: boolean
  log: CommunicationLog
  /** Safe to show a company user. */
  error?: string | null
  retryable?: boolean
  /** True when the message was already sent and this call did nothing. */
  deduplicated?: boolean
}

/** States that mean "this has already gone out; do not send it again". */
const TERMINAL_SUCCESS = new Set(['SENT', 'DELIVERED'])

/**
 * Send one message, recording every step.
 *
 * Never throws for a delivery problem — the caller gets an outcome to show.
 * It does throw for a programming error, because that is a bug, not a bounce.
 */
export async function sendEmail(request: SendRequest): Promise<SendOutcome> {
  const driver = email()
  const platform = platformBranding()

  const sender = request.branding
    ? {
        from: { email: platform.fromEmail, name: request.branding.companyName },
        replyTo: request.branding.replyToEmail
          ? { email: request.branding.replyToEmail, name: request.branding.companyName }
          : null,
      }
    : {
        from: { email: platform.fromEmail, name: platform.fromName },
        replyTo: platform.supportEmail
          ? { email: platform.supportEmail, name: platform.fromName }
          : null,
      }

  // One row per logical message. A retry finds the row it already has.
  const existing = await prisma.communicationLog.findUnique({
    where: { idempotencyKey: request.idempotencyKey },
  })

  if (existing && TERMINAL_SUCCESS.has(existing.status)) {
    return { ok: true, log: existing, deduplicated: true }
  }

  const log =
    existing ??
    (await prisma.communicationLog.create({
      data: {
        organizationId: request.organizationId,
        customerId: request.customerId ?? null,
        userId: request.userId ?? null,
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        status: 'QUEUED',
        messageType: request.messageType,
        subject: request.message.subject,
        body: request.message.text,
        toAddress: request.to.email,
        providerName: driver.name,
        idempotencyKey: request.idempotencyKey,
        jobId: request.jobId ?? null,
        estimateId: request.estimateId ?? null,
        invoiceId: request.invoiceId ?? null,
        invitationId: request.invitationId ?? null,
        paymentId: request.paymentId ?? null,
      },
    }))

  const attempting = await prisma.communicationLog.update({
    where: { id: log.id },
    data: {
      status: 'SENDING',
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date(),
      providerName: driver.name,
      errorMessage: null,
      failedAt: null,
    },
  })

  const result = await driver.send({
    to: request.to,
    from: sender.from,
    replyTo: sender.replyTo,
    subject: request.message.subject,
    html: request.message.html,
    text: request.message.text,
    idempotencyKey: request.idempotencyKey,
    tags: {
      messageType: request.messageType,
      organizationId: request.organizationId,
      logId: attempting.id,
    },
  })

  if (!result.accepted) {
    const failed = await prisma.communicationLog.update({
      where: { id: log.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorMessage: result.error ?? 'The message could not be sent.',
      },
    })
    return {
      ok: false,
      log: failed,
      error: result.error ?? 'The message could not be sent.',
      retryable: result.retryable ?? true,
    }
  }

  // SENT, not DELIVERED: the provider has taken it, nothing more.
  const sent = await prisma.communicationLog.update({
    where: { id: log.id },
    data: {
      status: 'SENT',
      sentAt: new Date(),
      providerMessageId: result.providerMessageId,
      errorMessage: null,
    },
  })

  return { ok: true, log: sent }
}

/**
 * Move a message forward from a provider's delivery webhook.
 *
 * Full webhook routes are deferred, but the state machine they need is here
 * and tested, so wiring one up is a route handler and nothing else. Events are
 * matched on the provider's own message id.
 */
export async function applyDeliveryEvent(params: {
  providerName: string
  providerMessageId: string
  event: 'delivered' | 'bounced' | 'failed'
  at?: Date
  detail?: string | null
}): Promise<CommunicationLog | null> {
  const at = params.at ?? new Date()
  const log = await prisma.communicationLog.findFirst({
    where: {
      providerName: params.providerName,
      providerMessageId: params.providerMessageId,
    },
  })
  if (!log) return null

  // Delivery events can arrive out of order and more than once. A message that
  // already bounced does not become delivered because a stale event turned up.
  if (log.status === 'BOUNCED' && params.event === 'delivered') return log
  if (log.deliveredAt && params.event === 'delivered') return log

  const data: Prisma.CommunicationLogUpdateInput =
    params.event === 'delivered'
      ? { status: 'DELIVERED', deliveredAt: at }
      : {
          status: params.event === 'bounced' ? 'BOUNCED' : 'FAILED',
          failedAt: at,
          errorMessage: params.detail ?? null,
        }

  return prisma.communicationLog.update({ where: { id: log.id }, data })
}

/** Build the branding block for a company from its own record. */
export function brandingForOrganization(organization: {
  name: string
  email: string | null
  phone: string | null
  website: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  logoStorageKey: string | null
  logoUrl: string | null
}): SenderBranding {
  const cityLine = [organization.city, organization.state].filter(Boolean).join(', ')
  const addressLines = [
    organization.addressLine1,
    organization.addressLine2,
    [cityLine, organization.postalCode].filter(Boolean).join(' ').trim() || null,
  ].filter((line): line is string => Boolean(line && line.trim()))

  return {
    companyName: organization.name,
    replyToEmail: organization.email,
    companyPhone: organization.phone,
    companyWebsite: organization.website,
    // An email client fetches this over plain HTTP with no session, so it must
    // be a route that does not require one. `logoUrl` is an image the company
    // hosts themselves; the stored key is served by the public logo route.
    logoUrl: organization.logoUrl ?? null,
    addressLines,
  }
}

/** The organization fields every branded message needs. */
export const BRANDING_SELECT = {
  name: true,
  email: true,
  phone: true,
  website: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  logoStorageKey: true,
  logoUrl: true,
} as const
