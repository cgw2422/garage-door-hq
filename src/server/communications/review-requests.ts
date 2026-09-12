import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import type { AppSession } from '@/lib/session'
import { sendReviewRequestEmail } from './dispatch'

/**
 * Review requests.
 *
 * Asking a customer for a review is the easiest thing in this product to get
 * embarrassingly wrong: ask twice, ask before the job is finished, ask someone
 * whose invoice is still unpaid, or ask after the company switched the feature
 * off. Each of those is guarded here rather than at the call site.
 *
 * A request row is created once per job by job completion, and this module
 * decides when — and whether — it actually goes out.
 */

export class ReviewRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReviewRequestError'
  }
}

/** After this many failed attempts, stop retrying and leave it for a person. */
const MAX_ATTEMPTS = 3

export interface ReviewSendResult {
  sent: boolean
  reason?: string
}

/**
 * Whether a queued request is ready to go.
 *
 * The job must be complete, and if it produced an invoice that invoice must be
 * settled — nobody wants to be asked for five stars while they still owe money.
 */
async function readiness(reviewRequestId: string): Promise<
  | { ready: true; organizationId: string }
  | { ready: false; reason: string; terminal: boolean }
> {
  const request = await prisma.reviewRequest.findUnique({
    where: { id: reviewRequestId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      sentAt: true,
      scheduledFor: true,
      attemptCount: true,
      reviewUrl: true,
      customer: { select: { email: true } },
      job: { select: { status: true } },
      organization: { select: { reviewRequestEnabled: true } },
    },
  })

  if (!request) return { ready: false, reason: 'That review request no longer exists.', terminal: true }
  if (request.sentAt || request.status === 'SENT' || request.status === 'DELIVERED') {
    return { ready: false, reason: 'This customer has already been asked.', terminal: true }
  }
  if (!request.organization.reviewRequestEnabled) {
    return { ready: false, reason: 'Review requests are switched off for this company.', terminal: true }
  }
  if (!request.customer.email) {
    return { ready: false, reason: 'This customer has no email address.', terminal: true }
  }
  if (!request.reviewUrl) {
    return { ready: false, reason: 'No review link is configured.', terminal: true }
  }
  if (request.job && request.job.status !== 'COMPLETED') {
    return { ready: false, reason: 'That job is not finished yet.', terminal: false }
  }
  if (request.attemptCount >= MAX_ATTEMPTS) {
    return {
      ready: false,
      reason: 'This has failed several times. Send it by hand or check the address.',
      terminal: true,
    }
  }

  // An unpaid invoice is the one blocker worth waiting on rather than failing.
  const outstanding = await prisma.invoice.count({
    where: {
      organizationId: request.organizationId,
      job: { reviewRequests: { some: { id: request.id } } },
      status: { notIn: ['PAID', 'VOID'] },
      balanceCents: { gt: 0 },
    },
  })
  if (outstanding > 0) {
    return { ready: false, reason: 'The invoice for this job is still outstanding.', terminal: false }
  }

  return { ready: true, organizationId: request.organizationId }
}

/**
 * Send one request.
 *
 * `force` skips the timing delay for a manual send from the job screen; it
 * does not skip the guards that stop a duplicate or an unfinished job.
 */
export async function sendReviewRequest(
  reviewRequestId: string,
  options?: { force?: boolean; now?: Date },
): Promise<ReviewSendResult> {
  const now = options?.now ?? new Date()

  const check = await readiness(reviewRequestId)
  if (!check.ready) return { sent: false, reason: check.reason }

  const request = await prisma.reviewRequest.findUniqueOrThrow({
    where: { id: reviewRequestId },
    select: { scheduledFor: true, organizationId: true },
  })

  if (!options?.force && request.scheduledFor && request.scheduledFor.getTime() > now.getTime()) {
    return { sent: false, reason: 'Not due yet.' }
  }

  await prisma.reviewRequest.update({
    where: { id: reviewRequestId },
    data: { attemptCount: { increment: 1 } },
  })

  const delivery = await sendReviewRequestEmail({
    organizationId: check.organizationId,
    reviewRequestId,
  })

  if (!delivery.ok) {
    await prisma.reviewRequest.update({
      where: { id: reviewRequestId },
      data: { status: 'FAILED', failedAt: now, errorMessage: delivery.error ?? null },
    })
    return { sent: false, reason: delivery.error ?? 'The message could not be sent.' }
  }

  await prisma.reviewRequest.update({
    where: { id: reviewRequestId },
    data: { status: 'SENT', sentAt: now, errorMessage: null, failedAt: null },
  })

  await recordAudit({
    organizationId: check.organizationId,
    actorUserId: null,
    action: 'review.request_sent',
    entityType: 'ReviewRequest',
    entityId: reviewRequestId,
  })

  return { sent: true }
}

/**
 * Send everything that has come due.
 *
 * Called opportunistically rather than by a scheduler, because this product
 * has no worker process yet and adding one for a handful of emails a day is
 * not worth the operational surface. When a background runner does arrive,
 * this is the function it calls.
 */
export async function sendDueReviewRequests(options?: { now?: Date; limit?: number }) {
  const now = options?.now ?? new Date()

  const due = await prisma.reviewRequest.findMany({
    where: {
      status: { in: ['QUEUED', 'FAILED'] },
      sentAt: null,
      attemptCount: { lt: MAX_ATTEMPTS },
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
    },
    orderBy: { createdAt: 'asc' },
    take: options?.limit ?? 25,
    select: { id: true },
  })

  let sent = 0
  for (const row of due) {
    const result = await sendReviewRequest(row.id, { now })
    if (result.sent) sent += 1
  }
  return { considered: due.length, sent }
}

/**
 * Send now, from the job screen.
 *
 * Creates the request row when job completion did not — a technician who
 * forgot to tick the box, or a company that turned reviews on afterwards.
 */
export async function sendReviewRequestForJob(
  session: AppSession,
  jobId: string,
): Promise<ReviewSendResult> {
  const job = await session.db.job.findUnique({
    where: { id: jobId },
    select: { id: true, customerId: true, status: true },
  })
  if (!job) throw new ReviewRequestError('That job no longer exists.')
  if (job.status !== 'COMPLETED') {
    throw new ReviewRequestError('Finish the job before asking for a review.')
  }

  const organization = await session.db.organization.findUniqueOrThrow({
    where: { id: session.organizationId },
    select: { reviewRequestEnabled: true },
  })
  if (!organization.reviewRequestEnabled) {
    throw new ReviewRequestError(
      'Review requests are switched off. Turn them on in Settings to send one.',
    )
  }

  const existing = await session.db.reviewRequest.findFirst({ where: { jobId } })

  if (existing) {
    return sendReviewRequest(existing.id, { force: true })
  }

  const destination = await session.db.reviewDestination.findFirst({
    where: { isActive: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  })
  if (!destination) {
    throw new ReviewRequestError(
      'No review link is set up yet. Add your Google review link in Settings.',
    )
  }

  const created = await session.db.reviewRequest.create({
    data: {
      organizationId: session.organizationId,
      customerId: job.customerId,
      jobId: job.id,
      destinationId: destination.id,
      // Snapshot: editing the setting later cannot rewrite what was sent.
      reviewUrl: destination.url,
      status: 'QUEUED',
    },
  })

  return sendReviewRequest(created.id, { force: true })
}

/**
 * Roughly one page load in twenty-five nudges the queue.
 *
 * The same pattern as the storage sweep, and for the same reason: this
 * deployment has no worker process, and standing one up for a handful of
 * emails a day is more operational surface than it is worth. It is harmless
 * where a scheduler does exist, because `sendReviewRequest` is idempotent.
 */
export function maybeSendDueReviewRequests() {
  if (Math.random() > 0.04) return
  void sendDueReviewRequests().catch((error) =>
    console.warn('[reviews] background send failed', error),
  )
}

/** What the job screen needs to show the review panel honestly. */
export async function loadReviewContext(session: AppSession, jobId: string) {
  const [request, destination, organization] = await Promise.all([
    session.db.reviewRequest.findFirst({
      where: { jobId },
      select: { id: true, status: true, sentAt: true, errorMessage: true },
    }),
    session.db.reviewDestination.findFirst({ where: { isActive: true }, select: { id: true } }),
    session.db.organization.findUniqueOrThrow({
      where: { id: session.organizationId },
      select: { reviewRequestEnabled: true },
    }),
  ])

  return {
    request,
    destinationConfigured: Boolean(destination),
    enabled: organization.reviewRequestEnabled,
  }
}
