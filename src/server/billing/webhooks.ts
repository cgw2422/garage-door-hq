import type Stripe from 'stripe'
import { prisma } from '@/lib/db'
import { stripe } from './stripe'
import { syncFromStripe } from './service'

/**
 * Stripe webhooks.
 *
 * Three properties, in order of importance:
 *
 * 1. **Signature first.** Nothing is parsed as trusted data until Stripe's
 *    signature over the raw body verifies. The route reads the body as text
 *    for exactly this reason — any reserialization breaks the signature.
 * 2. **Idempotent.** Every event id is inserted under a unique constraint
 *    before any business logic runs. A replay, a retry after our own 500, or
 *    Stripe's at-least-once delivery all hit that constraint and stop.
 * 3. **Auditable.** The event is stored with its payload and its outcome, so
 *    "why did this account change state at 3am" has an answer.
 *
 * Failures return 500 deliberately: Stripe retries with backoff for days, and
 * a transient database problem should not silently lose a subscription change.
 */

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebhookSignatureError'
  }
}

/**
 * Events this product acts on. Anything else is recorded and ignored.
 *
 * Two populations arrive on the same endpoint: platform events about Garage
 * Door HQ's own subscriptions, and Connect events about a garage door
 * company's customers paying invoices. A Connect event carries `account`, and
 * that is what decides which way it is routed — never the event type alone,
 * since `checkout.session.completed` occurs in both worlds.
 */
const HANDLED = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_succeeded',
  // Connect
  'payment_intent.succeeded',
  'charge.refunded',
  'account.updated',
])

export interface WebhookOutcome {
  /** False when the event had already been processed. */
  processed: boolean
  eventId: string
  eventType: string
  organizationId: string | null
  duplicate: boolean
}

/**
 * Verify the signature and return the parsed event.
 *
 * Separated from handling so a test can verify signature behaviour without a
 * database, and so the route can answer 400 for a bad signature before doing
 * anything else.
 */
export function verifyStripeSignature(params: {
  rawBody: string
  signature: string | null
  secret: string
}): Stripe.Event {
  if (!params.signature) {
    throw new WebhookSignatureError('Missing signature header.')
  }
  try {
    return stripe().webhooks.constructEvent(params.rawBody, params.signature, params.secret)
  } catch (error) {
    // Stripe's message names the reason (wrong secret, stale timestamp,
    // tampered body). It is logged, never returned.
    console.error('[stripe:webhook] signature verification failed', error)
    throw new WebhookSignatureError('Signature verification failed.')
  }
}

/**
 * Record and handle one verified event.
 *
 * The insert is the lock: two concurrent deliveries of the same event race on
 * the unique constraint and exactly one wins.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  const connectedAccountId = (event as Stripe.Event & { account?: string }).account ?? null

  let recordId: string
  try {
    const record = await prisma.webhookEvent.create({
      data: {
        provider: 'stripe',
        eventId: event.id,
        eventType: event.type,
        providerAccountId: connectedAccountId,
        payload: event as unknown as object,
        status: 'RECEIVED',
      },
      select: { id: true },
    })
    recordId = record.id
  } catch (error) {
    // Unique violation: we have seen this event before. That is a success, not
    // a failure — Stripe is told OK so it stops retrying.
    if (isUniqueViolation(error)) {
      const existing = await prisma.webhookEvent.findUnique({
        where: { provider_eventId: { provider: 'stripe', eventId: event.id } },
        select: { organizationId: true },
      })
      return {
        processed: false,
        duplicate: true,
        eventId: event.id,
        eventType: event.type,
        organizationId: existing?.organizationId ?? null,
      }
    }
    throw error
  }

  try {
    const organizationId = HANDLED.has(event.type)
      ? await dispatch(event, connectedAccountId)
      : null

    await prisma.webhookEvent.update({
      where: { id: recordId },
      data: {
        status: HANDLED.has(event.type) ? 'PROCESSED' : 'IGNORED',
        organizationId,
        processedAt: new Date(),
      },
    })

    return {
      processed: HANDLED.has(event.type),
      duplicate: false,
      eventId: event.id,
      eventType: event.type,
      organizationId,
    }
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: recordId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
        processedAt: new Date(),
      },
    })
    throw error
  }
}

async function dispatch(
  event: Stripe.Event,
  connectedAccountId: string | null,
): Promise<string | null> {
  // An event that arrived for a connected account is about that company's own
  // customers, never about our subscription billing.
  if (connectedAccountId) return dispatchConnect(event, connectedAccountId)

  switch (event.type) {
    case 'checkout.session.completed': {
      const checkout = event.data.object as Stripe.Checkout.Session
      if (checkout.mode !== 'subscription' || !checkout.subscription) return null

      const subscriptionId =
        typeof checkout.subscription === 'string'
          ? checkout.subscription
          : checkout.subscription.id

      // Re-read from Stripe rather than trusting the embedded copy: the
      // session object carries the subscription as it was at creation, and we
      // want its current state including the payment method.
      const subscription = await stripe().subscriptions.retrieve(subscriptionId, {
        expand: ['default_payment_method'],
      })

      const result = await syncFromStripe(subscription, {
        organizationId: checkout.client_reference_id ?? null,
      })
      return result.organizationId
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const subscription = event.data.object as Stripe.Subscription
      const result = await syncFromStripe(subscription)
      return result.organizationId
    }

    case 'invoice.paid':
    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : (invoice.subscription?.id ?? null)
      if (!subscriptionId) return null

      // The invoice event tells us something changed; the subscription object
      // tells us what the state now is. Always trust the latter.
      const subscription = await stripe().subscriptions.retrieve(subscriptionId, {
        expand: ['default_payment_method'],
      })
      const result = await syncFromStripe(subscription)
      return result.organizationId
    }

    default:
      return null
  }
}

/**
 * Events from a garage door company's own Stripe account.
 *
 * The invoice being paid is identified from the PaymentIntent's metadata,
 * which we set when creating the Checkout session, and is then checked against
 * the account the charge actually happened on. Metadata is attacker-influenced
 * only by someone who already controls the connected account — but checking it
 * costs nothing and closes the case where a company's own metadata names
 * another company's invoice.
 */
async function dispatchConnect(
  event: Stripe.Event,
  connectedAccountId: string,
): Promise<string | null> {
  const account = await prisma.paymentAccount.findUnique({
    where: { providerAccountId: connectedAccountId },
    select: { organizationId: true },
  })

  switch (event.type) {
    case 'account.updated': {
      const updated = event.data.object as Stripe.Account
      const { applyConnectAccount } = await import('./connect')
      const organizationId =
        account?.organizationId ??
        (typeof updated.metadata?.organizationId === 'string'
          ? updated.metadata.organizationId
          : null)
      if (!organizationId) return null
      await applyConnectAccount(organizationId, updated)
      return organizationId
    }

    case 'payment_intent.succeeded': {
      if (!account) return null

      const intent = event.data.object as Stripe.PaymentIntent
      const { paymentDetailsFromIntent, recordStripePayment } = await import('./customer-payments')

      // Re-read with the charge expanded: the event copy does not carry the
      // card details or the Stripe fee.
      const full = await stripe().paymentIntents.retrieve(
        intent.id,
        { expand: ['latest_charge.balance_transaction'] },
        { stripeAccount: connectedAccountId },
      )
      const details = paymentDetailsFromIntent(full)
      if (!details.invoiceId) return account.organizationId

      // The invoice named in metadata must belong to the account that took the
      // money.
      if (details.organizationId && details.organizationId !== account.organizationId) {
        console.error(
          `[stripe:connect] intent ${intent.id} names organization ${details.organizationId} ` +
            `but arrived for ${account.organizationId}; ignoring`,
        )
        return account.organizationId
      }

      const result = await recordStripePayment({
        organizationId: account.organizationId,
        invoiceId: details.invoiceId,
        providerIntentId: details.providerIntentId,
        providerChargeId: details.providerChargeId,
        providerAccountId: connectedAccountId,
        amountCents: details.amountCents,
        feeCents: details.feeCents,
        cardBrand: details.cardBrand,
        cardLast4: details.cardLast4,
        receiptEmail: details.receiptEmail,
      })

      // A receipt goes out once, on the delivery that actually recorded the
      // payment. A replayed webhook is a duplicate and sends nothing.
      if (!result.duplicate) {
        const { sendPaymentReceipt } = await import('@/server/communications/dispatch')
        await sendPaymentReceipt({
          organizationId: account.organizationId,
          paymentId: result.paymentId,
        }).catch((error: unknown) => {
          // A receipt that fails to send must never fail the payment. The
          // money is recorded; the message is retryable from the invoice.
          console.error('[stripe:connect] receipt send failed', error)
        })
      }

      return account.organizationId
    }

    case 'charge.refunded': {
      if (!account) return null
      const charge = event.data.object as Stripe.Charge
      const { applyRefund } = await import('./customer-payments')
      await applyRefund({
        organizationId: account.organizationId,
        providerChargeId: charge.id,
        refundedCents: charge.amount_refunded,
      })
      return account.organizationId
    }

    default:
      return null
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  )
}
