import { NextResponse } from 'next/server'
import { readStripeConfigFromEnv } from '@/server/billing/stripe'
import {
  WebhookSignatureError,
  handleStripeEvent,
  verifyStripeSignatureAgainstAny,
} from '@/server/billing/webhooks'

/**
 * Stripe's webhook endpoint.
 *
 * Unauthenticated by necessity — Stripe has no session — and authenticated in
 * the only way that matters here: the signature over the exact bytes we
 * received. `request.text()` is deliberate; parsing the JSON first and
 * re-serializing it would change the bytes and break verification.
 *
 * Both populations of event land here: this platform's own subscriptions, and
 * customer payments on a company's connected account. They arrive from two
 * separately registered Stripe endpoints with two different signing secrets,
 * so verification is tried against both.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const config = readStripeConfigFromEnv()
  if (!config?.webhookSecret) {
    // Nothing can be verified, so nothing is trusted. 503 rather than 200, so
    // a misconfigured deployment shows up in Stripe's dashboard immediately
    // instead of silently discarding subscription changes.
    console.error('[stripe:webhook] STRIPE_WEBHOOK_SECRET is not set; refusing the delivery')
    return NextResponse.json({ error: 'Webhooks are not configured.' }, { status: 503 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')

  let event
  try {
    event = verifyStripeSignatureAgainstAny({
      rawBody,
      signature,
      secrets: [config.webhookSecret, config.connectWebhookSecret],
    })
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      // 400 tells Stripe not to retry: a bad signature will not become good.
      return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
    }
    throw error
  }

  try {
    const outcome = await handleStripeEvent(event)
    return NextResponse.json({
      received: true,
      duplicate: outcome.duplicate,
      processed: outcome.processed,
    })
  } catch (error) {
    // 500 so Stripe retries with backoff. Losing a subscription change because
    // the database blinked is far worse than being called again.
    console.error(`[stripe:webhook] handling ${event.type} (${event.id}) failed`, error)
    return NextResponse.json({ error: 'Processing failed.' }, { status: 500 })
  }
}
