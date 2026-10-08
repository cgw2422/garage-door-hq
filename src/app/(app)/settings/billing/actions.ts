'use server'

import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { failure, type FormState } from '@/lib/form'
import { createCheckoutSession, createPortalSession, refreshFromStripe } from '@/server/billing/service'
import { friendlyStripeError } from '@/server/billing/stripe'

/**
 * Billing is the owner's alone.
 *
 * `subscription:manage` is granted to OWNER and nobody else — not admins, not
 * the office. Spending the company's money is not a delegated task.
 */

export async function startSubscriptionAction(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('subscription:manage')

  let url: string
  try {
    const checkout = await createCheckoutSession(session)
    url = checkout.url
  } catch (error) {
    return { error: friendlyStripeError(error) }
  }

  // Stripe's hosted page. No card details ever touch this application.
  redirect(url)
}

export async function openBillingPortalAction(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('subscription:manage')

  let url: string
  try {
    const portal = await createPortalSession(session)
    url = portal.url
  } catch (error) {
    return { error: friendlyStripeError(error) }
  }

  redirect(url)
}

/**
 * Re-read the subscription from Stripe, for the billing page's own render.
 *
 * Called when someone comes back from Checkout. The redirect is not evidence
 * of anything — this asks Stripe — and the webhook is still the primary path.
 * This exists so the page the owner is looking at is right immediately rather
 * than whenever the webhook lands.
 *
 * **It must not revalidate.** This runs *during* the render of the page that
 * is about to display the result, and Next refuses cache revalidation from
 * inside a render — it throws, and the owner gets a server-error screen on the
 * one page they reach seconds after paying. There is nothing to revalidate
 * anyway: the render that called this is the render that shows the answer.
 */
export async function refreshBillingOnLoad(checkoutSessionId?: string | null) {
  const session = await requirePermission('subscription:manage')
  try {
    await refreshFromStripe(session, checkoutSessionId ?? null)
  } catch (error) {
    // A refresh failing is not worth an error screen: the webhook will
    // reconcile it. Log and move on.
    void failure(error, undefined, 'billing.refresh')
  }
}
