import type Stripe from 'stripe'
import type { SubscriptionStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import type { AppSession } from '@/lib/session'
import { BillingError, BillingNotConfiguredError, readStripeConfigFromEnv, stripe } from './stripe'
import { accessStateFor, type AccessState } from './access'
import { platformBranding } from '@/server/email/branding'

/**
 * Garage Door HQ's own subscription: one plan, $39.99/month.
 *
 * The rule that shapes everything here: **Stripe is the source of truth for a
 * paid subscription.** This app never marks an account active because a
 * browser came back from Checkout with a success URL — a user can navigate to
 * that URL themselves. State changes come from `syncFromStripe`, which is
 * called by the webhook handler and, as a belt-and-braces measure, by the
 * billing screen when someone returns from Checkout.
 *
 * Trials and complimentary access are ours, not Stripe's, because they exist
 * before any payment relationship does.
 */

export const PLAN = {
  name: 'Garage Door HQ',
  priceCents: 3999,
  currency: 'USD',
  interval: 'month' as const,
  blurb: 'Everything included. No per-user fee. No technician fee.',
}

export interface BillingOverview {
  access: AccessState
  status: SubscriptionStatus
  trialEndsAt: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  cancelledAt: Date | null
  complimentaryUntil: Date | null
  startedAt: Date | null
  cardBrand: string | null
  cardLast4: string | null
  providerCustomerId: string | null
  providerSubscriptionId: string | null
  /** False when no Stripe key is set; every button says so rather than failing. */
  billingConfigured: boolean
  /** True when a price id is missing, which would make Checkout fail. */
  priceMissing: boolean
}

export async function loadBillingOverview(session: AppSession): Promise<BillingOverview> {
  const subscription = await session.db.subscription.findUnique({
    where: { organizationId: session.organizationId },
  })
  const config = readStripeConfigFromEnv()

  return {
    access: accessStateFor(subscription),
    status: subscription?.status ?? 'TRIALING',
    trialEndsAt: subscription?.trialEndsAt ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    cancelledAt: subscription?.cancelledAt ?? null,
    complimentaryUntil: subscription?.complimentaryUntil ?? null,
    startedAt: subscription?.startedAt ?? null,
    cardBrand: subscription?.cardBrand ?? null,
    cardLast4: subscription?.cardLast4 ?? null,
    providerCustomerId: subscription?.providerCustomerId ?? null,
    providerSubscriptionId: subscription?.providerSubscriptionId ?? null,
    billingConfigured: config !== null,
    priceMissing: config !== null && !config.priceId,
  }
}

/**
 * The Stripe customer for this company, created once and reused.
 *
 * Stored on our side so a second Checkout does not create a second customer
 * and split the company's billing history in two.
 */
async function ensureStripeCustomer(session: AppSession): Promise<string> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: session.organizationId },
    select: { providerCustomerId: true },
  })

  if (subscription?.providerCustomerId) return subscription.providerCustomerId

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: session.organizationId },
    select: { name: true, email: true, phone: true },
  })

  const customer = await stripe().customers.create(
    {
      name: organization.name,
      email: organization.email ?? session.email,
      phone: organization.phone ?? undefined,
      // The link back. Every webhook can find the company from this without
      // trusting anything in a redirect.
      metadata: { organizationId: session.organizationId },
    },
    // If this call is retried after a network blip, Stripe returns the
    // customer it already made rather than making a second one.
    { idempotencyKey: `customer:${session.organizationId}` },
  )

  await prisma.subscription.update({
    where: { organizationId: session.organizationId },
    data: { providerName: 'stripe', providerCustomerId: customer.id },
  })

  return customer.id
}

/**
 * Start a Checkout session for the one plan.
 *
 * Returns a URL to send the owner to. Nothing about the account changes here:
 * activation happens when Stripe tells us it happened.
 */
export async function createCheckoutSession(
  session: AppSession,
  options?: { returnPath?: string },
): Promise<{ url: string }> {
  const config = readStripeConfigFromEnv()
  if (!config) throw new BillingNotConfiguredError('Billing is not connected yet.')
  if (!config.priceId) {
    throw new BillingError(
      'The subscription price is not configured. Set STRIPE_PRICE_ID_STANDARD.',
    )
  }

  const existing = await prisma.subscription.findUnique({
    where: { organizationId: session.organizationId },
    select: { status: true, providerSubscriptionId: true, complimentaryUntil: true },
  })

  if (existing?.status === 'ACTIVE') {
    throw new BillingError('This account is already subscribed.')
  }
  if (existing?.status === 'COMPLIMENTARY') {
    throw new BillingError(
      'This account has complimentary access. There is nothing to pay for right now.',
    )
  }

  const customerId = await ensureStripeCustomer(session)
  const platform = platformBranding()
  const returnPath = options?.returnPath ?? '/settings/billing'

  const checkout = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: config.priceId, quantity: 1 }],
    // Stripe appends the session id so the return page can confirm against
    // Stripe rather than believing the redirect.
    success_url: `${platform.appUrl}${returnPath}?checkout={CHECKOUT_SESSION_ID}`,
    cancel_url: `${platform.appUrl}${returnPath}?checkout=cancelled`,
    client_reference_id: session.organizationId,
    subscription_data: {
      metadata: { organizationId: session.organizationId },
    },
    metadata: { organizationId: session.organizationId },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
  })

  if (!checkout.url) throw new BillingError('Could not start checkout. Try again in a moment.')

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'billing.checkout_started',
    entityType: 'Subscription',
    entityId: session.organizationId,
  })

  return { url: checkout.url }
}

/**
 * Stripe's own hosted billing portal.
 *
 * Card details, invoices, cancellation and plan changes all live there. We
 * never build those screens and never see a card number.
 */
export async function createPortalSession(
  session: AppSession,
  options?: { returnPath?: string },
): Promise<{ url: string }> {
  const config = readStripeConfigFromEnv()
  if (!config) throw new BillingNotConfiguredError('Billing is not connected yet.')

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: session.organizationId },
    select: { providerCustomerId: true },
  })
  if (!subscription?.providerCustomerId) {
    throw new BillingError('There is no billing account to manage yet. Start a subscription first.')
  }

  const platform = platformBranding()
  const portal = await stripe().billingPortal.sessions.create({
    customer: subscription.providerCustomerId,
    return_url: `${platform.appUrl}${options?.returnPath ?? '/settings/billing'}`,
  })

  return { url: portal.url }
}

/**
 * Map a Stripe subscription onto our status.
 *
 * Stripe has more states than the product needs. `incomplete` and
 * `incomplete_expired` mean a first payment never succeeded, so the account
 * never actually started — it stays where it was rather than being marked
 * cancelled and locked out.
 */
export function statusFromStripe(
  stripeStatus: Stripe.Subscription.Status,
  current: SubscriptionStatus,
): SubscriptionStatus | null {
  switch (stripeStatus) {
    case 'active':
      return 'ACTIVE'
    case 'trialing':
      // A Stripe-side trial: the card is on file and the subscription is real.
      return 'ACTIVE'
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE'
    case 'canceled':
      return 'CANCELLED'
    case 'paused':
      return 'CANCELLED'
    case 'incomplete':
    case 'incomplete_expired':
      // Never started. Leave the account exactly as it was.
      return current === 'ACTIVE' || current === 'PAST_DUE' ? current : null
    default:
      return null
  }
}

/**
 * Write Stripe's version of the truth onto our subscription row.
 *
 * Called by the webhook handler for every subscription event, and by the
 * billing screen when someone comes back from Checkout. It is deliberately
 * idempotent: running it twice with the same Stripe object is a no-op.
 */
export async function syncFromStripe(
  stripeSubscription: Stripe.Subscription,
  options?: { organizationId?: string | null },
): Promise<{ organizationId: string | null; status: SubscriptionStatus | null }> {
  const organizationId =
    options?.organizationId ??
    (typeof stripeSubscription.metadata?.organizationId === 'string'
      ? stripeSubscription.metadata.organizationId
      : null) ??
    (await organizationIdForCustomer(stripeSubscription.customer))

  if (!organizationId) return { organizationId: null, status: null }

  const existing = await prisma.subscription.findUnique({ where: { organizationId } })
  if (!existing) return { organizationId, status: null }

  // A comp is a deliberate decision by a person and outranks Stripe. Record
  // the Stripe ids so nothing is lost, but do not change the status.
  const compLive =
    existing.status === 'COMPLIMENTARY' &&
    (existing.complimentaryUntil === null || existing.complimentaryUntil.getTime() > Date.now())

  const mapped = statusFromStripe(stripeSubscription.status, existing.status)
  const status = compLive ? existing.status : (mapped ?? existing.status)

  const item = stripeSubscription.items.data[0]
  const periodStart = toDate(stripeSubscription.current_period_start)
  const periodEnd = toDate(stripeSubscription.current_period_end)

  const card = defaultCardFrom(stripeSubscription)

  await prisma.subscription.update({
    where: { organizationId },
    data: {
      status,
      providerName: 'stripe',
      providerSubscriptionId: stripeSubscription.id,
      providerCustomerId:
        typeof stripeSubscription.customer === 'string'
          ? stripeSubscription.customer
          : stripeSubscription.customer.id,
      providerPriceId: item?.price?.id ?? existing.providerPriceId,
      priceCents: item?.price?.unit_amount ?? existing.priceCents,
      currency: (item?.price?.currency ?? existing.currency).toUpperCase(),
      currentPeriodStart: periodStart ?? existing.currentPeriodStart,
      currentPeriodEnd: periodEnd ?? existing.currentPeriodEnd,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      cancelledAt:
        status === 'CANCELLED'
          ? (toDate(stripeSubscription.canceled_at) ?? existing.cancelledAt ?? new Date())
          : null,
      // Stamped once, the first time the account actually starts paying.
      startedAt:
        existing.startedAt ??
        (status === 'ACTIVE' ? (toDate(stripeSubscription.start_date) ?? new Date()) : null),
      pastDueSince:
        status === 'PAST_DUE' ? (existing.pastDueSince ?? new Date()) : null,
      ...(card ? { cardBrand: card.brand, cardLast4: card.last4 } : {}),
    },
  })

  await recordAudit({
    organizationId,
    actorUserId: null,
    action: 'billing.synced_from_stripe',
    entityType: 'Subscription',
    entityId: organizationId,
    before: { status: existing.status },
    after: { status, stripeStatus: stripeSubscription.status },
  })

  return { organizationId, status }
}

/** Resolve the company from a Stripe customer, by our stored id or metadata. */
async function organizationIdForCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer,
): Promise<string | null> {
  const customerId = typeof customer === 'string' ? customer : customer.id

  const row = await prisma.subscription.findFirst({
    where: { providerCustomerId: customerId },
    select: { organizationId: true },
  })
  if (row) return row.organizationId

  if (typeof customer !== 'string' && !customer.deleted) {
    const fromMetadata = (customer as Stripe.Customer).metadata?.organizationId
    if (typeof fromMetadata === 'string' && fromMetadata) return fromMetadata
  }
  return null
}

function toDate(seconds: number | null | undefined): Date | null {
  if (!seconds) return null
  return new Date(seconds * 1000)
}

function defaultCardFrom(
  subscription: Stripe.Subscription,
): { brand: string; last4: string } | null {
  const method = subscription.default_payment_method
  if (!method || typeof method === 'string') return null
  if (method.type !== 'card' || !method.card) return null
  return { brand: method.card.brand, last4: method.card.last4 }
}

/**
 * Re-read a subscription from Stripe and apply it.
 *
 * Used on return from Checkout. The browser's success URL is not evidence;
 * this asks Stripe directly.
 */
export async function refreshFromStripe(session: AppSession, checkoutSessionId?: string | null) {
  const config = readStripeConfigFromEnv()
  if (!config) return

  const client = stripe()

  if (checkoutSessionId && checkoutSessionId !== 'cancelled') {
    const checkout = await client.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ['subscription', 'subscription.default_payment_method'],
    })

    // The Checkout session must belong to this company. Otherwise anyone could
    // paste someone else's session id onto their own billing page.
    if (checkout.client_reference_id !== session.organizationId) return

    const subscription = checkout.subscription
    if (subscription && typeof subscription !== 'string') {
      await syncFromStripe(subscription, { organizationId: session.organizationId })
      return
    }
  }

  const stored = await prisma.subscription.findUnique({
    where: { organizationId: session.organizationId },
    select: { providerSubscriptionId: true },
  })
  if (!stored?.providerSubscriptionId) return

  const subscription = await client.subscriptions.retrieve(stored.providerSubscriptionId, {
    expand: ['default_payment_method'],
  })
  await syncFromStripe(subscription, { organizationId: session.organizationId })
}
