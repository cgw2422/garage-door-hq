import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import { resetEmail, setEmailDriver } from '@/server/email'
import {
  ReviewRequestError,
  sendDueReviewRequests,
  sendReviewRequest,
  sendReviewRequestForJob,
} from '@/server/communications/review-requests'
import { createTestCompany, createTestDoor, uniqueNumber } from './helpers'
import type { EmailDriver, OutboundEmail } from '@/server/email/types'

/**
 * Review requests.
 *
 * The easiest thing in this product to get embarrassingly wrong: asking twice,
 * asking before the job is finished, or asking somebody who still owes money.
 * Each of those has a test.
 */

let sent: OutboundEmail[] = []
let failNext = false

beforeEach(() => {
  sent = []
  failNext = false
  const driver: EmailDriver = {
    name: 'test',
    configured: true,
    async send(message) {
      if (failNext) {
        return { accepted: false, providerMessageId: null, error: 'Temporarily unavailable.', retryable: true }
      }
      sent.push(message)
      return { accepted: true, providerMessageId: `rev_${sent.length}_${randomUUID()}` }
    },
  }
  setEmailDriver(driver)
})

afterEach(() => {
  resetEmail()
})

async function completedJobWithEmail(session: AppSession, options?: { email?: string | null }) {
  const { customer, property } = await createTestDoor(session)
  await prisma.customer.update({
    where: { id: customer.id },
    data: { email: options?.email === undefined ? 'rachel@test.invalid' : options.email },
  })

  return prisma.job.create({
    data: {
      organizationId: session.organizationId,
      number: uniqueNumber(),
      displayNumber: `J-${uniqueNumber()}`,
      customerId: customer.id,
      propertyId: property.id,
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  })
}

async function reviewDestination(session: AppSession) {
  return prisma.reviewDestination.create({
    data: {
      organizationId: session.organizationId,
      provider: 'GOOGLE',
      url: 'https://g.page/r/example/review',
      isPrimary: true,
      isActive: true,
    },
  })
}

describe('sending one', () => {
  it('sends, and uses the company’s own review link', async () => {
    const { session } = await createTestCompany()
    await reviewDestination(session)
    const job = await completedJobWithEmail(session)

    const result = await sendReviewRequestForJob(session, job.id)
    expect(result.sent).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.text).toContain('https://g.page/r/example/review')
  })

  it('records the send on the request row and in the communication log', async () => {
    const { session } = await createTestCompany()
    await reviewDestination(session)
    const job = await completedJobWithEmail(session)

    await sendReviewRequestForJob(session, job.id)

    const request = await prisma.reviewRequest.findFirstOrThrow({ where: { jobId: job.id } })
    expect(request.status).toBe('SENT')
    expect(request.sentAt).not.toBeNull()

    const logged = await prisma.communicationLog.count({
      where: { organizationId: session.organizationId, messageType: 'REVIEW_REQUEST' },
    })
    expect(logged).toBe(1)
  })
})

describe('not asking twice', () => {
  it('refuses a second manual send for the same job', async () => {
    const { session } = await createTestCompany()
    await reviewDestination(session)
    const job = await completedJobWithEmail(session)

    await sendReviewRequestForJob(session, job.id)
    const second = await sendReviewRequestForJob(session, job.id)

    expect(second.sent).toBe(false)
    expect(second.reason).toMatch(/already been asked/i)
    expect(sent).toHaveLength(1)
  })

  it('keeps one request row per job', async () => {
    const { session } = await createTestCompany()
    await reviewDestination(session)
    const job = await completedJobWithEmail(session)

    await sendReviewRequestForJob(session, job.id)
    await sendReviewRequestForJob(session, job.id).catch(() => undefined)

    expect(await prisma.reviewRequest.count({ where: { jobId: job.id } })).toBe(1)
  })

  it('is enforced by the database, not only by the check', async () => {
    const { session } = await createTestCompany()
    const destination = await reviewDestination(session)
    const job = await completedJobWithEmail(session)

    await prisma.reviewRequest.create({
      data: {
        organizationId: session.organizationId,
        customerId: job.customerId,
        jobId: job.id,
        destinationId: destination.id,
        reviewUrl: destination.url,
      },
    })

    await expect(
      prisma.reviewRequest.create({
        data: {
          organizationId: session.organizationId,
          customerId: job.customerId,
          jobId: job.id,
          destinationId: destination.id,
          reviewUrl: destination.url,
        },
      }),
    ).rejects.toThrow()
  })
})

describe('when not to ask', () => {
  it('refuses before the job is finished', async () => {
    const { session } = await createTestCompany()
    await reviewDestination(session)
    const job = await completedJobWithEmail(session)
    await prisma.job.update({ where: { id: job.id }, data: { status: 'IN_PROGRESS' } })

    await expect(sendReviewRequestForJob(session, job.id)).rejects.toThrow(ReviewRequestError)
    expect(sent).toHaveLength(0)
  })

  it('refuses when the company has switched reviews off', async () => {
    const { session } = await createTestCompany()
    await reviewDestination(session)
    const job = await completedJobWithEmail(session)
    await prisma.organization.update({
      where: { id: session.organizationId },
      data: { reviewRequestEnabled: false },
    })

    await expect(sendReviewRequestForJob(session, job.id)).rejects.toThrow(/switched off/i)
  })

  it('refuses when no review link is configured', async () => {
    const { session } = await createTestCompany()
    const job = await completedJobWithEmail(session)

    await expect(sendReviewRequestForJob(session, job.id)).rejects.toThrow(/review link/i)
  })

  it('refuses when the customer has no email address', async () => {
    const { session } = await createTestCompany()
    await reviewDestination(session)
    const job = await completedJobWithEmail(session, { email: null })

    const result = await sendReviewRequestForJob(session, job.id)
    expect(result.sent).toBe(false)
    expect(result.reason).toMatch(/email/i)
  })

  it('waits while the invoice is still outstanding', async () => {
    const { session } = await createTestCompany()
    const destination = await reviewDestination(session)
    const job = await completedJobWithEmail(session)

    await prisma.invoice.create({
      data: {
        organizationId: session.organizationId,
        number: uniqueNumber(),
        displayNumber: `INV-${uniqueNumber()}`,
        customerId: job.customerId,
        jobId: job.id,
        status: 'SENT',
        subtotalCents: 42700,
        taxCents: 0,
        totalCents: 42700,
        balanceCents: 42700,
      },
    })

    const request = await prisma.reviewRequest.create({
      data: {
        organizationId: session.organizationId,
        customerId: job.customerId,
        jobId: job.id,
        destinationId: destination.id,
        reviewUrl: destination.url,
      },
    })

    // Nobody wants to be asked for five stars while they still owe money.
    const result = await sendReviewRequest(request.id, { force: true })
    expect(result.sent).toBe(false)
    expect(result.reason).toMatch(/outstanding/i)
    expect(sent).toHaveLength(0)
  })
})

describe('the queue', () => {
  it('does not send before the scheduled time', async () => {
    const { session } = await createTestCompany()
    const destination = await reviewDestination(session)
    const job = await completedJobWithEmail(session)

    const scheduled = await prisma.reviewRequest.create({
      data: {
        organizationId: session.organizationId,
        customerId: job.customerId,
        jobId: job.id,
        destinationId: destination.id,
        reviewUrl: destination.url,
        scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
      },
    })

    // The sweep is global by design, so assert on this request rather than on
    // a total that other rows in the database could move.
    await sendDueReviewRequests()

    const after = await prisma.reviewRequest.findUniqueOrThrow({ where: { id: scheduled.id } })
    expect(after.status).toBe('QUEUED')
    expect(after.sentAt).toBeNull()
    expect(after.attemptCount).toBe(0)
  })

  it('sends once it comes due', async () => {
    const { session } = await createTestCompany()
    const destination = await reviewDestination(session)
    const job = await completedJobWithEmail(session)

    await prisma.reviewRequest.create({
      data: {
        organizationId: session.organizationId,
        customerId: job.customerId,
        jobId: job.id,
        destinationId: destination.id,
        reviewUrl: destination.url,
        scheduledFor: new Date(Date.now() - 1000),
      },
    })

    await sendDueReviewRequests()

    const after = await prisma.reviewRequest.findFirstOrThrow({ where: { jobId: job.id } })
    expect(after.status).toBe('SENT')
    expect(after.sentAt).not.toBeNull()
  })

  it('records a failure and allows a retry', async () => {
    const { session } = await createTestCompany()
    await reviewDestination(session)
    const job = await completedJobWithEmail(session)

    failNext = true
    const failed = await sendReviewRequestForJob(session, job.id)
    expect(failed.sent).toBe(false)

    const request = await prisma.reviewRequest.findFirstOrThrow({ where: { jobId: job.id } })
    expect(request.status).toBe('FAILED')
    expect(request.attemptCount).toBe(1)
    expect(request.sentAt).toBeNull()

    failNext = false
    const retried = await sendReviewRequest(request.id, { force: true })
    expect(retried.sent).toBe(true)
  })

  it('gives up after several failures rather than hammering a bad address', async () => {
    const { session } = await createTestCompany()
    const destination = await reviewDestination(session)
    const job = await completedJobWithEmail(session)

    const request = await prisma.reviewRequest.create({
      data: {
        organizationId: session.organizationId,
        customerId: job.customerId,
        jobId: job.id,
        destinationId: destination.id,
        reviewUrl: destination.url,
        attemptCount: 3,
      },
    })

    const result = await sendReviewRequest(request.id, { force: true })
    expect(result.sent).toBe(false)
    expect(result.reason).toMatch(/failed several times/i)
  })

  it('never reaches across companies', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()
    await reviewDestination(b)
    const theirJob = await completedJobWithEmail(b)

    await expect(sendReviewRequestForJob(a, theirJob.id)).rejects.toThrow(ReviewRequestError)
  })
})
