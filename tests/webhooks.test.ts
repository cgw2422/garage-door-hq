import { createHmac, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Stripe from 'stripe'
import { prisma } from '@/lib/db'
import { resetStripe, stripe } from '@/server/billing/stripe'
import {
  WebhookSignatureError,
  handleStripeEvent,
  verifyStripeSignature,
} from '@/server/billing/webhooks'
import { createTestCompany } from './helpers'

/**
 * Stripe webhooks.
 *
 * These are the endpoint an attacker reaches without any credential at all, so
 * the tests are about the two things standing between them and an account's
 * subscription state: the signature, and the replay guard.
 *
 * No network is involved. A signature is produced the way Stripe produces one
 * and verified by the real SDK, and the event objects are the real shapes.
 */

const SECRET = 'whsec_test_secret_for_signature_verification'

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_not_a_real_key'
  process.env.STRIPE_WEBHOOK_SECRET = SECRET
  resetStripe()
})

afterEach(() => {
  resetStripe()
})

/** Sign a body exactly the way Stripe does. */
function sign(body: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')
  return `t=${timestamp},v1=${signature}`
}

function subscriptionEvent(options: {
  id?: string
  type?: string
  organizationId: string
  customerId?: string
  subscriptionId?: string
  status?: Stripe.Subscription.Status
}) {
  const now = Math.floor(Date.now() / 1000)
  return {
    id: options.id ?? `evt_${randomUUID().replace(/-/g, '')}`,
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: now,
    type: options.type ?? 'customer.subscription.updated',
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: options.subscriptionId ?? `sub_${randomUUID().replace(/-/g, '')}`,
        object: 'subscription',
        customer: options.customerId ?? `cus_${randomUUID().replace(/-/g, '')}`,
        status: options.status ?? 'active',
        cancel_at_period_end: false,
        canceled_at: null,
        current_period_start: now,
        current_period_end: now + 30 * 86_400,
        start_date: now,
        default_payment_method: null,
        metadata: { organizationId: options.organizationId },
        items: {
          object: 'list',
          data: [
            {
              id: `si_${randomUUID().replace(/-/g, '')}`,
              object: 'subscription_item',
              price: {
                id: 'price_standard_monthly',
                object: 'price',
                unit_amount: 3999,
                currency: 'usd',
              },
            },
          ],
        },
      },
    },
  }
}

describe('signature verification', () => {
  it('accepts a correctly signed body', () => {
    const body = JSON.stringify(subscriptionEvent({ organizationId: 'org' }))
    const event = verifyStripeSignature({
      rawBody: body,
      signature: sign(body),
      secret: SECRET,
    })
    expect(event.type).toBe('customer.subscription.updated')
  })

  it('refuses a body with no signature at all', () => {
    const body = JSON.stringify(subscriptionEvent({ organizationId: 'org' }))
    expect(() =>
      verifyStripeSignature({ rawBody: body, signature: null, secret: SECRET }),
    ).toThrow(WebhookSignatureError)
  })

  it('refuses a signature made with a different secret', () => {
    const body = JSON.stringify(subscriptionEvent({ organizationId: 'org' }))
    expect(() =>
      verifyStripeSignature({
        rawBody: body,
        signature: sign(body, 'whsec_the_wrong_secret'),
        secret: SECRET,
      }),
    ).toThrow(WebhookSignatureError)
  })

  it('refuses a body that was altered after signing', () => {
    const original = JSON.stringify(subscriptionEvent({ organizationId: 'org' }))
    const signature = sign(original)

    // A single byte changed anywhere invalidates it.
    const tampered = original.replace('"status":"active"', '"status":"trialing"')
    expect(tampered).not.toBe(original)

    expect(() =>
      verifyStripeSignature({ rawBody: tampered, signature, secret: SECRET }),
    ).toThrow(WebhookSignatureError)
  })

  it('refuses a replayed signature that is too old', () => {
    const body = JSON.stringify(subscriptionEvent({ organizationId: 'org' }))
    // Stripe's tolerance is five minutes; an hour-old capture is refused.
    const stale = Math.floor(Date.now() / 1000) - 3600
    expect(() =>
      verifyStripeSignature({ rawBody: body, signature: sign(body, SECRET, stale), secret: SECRET }),
    ).toThrow(WebhookSignatureError)
  })

  it('refuses a signature from a different body entirely', () => {
    const bodyA = JSON.stringify(subscriptionEvent({ organizationId: 'a' }))
    const bodyB = JSON.stringify(subscriptionEvent({ organizationId: 'b' }))
    expect(() =>
      verifyStripeSignature({ rawBody: bodyB, signature: sign(bodyA), secret: SECRET }),
    ).toThrow(WebhookSignatureError)
  })
})

describe('idempotency', () => {
  it('records every event it accepts', async () => {
    const { session } = await createTestCompany()
    const event = subscriptionEvent({ organizationId: session.organizationId })

    await handleStripeEvent(event as unknown as Stripe.Event)

    const stored = await prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'stripe', eventId: event.id } },
    })
    expect(stored).not.toBeNull()
    expect(stored!.status).toBe('PROCESSED')
    expect(stored!.organizationId).toBe(session.organizationId)
    // The payload is kept, so a state change at 3am has an explanation.
    expect(stored!.payload).not.toBeNull()
  })

  it('recognises a replay and does not process it twice', async () => {
    const { session } = await createTestCompany()
    const event = subscriptionEvent({ organizationId: session.organizationId })

    const first = await handleStripeEvent(event as unknown as Stripe.Event)
    const second = await handleStripeEvent(event as unknown as Stripe.Event)

    expect(first.duplicate).toBe(false)
    expect(first.processed).toBe(true)
    expect(second.duplicate).toBe(true)
    expect(second.processed).toBe(false)

    const rows = await prisma.webhookEvent.count({
      where: { provider: 'stripe', eventId: event.id },
    })
    expect(rows).toBe(1)
  })

  it('survives the same event arriving twice at once', async () => {
    const { session } = await createTestCompany()
    const event = subscriptionEvent({ organizationId: session.organizationId })

    const [a, b] = await Promise.all([
      handleStripeEvent(event as unknown as Stripe.Event),
      handleStripeEvent(event as unknown as Stripe.Event),
    ])

    // Exactly one of the two did the work; the unique index decided which.
    expect([a.duplicate, b.duplicate].filter(Boolean)).toHaveLength(1)
    expect(
      await prisma.webhookEvent.count({ where: { provider: 'stripe', eventId: event.id } }),
    ).toBe(1)
  })

  it('records an event it does not act on, rather than dropping it', async () => {
    const { session } = await createTestCompany()
    const event = {
      ...subscriptionEvent({ organizationId: session.organizationId }),
      type: 'customer.discount.created',
    }

    const outcome = await handleStripeEvent(event as unknown as Stripe.Event)
    expect(outcome.processed).toBe(false)
    expect(outcome.duplicate).toBe(false)

    const stored = await prisma.webhookEvent.findUniqueOrThrow({
      where: { provider_eventId: { provider: 'stripe', eventId: event.id } },
    })
    expect(stored.status).toBe('IGNORED')
  })
})

describe('subscription state from Stripe', () => {
  it('activates an account when Stripe says the subscription is active', async () => {
    const { session } = await createTestCompany()
    const event = subscriptionEvent({
      organizationId: session.organizationId,
      status: 'active',
    })

    await handleStripeEvent(event as unknown as Stripe.Event)

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: session.organizationId },
    })
    expect(subscription.status).toBe('ACTIVE')
    expect(subscription.providerSubscriptionId).toBe(
      (event.data.object as { id: string }).id,
    )
    expect(subscription.startedAt).not.toBeNull()
  })

  it('marks an account past due rather than cancelling it', async () => {
    const { session } = await createTestCompany()

    await handleStripeEvent(
      subscriptionEvent({
        organizationId: session.organizationId,
        status: 'past_due',
      }) as unknown as Stripe.Event,
    )

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: session.organizationId },
    })
    expect(subscription.status).toBe('PAST_DUE')
    expect(subscription.pastDueSince).not.toBeNull()
    expect(subscription.cancelledAt).toBeNull()
  })

  it('leaves an account alone when the first payment never completed', async () => {
    const { session } = await createTestCompany()
    const before = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: session.organizationId },
    })

    await handleStripeEvent(
      subscriptionEvent({
        organizationId: session.organizationId,
        status: 'incomplete_expired',
      }) as unknown as Stripe.Event,
    )

    const after = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: session.organizationId },
    })
    // Never started, so never cancelled. Locking them out over an abandoned
    // checkout would be the wrong repair.
    expect(after.status).toBe(before.status)
  })

  it('does not let Stripe override complimentary access', async () => {
    const { session } = await createTestCompany()
    await prisma.subscription.update({
      where: { organizationId: session.organizationId },
      data: {
        status: 'COMPLIMENTARY',
        complimentaryUntil: new Date(Date.now() + 30 * 86_400_000),
      },
    })

    await handleStripeEvent(
      subscriptionEvent({
        organizationId: session.organizationId,
        status: 'canceled',
      }) as unknown as Stripe.Event,
    )

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: session.organizationId },
    })
    // A comp is a person's decision and outranks Stripe while it lasts.
    expect(subscription.status).toBe('COMPLIMENTARY')
    // The Stripe ids are still recorded, so nothing is lost.
    expect(subscription.providerSubscriptionId).not.toBeNull()
  })

  it('ignores an event for a company it cannot resolve', async () => {
    const event = subscriptionEvent({ organizationId: randomUUID() })
    const outcome = await handleStripeEvent(event as unknown as Stripe.Event)

    expect(outcome.organizationId).toBeNull()
    const stored = await prisma.webhookEvent.findUniqueOrThrow({
      where: { provider_eventId: { provider: 'stripe', eventId: event.id } },
    })
    expect(stored.status).toBe('PROCESSED')
    expect(stored.organizationId).toBeNull()
  })

  it('does not touch another company', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()

    const before = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: b.organizationId },
    })

    await handleStripeEvent(
      subscriptionEvent({ organizationId: a.organizationId, status: 'active' }) as unknown as Stripe.Event,
    )

    const after = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: b.organizationId },
    })
    expect(after.status).toBe(before.status)
    expect(after.providerSubscriptionId).toBeNull()
  })
})

describe('the client', () => {
  it('pins an API version, so a dashboard change cannot reshape a payload', () => {
    // Reading it off the instance rather than asserting the constant twice.
    const client = stripe() as unknown as { _api: { version: string } }
    expect(client._api.version).toBe('2025-02-24.acacia')
  })
})
