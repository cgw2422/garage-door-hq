import Stripe from 'stripe'
import { assertStripeKeyMatchesEnvironment } from '@/lib/environment'

/**
 * The Stripe client, and the decision about whether there is one.
 *
 * Billing is optional in development and in tests: without a secret key the
 * product runs, trials work, and every billing screen says plainly that
 * billing is not connected. Nothing pretends to charge anybody.
 */

let cached: Stripe | null = null

export interface StripeConfig {
  secretKey: string
  /** The one price: $39.99/month. */
  priceId: string | null
  webhookSecret: string | null
  connectWebhookSecret: string | null
  publishableKey: string | null
}

export function readStripeConfigFromEnv(): StripeConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return null
  // A live key outside production is refused here, at the point the key is
  // read, so there is no path from a staging deployment to a real charge on a
  // real card — not through checkout, not through a webhook, not through a
  // script that happens to import this module.
  assertStripeKeyMatchesEnvironment(secretKey)
  return {
    secretKey,
    priceId: process.env.STRIPE_PRICE_ID_STANDARD || null,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
    connectWebhookSecret:
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || null,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null,
  }
}

export function stripeConfigured(): boolean {
  return readStripeConfigFromEnv() !== null
}

/** Throws when billing is not configured; callers check `stripeConfigured()` first. */
export function stripe(): Stripe {
  if (cached) return cached
  const config = readStripeConfigFromEnv()
  if (!config) {
    throw new BillingNotConfiguredError(
      'Billing is not connected yet. Set STRIPE_SECRET_KEY to enable it.',
    )
  }
  cached = new Stripe(config.secretKey, {
    // Pinned: an account-level API version change must not silently alter the
    // shape of a webhook this code parses.
    apiVersion: '2025-02-24.acacia',
    appInfo: { name: 'Garage Door HQ', version: '1.0.0' },
    maxNetworkRetries: 2,
  })
  return cached
}

/** Test seam. */
export function resetStripe() {
  cached = null
}

export class BillingNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BillingNotConfiguredError'
  }
}

export class BillingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BillingError'
  }
}

/**
 * Turn a Stripe exception into something a garage door owner can read.
 *
 * Stripe's own messages are written for developers and sometimes name internal
 * objects. The real error is logged; the user gets a sentence.
 */
export function friendlyStripeError(error: unknown): string {
  if (error instanceof BillingNotConfiguredError) return error.message

  if (error instanceof Stripe.errors.StripeError) {
    console.error(`[stripe] ${error.type} ${error.code ?? ''} ${error.message}`)

    if (error instanceof Stripe.errors.StripeCardError) {
      // Card declines are the one case where Stripe's wording is written for
      // the cardholder and is more useful than anything generic.
      return error.message || 'That card was declined.'
    }
    if (error instanceof Stripe.errors.StripeRateLimitError) {
      return 'Billing is busy right now. Try again in a moment.'
    }
    if (
      error instanceof Stripe.errors.StripeConnectionError ||
      error instanceof Stripe.errors.StripeAPIError
    ) {
      return 'Could not reach the billing service. Try again in a moment.'
    }
    if (error instanceof Stripe.errors.StripeAuthenticationError) {
      return 'Billing is not set up correctly. Please contact support.'
    }
    return 'Something went wrong with billing. Try again, or contact support.'
  }

  console.error('[stripe] unexpected error', error)
  return 'Something went wrong with billing. Try again, or contact support.'
}
