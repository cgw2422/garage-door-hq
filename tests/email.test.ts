import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { resetEmail, setEmailDriver } from '@/server/email'
import { applyDeliveryEvent, brandingForOrganization, sendEmail } from '@/server/email/send'
import { estimateLinkMessage, invoiceLinkMessage } from '@/server/email/templates/messages'
import { createTestCompany } from './helpers'
import type { EmailDriver, OutboundEmail } from '@/server/email/types'

/**
 * Transactional email.
 *
 * The property this file defends: **a message is not "sent" because we called
 * an API.** Delivery states have to mean what they say, or the communication
 * timeline becomes a set of comforting lies.
 */

interface Recorder {
  sent: OutboundEmail[]
  fail(reason?: string, retryable?: boolean): void
  succeed(): void
}

function recordingDriver(): Recorder {
  const sent: OutboundEmail[] = []
  let failure: { reason: string; retryable: boolean } | null = null

  const driver: EmailDriver = {
    name: 'recording',
    configured: true,
    async send(message) {
      sent.push(message)
      if (failure) {
        return {
          accepted: false,
          providerMessageId: null,
          error: failure.reason,
          retryable: failure.retryable,
        }
      }
      return { accepted: true, providerMessageId: `rec_${sent.length}_${randomUUID()}` }
    },
  }

  setEmailDriver(driver)
  return {
    sent,
    fail(reason = 'The email service is temporarily unavailable.', retryable = true) {
      failure = { reason, retryable }
    },
    succeed() {
      failure = null
    },
  }
}

let recorder: Recorder

beforeEach(() => {
  recorder = recordingDriver()
})

afterEach(() => {
  resetEmail()
})

async function brandingFor(organizationId: string) {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
  })
  return brandingForOrganization(organization)
}

describe('delivery states', () => {
  it('records a message before the provider is called', async () => {
    const { session } = await createTestCompany()
    const branding = await brandingFor(session.organizationId)

    const outcome = await sendEmail({
      organizationId: session.organizationId,
      messageType: 'GENERAL',
      to: { email: 'someone@test.invalid' },
      branding,
      message: estimateLinkMessage(branding, {
        customerFirstName: 'Rachel',
        estimateNumber: 'EST-1001',
        totalLabel: '$427.00',
        url: 'https://example.test/p/e/token',
        expiresLabel: null,
      }),
      idempotencyKey: `test:${randomUUID()}`,
    })

    expect(outcome.ok).toBe(true)
    expect(outcome.log.attemptCount).toBe(1)
    expect(outcome.log.sentAt).not.toBeNull()
  })

  it('reaches SENT, and never DELIVERED, from the send path', async () => {
    const { session } = await createTestCompany()
    const branding = await brandingFor(session.organizationId)

    const outcome = await sendEmail({
      organizationId: session.organizationId,
      messageType: 'ESTIMATE_LINK',
      to: { email: 'someone@test.invalid' },
      branding,
      message: estimateLinkMessage(branding, {
        customerFirstName: null,
        estimateNumber: 'EST-1002',
        totalLabel: null,
        url: 'https://example.test/p/e/token',
        expiresLabel: null,
      }),
      idempotencyKey: `test:${randomUUID()}`,
    })

    // Accepted by a provider is not the same as arrived in a mailbox, and the
    // product must never conflate them.
    expect(outcome.log.status).toBe('SENT')
    expect(outcome.log.deliveredAt).toBeNull()
  })

  it('reaches DELIVERED only from a provider event', async () => {
    const { session } = await createTestCompany()
    const branding = await brandingFor(session.organizationId)

    const outcome = await sendEmail({
      organizationId: session.organizationId,
      messageType: 'INVOICE_LINK',
      to: { email: 'someone@test.invalid' },
      branding,
      message: invoiceLinkMessage(branding, {
        customerFirstName: null,
        invoiceNumber: 'INV-1001',
        balanceLabel: '$427.00',
        dueLabel: null,
        url: 'https://example.test/p/i/token',
        payable: false,
      }),
      idempotencyKey: `test:${randomUUID()}`,
    })

    const delivered = await applyDeliveryEvent({
      providerName: 'recording',
      providerMessageId: outcome.log.providerMessageId!,
      event: 'delivered',
    })

    expect(delivered?.status).toBe('DELIVERED')
    expect(delivered?.deliveredAt).not.toBeNull()
  })

  it('does not let a stale delivered event undo a bounce', async () => {
    const { session } = await createTestCompany()
    const branding = await brandingFor(session.organizationId)

    const outcome = await sendEmail({
      organizationId: session.organizationId,
      messageType: 'GENERAL',
      to: { email: 'nobody@test.invalid' },
      branding,
      message: estimateLinkMessage(branding, {
        customerFirstName: null,
        estimateNumber: 'EST-1003',
        totalLabel: null,
        url: 'https://example.test/p/e/token',
        expiresLabel: null,
      }),
      idempotencyKey: `test:${randomUUID()}`,
    })

    const messageId = outcome.log.providerMessageId!
    await applyDeliveryEvent({
      providerName: 'recording',
      providerMessageId: messageId,
      event: 'bounced',
      detail: 'Mailbox does not exist',
    })

    // Webhooks arrive out of order. A bounce is not undone by a delivery event
    // that was generated earlier and turned up later.
    const after = await applyDeliveryEvent({
      providerName: 'recording',
      providerMessageId: messageId,
      event: 'delivered',
    })
    expect(after?.status).toBe('BOUNCED')
  })

  it('records a failure without claiming anything was sent', async () => {
    const { session } = await createTestCompany()
    const branding = await brandingFor(session.organizationId)
    recorder.fail('The email service is temporarily unavailable.')

    const outcome = await sendEmail({
      organizationId: session.organizationId,
      messageType: 'ESTIMATE_LINK',
      to: { email: 'someone@test.invalid' },
      branding,
      message: estimateLinkMessage(branding, {
        customerFirstName: null,
        estimateNumber: 'EST-1004',
        totalLabel: null,
        url: 'https://example.test/p/e/token',
        expiresLabel: null,
      }),
      idempotencyKey: `test:${randomUUID()}`,
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.retryable).toBe(true)
    expect(outcome.log.status).toBe('FAILED')
    expect(outcome.log.sentAt).toBeNull()
    expect(outcome.log.failedAt).not.toBeNull()
  })

  it('lets a retry reuse the same row and succeed', async () => {
    const { session } = await createTestCompany()
    const branding = await brandingFor(session.organizationId)
    const key = `test:${randomUUID()}`
    const message = estimateLinkMessage(branding, {
      customerFirstName: null,
      estimateNumber: 'EST-1005',
      totalLabel: null,
      url: 'https://example.test/p/e/token',
      expiresLabel: null,
    })

    recorder.fail()
    const failed = await sendEmail({
      organizationId: session.organizationId,
      messageType: 'ESTIMATE_LINK',
      to: { email: 'someone@test.invalid' },
      branding,
      message,
      idempotencyKey: key,
    })

    recorder.succeed()
    const retried = await sendEmail({
      organizationId: session.organizationId,
      messageType: 'ESTIMATE_LINK',
      to: { email: 'someone@test.invalid' },
      branding,
      message,
      idempotencyKey: key,
    })

    expect(retried.log.id).toBe(failed.log.id)
    expect(retried.log.status).toBe('SENT')
    expect(retried.log.attemptCount).toBe(2)
    expect(retried.log.errorMessage).toBeNull()
  })
})

describe('not sending twice', () => {
  it('refuses to send the same message again', async () => {
    const { session } = await createTestCompany()
    const branding = await brandingFor(session.organizationId)
    const key = `receipt:${randomUUID()}`
    const message = invoiceLinkMessage(branding, {
      customerFirstName: null,
      invoiceNumber: 'INV-1009',
      balanceLabel: '$100.00',
      dueLabel: null,
      url: 'https://example.test/p/i/token',
      payable: true,
    })

    const first = await sendEmail({
      organizationId: session.organizationId,
      messageType: 'PAYMENT_RECEIPT',
      to: { email: 'someone@test.invalid' },
      branding,
      message,
      idempotencyKey: key,
    })
    const second = await sendEmail({
      organizationId: session.organizationId,
      messageType: 'PAYMENT_RECEIPT',
      to: { email: 'someone@test.invalid' },
      branding,
      message,
      idempotencyKey: key,
    })

    expect(second.deduplicated).toBe(true)
    expect(second.log.id).toBe(first.log.id)
    // The provider was called exactly once.
    expect(recorder.sent).toHaveLength(1)
  })
})

describe('branding', () => {
  it('sends as the garage door company, not as Garage Door HQ', async () => {
    const { session } = await createTestCompany()
    await prisma.organization.update({
      where: { id: session.organizationId },
      data: { name: 'ABC Garage Doors', email: 'office@abc.test', phone: '(555) 111-2222' },
    })
    const branding = await brandingFor(session.organizationId)

    await sendEmail({
      organizationId: session.organizationId,
      messageType: 'ESTIMATE_LINK',
      to: { email: 'rachel@test.invalid', name: 'Rachel' },
      branding,
      message: estimateLinkMessage(branding, {
        customerFirstName: 'Rachel',
        estimateNumber: 'EST-1010',
        totalLabel: '$427.00',
        url: 'https://example.test/p/e/token',
        expiresLabel: null,
      }),
      idempotencyKey: `test:${randomUUID()}`,
    })

    const message = recorder.sent[0]!
    // Their name in the inbox list.
    expect(message.from.name).toBe('ABC Garage Doors')
    // A reply reaches them, not us.
    expect(message.replyTo?.email).toBe('office@abc.test')
    // The subject is about them.
    expect(message.subject).toContain('ABC Garage Doors')
    // We appear once, small.
    expect(message.text).toContain('Powered by')
  })

  it('sends a password reset as the platform, because it is from us', async () => {
    const { session } = await createTestCompany()

    await sendEmail({
      organizationId: session.organizationId,
      messageType: 'PASSWORD_RESET',
      to: { email: session.email },
      branding: null,
      message: {
        subject: 'Reset your password',
        html: '<p>reset</p>',
        text: 'reset',
      },
      idempotencyKey: `test:${randomUUID()}`,
    })

    const message = recorder.sent[0]!
    expect(message.from.name).not.toBe(session.organizationName)
  })

  it('escapes anything a company typed into its own name', async () => {
    const { session } = await createTestCompany()
    await prisma.organization.update({
      where: { id: session.organizationId },
      data: { name: 'Doors & <script>alert(1)</script> Co' },
    })
    const branding = await brandingFor(session.organizationId)

    const message = estimateLinkMessage(branding, {
      customerFirstName: null,
      estimateNumber: 'EST-1011',
      totalLabel: null,
      url: 'https://example.test/p/e/token',
      expiresLabel: null,
    })

    expect(message.html).not.toContain('<script>')
    expect(message.html).toContain('&lt;script&gt;')
    expect(message.html).toContain('&amp;')
  })
})

describe('what is logged', () => {
  it('is scoped to the company it belongs to', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()
    const branding = await brandingFor(a.organizationId)

    await sendEmail({
      organizationId: a.organizationId,
      messageType: 'ESTIMATE_LINK',
      to: { email: 'someone@test.invalid' },
      branding,
      message: estimateLinkMessage(branding, {
        customerFirstName: null,
        estimateNumber: 'EST-1012',
        totalLabel: null,
        url: 'https://example.test/p/e/token',
        expiresLabel: null,
      }),
      idempotencyKey: `test:${randomUUID()}`,
    })

    expect(await b.db.communicationLog.count()).toBe(0)
    expect(await a.db.communicationLog.count()).toBeGreaterThan(0)
  })
})
