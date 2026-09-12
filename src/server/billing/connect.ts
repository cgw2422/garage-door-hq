import type Stripe from 'stripe'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import type { AppSession } from '@/lib/session'
import { platformBranding } from '@/server/email/branding'
import { BillingNotConfiguredError, readStripeConfigFromEnv, stripe } from './stripe'

/**
 * The garage door company's own Stripe account.
 *
 * Every customer payment is a **direct charge on the connected account**:
 * funds settle in the company's Stripe balance and never pass through a Garage
 * Door HQ balance. Garage Door HQ is not the merchant of record for a garage
 * door repair, does not hold anybody's money, and is not in the disputes.
 *
 * The reasoning, the alternatives that were rejected, and what changes if this
 * is ever revisited are in docs/PAYMENT-MODEL.md. Read that before changing
 * anything in this file — the decisions here are legal before they are
 * technical.
 */

export class ConnectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConnectError'
  }
}

export interface ConnectStatus {
  connected: boolean
  /** True only when the company can actually take a card right now. */
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  providerAccountId: string | null
  requirementsNote: string | null
  connectedAt: Date | null
  lastSyncedAt: Date | null
  /** False when no Stripe key is set at all. */
  configured: boolean
}

export async function loadConnectStatus(session: AppSession): Promise<ConnectStatus> {
  const account = await session.db.paymentAccount.findUnique({
    where: { organizationId: session.organizationId },
  })
  const configured = readStripeConfigFromEnv() !== null

  return {
    connected: Boolean(account && !account.disconnectedAt),
    chargesEnabled: account?.chargesEnabled ?? false,
    payoutsEnabled: account?.payoutsEnabled ?? false,
    detailsSubmitted: account?.detailsSubmitted ?? false,
    providerAccountId: account?.providerAccountId ?? null,
    requirementsNote: account?.requirementsNote ?? null,
    connectedAt: account?.connectedAt ?? null,
    lastSyncedAt: account?.lastSyncedAt ?? null,
    configured,
  }
}

/**
 * Begin onboarding.
 *
 * Creates a Standard account and returns a Stripe-hosted onboarding link. A
 * company that already has a Stripe account signs into it during this flow and
 * keeps it — that is the point of Standard.
 */
export async function startConnectOnboarding(session: AppSession): Promise<{ url: string }> {
  const config = readStripeConfigFromEnv()
  if (!config) throw new BillingNotConfiguredError('Payments are not connected in this deployment.')

  const client = stripe()
  const platform = platformBranding()

  const existing = await prisma.paymentAccount.findUnique({
    where: { organizationId: session.organizationId },
  })

  let accountId = existing && !existing.disconnectedAt ? existing.providerAccountId : null

  if (!accountId) {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: session.organizationId },
      select: { name: true, email: true, country: true },
    })

    const account = await client.accounts.create(
      {
        type: 'standard',
        country: organization.country || 'US',
        email: organization.email ?? session.email,
        business_profile: {
          name: organization.name,
          // Garage door services. Helps Stripe's own risk review go smoothly.
          mcc: '1731',
        },
        metadata: { organizationId: session.organizationId },
      },
      { idempotencyKey: `connect-account:${session.organizationId}` },
    )
    accountId = account.id

    await prisma.paymentAccount.upsert({
      where: { organizationId: session.organizationId },
      create: {
        organizationId: session.organizationId,
        provider: 'stripe',
        providerAccountId: account.id,
        accountType: 'standard',
        country: organization.country || 'US',
      },
      update: {
        providerAccountId: account.id,
        disconnectedAt: null,
      },
    })

    await recordAudit({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: 'payments.connect_started',
      entityType: 'PaymentAccount',
      entityId: account.id,
    })
  }

  const link = await client.accountLinks.create({
    account: accountId,
    refresh_url: `${platform.appUrl}/settings/payments?refresh=1`,
    return_url: `${platform.appUrl}/settings/payments?connected=1`,
    type: 'account_onboarding',
  })

  return { url: link.url }
}

/**
 * Ask Stripe what the account can actually do.
 *
 * Never inferred from the fact that someone came back from onboarding — a
 * person can abandon it halfway and still land on the return URL.
 */
export async function syncConnectAccount(params: {
  organizationId: string
  providerAccountId?: string | null
}): Promise<ConnectStatus | null> {
  const config = readStripeConfigFromEnv()
  if (!config) return null

  const stored = await prisma.paymentAccount.findUnique({
    where: { organizationId: params.organizationId },
  })
  const accountId = params.providerAccountId ?? stored?.providerAccountId
  if (!accountId) return null

  const account = await stripe().accounts.retrieve(accountId)
  return applyConnectAccount(params.organizationId, account)
}

/** Write a Stripe account object onto our row. Idempotent. */
export async function applyConnectAccount(
  organizationId: string,
  account: Stripe.Account,
): Promise<ConnectStatus> {
  const due = account.requirements?.currently_due ?? []
  const disabledReason = account.requirements?.disabled_reason ?? null

  const updated = await prisma.paymentAccount.upsert({
    where: { organizationId },
    create: {
      organizationId,
      provider: 'stripe',
      providerAccountId: account.id,
      accountType: account.type ?? 'standard',
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
      country: account.country ?? 'US',
      defaultCurrency: (account.default_currency ?? 'usd').toUpperCase(),
      connectedAt: account.charges_enabled ? new Date() : null,
      lastSyncedAt: new Date(),
      requirementsNote: summarizeRequirements(due, disabledReason),
    },
    update: {
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
      country: account.country ?? 'US',
      defaultCurrency: (account.default_currency ?? 'usd').toUpperCase(),
      lastSyncedAt: new Date(),
      requirementsNote: summarizeRequirements(due, disabledReason),
      disconnectedAt: null,
    },
  })

  return {
    connected: true,
    chargesEnabled: updated.chargesEnabled,
    payoutsEnabled: updated.payoutsEnabled,
    detailsSubmitted: updated.detailsSubmitted,
    providerAccountId: updated.providerAccountId,
    requirementsNote: updated.requirementsNote,
    connectedAt: updated.connectedAt,
    lastSyncedAt: updated.lastSyncedAt,
    configured: true,
  }
}

/**
 * Stripe's requirement keys are machine names ("individual.id_number"). This
 * turns them into something an owner can act on without listing every one.
 */
function summarizeRequirements(due: string[], disabledReason: string | null): string | null {
  if (disabledReason) {
    return 'Stripe needs more information before this account can take payments. Open your Stripe dashboard to finish.'
  }
  if (due.length === 0) return null
  return `Stripe is still waiting on ${due.length} ${due.length === 1 ? 'detail' : 'details'} before payments can go live. Open your Stripe dashboard to finish.`
}

/**
 * Stop offering card payment.
 *
 * Deliberately does not delete the Stripe account — it is theirs, not ours,
 * and it holds their transaction history. This only stops this product
 * offering it.
 */
export async function disconnectPaymentAccount(session: AppSession) {
  const account = await session.db.paymentAccount.findUnique({
    where: { organizationId: session.organizationId },
  })
  if (!account) throw new ConnectError('There is no connected payment account.')

  await prisma.paymentAccount.update({
    where: { organizationId: session.organizationId },
    data: { disconnectedAt: new Date(), chargesEnabled: false, payoutsEnabled: false },
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'payments.disconnected',
    entityType: 'PaymentAccount',
    entityId: account.providerAccountId,
  })
}

/** A Stripe dashboard link for the company's own account. */
export async function connectDashboardLink(session: AppSession): Promise<string> {
  const account = await session.db.paymentAccount.findUnique({
    where: { organizationId: session.organizationId },
    select: { providerAccountId: true },
  })
  if (!account) throw new ConnectError('There is no connected payment account.')

  // Standard accounts own their dashboard, so this is just the URL — there is
  // no platform-issued login link for us to create, and no reason for one.
  return `https://dashboard.stripe.com/${account.providerAccountId}`
}
