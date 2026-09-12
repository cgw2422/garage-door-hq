import type { Subscription, SubscriptionStatus } from '@prisma/client'

/**
 * What an account is allowed to do, given its subscription.
 *
 * This is a pure function of the subscription row and the clock. It does no
 * I/O, so it can be reasoned about and tested directly, and it is the single
 * place the rules live — the server actions, the page loaders and the banners
 * all ask it rather than each deciding for themselves.
 *
 * The rules, in the product's own words:
 *
 * - **Trial** — full access. A countdown and an activate button, not a
 *   paywall. Nobody gets nagged with a full-screen interruption on day three.
 * - **Active** — full access.
 * - **Complimentary** — full access, granted by platform staff, and it ignores
 *   Stripe entirely while it lasts.
 * - **Past due** — full access. Stripe retries a failed card on its own
 *   schedule for a couple of weeks; destroying someone's ability to run their
 *   business over one expired card is the wrong trade. They see the problem
 *   every time they open the app.
 * - **Expired trial / cancelled** — read-only. Everything is still there,
 *   still visible, still exportable. They simply cannot create new operational
 *   data until they activate.
 *
 * Nothing here ever deletes anything. There is no state in this file that
 * leads to data loss.
 *
 * ---
 *
 * Where the line falls, on a read-only account
 *
 * **Blocked** — starting new work: new customers, properties, doors and jobs;
 * quoting anything; moving inventory; inviting a team member. These are the
 * things that would let a company run indefinitely without paying.
 *
 * **Allowed** — finishing work that already exists: moving a job through its
 * statuses, completing it, signing an estimate that was already presented, and
 * recording a payment on an invoice that already went out. Also: reading
 * everything, editing company settings, and opening billing.
 *
 * That second list is a deliberate judgement. A trial can end at 9am while a
 * technician is standing in someone's garage halfway through a spring
 * replacement; refusing to let them finish would strand a real job, leave the
 * inventory ledger wrong and punish the customer, who has done nothing. The
 * restriction exists to stop new business being run for free, and letting the
 * last job close does not do that. Recording a payment is the same argument:
 * the money is for work already delivered on an invoice already sent.
 */

export type AccessLevel = 'full' | 'read_only'

export interface AccessState {
  level: AccessLevel
  status: SubscriptionStatus
  /** True while the account is in its free trial. */
  isTrialing: boolean
  /** Whole days left in the trial; zero on the last day, null when not trialing. */
  trialDaysLeft: number | null
  /** True when a card has failed and Stripe is retrying. */
  isPastDue: boolean
  /** True when access is a platform-granted comp. */
  isComplimentary: boolean
  /** Why the account is restricted, in the words shown to the owner. */
  restrictionReason: string | null
  /** Whether an owner should be prompted to activate. */
  needsActivation: boolean
}

/** The message shown when a mutation is blocked. Deliberately calm. */
export const RESTRICTED_MESSAGE =
  'Your Garage Door HQ trial has ended. Your data is safe. Activate for $39.99/month to continue running your business.'

export const CANCELLED_MESSAGE =
  'Your Garage Door HQ subscription has been cancelled. Your data is safe and stays visible. Activate for $39.99/month to start working again.'

type SubscriptionLike = Pick<
  Subscription,
  'status' | 'trialEndsAt' | 'currentPeriodEnd' | 'complimentaryUntil' | 'cancelledAt'
>

export function accessStateFor(
  subscription: SubscriptionLike | null,
  now = new Date(),
): AccessState {
  // No subscription row at all should not happen — provisioning creates one —
  // but if it ever did, the safe answer is to let them work and let the
  // platform notice, not to lock a paying customer out over our own bug.
  if (!subscription) {
    return {
      level: 'full',
      status: 'TRIALING',
      isTrialing: false,
      trialDaysLeft: null,
      isPastDue: false,
      isComplimentary: false,
      restrictionReason: null,
      needsActivation: true,
    }
  }

  // A live comp beats everything, including a Stripe state that has gone
  // stale, because it is a deliberate decision by a person.
  const complimentaryLive =
    subscription.status === 'COMPLIMENTARY' &&
    (subscription.complimentaryUntil === null ||
      subscription.complimentaryUntil.getTime() > now.getTime())

  if (complimentaryLive) {
    return {
      level: 'full',
      status: 'COMPLIMENTARY',
      isTrialing: false,
      trialDaysLeft: null,
      isPastDue: false,
      isComplimentary: true,
      restrictionReason: null,
      needsActivation: false,
    }
  }

  if (subscription.status === 'ACTIVE') {
    return {
      level: 'full',
      status: 'ACTIVE',
      isTrialing: false,
      trialDaysLeft: null,
      isPastDue: false,
      isComplimentary: false,
      restrictionReason: null,
      needsActivation: false,
    }
  }

  if (subscription.status === 'PAST_DUE') {
    return {
      level: 'full',
      status: 'PAST_DUE',
      isTrialing: false,
      trialDaysLeft: null,
      isPastDue: true,
      isComplimentary: false,
      restrictionReason: null,
      needsActivation: false,
    }
  }

  if (subscription.status === 'TRIALING') {
    const endsAt = subscription.trialEndsAt
    // A trial with no end date is a data problem, not a reason to lock anyone
    // out; treat it as running.
    if (!endsAt) {
      return {
        level: 'full',
        status: 'TRIALING',
        isTrialing: true,
        trialDaysLeft: null,
        isPastDue: false,
        isComplimentary: false,
        restrictionReason: null,
        needsActivation: true,
      }
    }

    if (endsAt.getTime() > now.getTime()) {
      return {
        level: 'full',
        status: 'TRIALING',
        isTrialing: true,
        trialDaysLeft: daysBetween(now, endsAt),
        isPastDue: false,
        isComplimentary: false,
        restrictionReason: null,
        needsActivation: true,
      }
    }

    // The trial ran out and no payment arrived.
    return {
      level: 'read_only',
      status: 'TRIALING',
      isTrialing: false,
      trialDaysLeft: 0,
      isPastDue: false,
      isComplimentary: false,
      restrictionReason: RESTRICTED_MESSAGE,
      needsActivation: true,
    }
  }

  // CANCELLED, EXPIRED, or a comp that has run out.
  const cancelled = subscription.status === 'CANCELLED'
  return {
    level: 'read_only',
    status: subscription.status,
    isTrialing: false,
    trialDaysLeft: null,
    isPastDue: false,
    isComplimentary: false,
    restrictionReason: cancelled ? CANCELLED_MESSAGE : RESTRICTED_MESSAGE,
    needsActivation: true,
  }
}

/** Whole days from now until then, never negative. */
function daysBetween(now: Date, then: Date): number {
  const ms = then.getTime() - now.getTime()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

/**
 * The nudge shown in the app while a trial runs.
 *
 * Returns null when there is nothing worth saying, so the banner simply does
 * not render rather than every screen deciding for itself.
 */
export function billingNotice(
  access: AccessState,
): { tone: 'info' | 'warning' | 'danger'; title: string; body: string; cta: string } | null {
  if (access.isComplimentary) return null

  if (access.isPastDue) {
    return {
      tone: 'danger',
      title: 'Your last payment did not go through',
      body: 'We will keep trying your card. Update your payment method to avoid any interruption.',
      cta: 'Update payment method',
    }
  }

  if (access.level === 'read_only') {
    return {
      tone: 'danger',
      title:
        access.status === 'CANCELLED'
          ? 'Your subscription has been cancelled'
          : 'Your trial has ended',
      body: access.restrictionReason ?? RESTRICTED_MESSAGE,
      cta: 'Activate Garage Door HQ',
    }
  }

  if (access.isTrialing && access.trialDaysLeft !== null) {
    // Quiet for most of the trial; louder as it runs out.
    if (access.trialDaysLeft > 5) return null
    return {
      tone: access.trialDaysLeft <= 2 ? 'warning' : 'info',
      title:
        access.trialDaysLeft === 0
          ? 'Your trial ends today'
          : `Trial ends in ${access.trialDaysLeft} ${access.trialDaysLeft === 1 ? 'day' : 'days'}`,
      body: 'Everything is included for $39.99/month. No per-user fee, no technician fee.',
      cta: 'Activate Garage Door HQ — $39.99/month',
    }
  }

  return null
}
