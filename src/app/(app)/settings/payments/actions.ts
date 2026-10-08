'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/session'
import { failure, type FormState } from '@/lib/form'
import { friendlyStripeError } from '@/server/billing/stripe'
import {
  disconnectPaymentAccount,
  startConnectOnboarding,
  syncConnectAccount,
} from '@/server/billing/connect'

/**
 * Connecting the company's own Stripe account is the owner's decision: it
 * involves their bank details and their legal entity.
 */

export async function connectStripeAction(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('subscription:manage')

  let url: string
  try {
    const link = await startConnectOnboarding(session)
    url = link.url
  } catch (error) {
    return { error: friendlyStripeError(error) }
  }

  redirect(url)
}

/**
 * Ask Stripe what the account can do.
 *
 * Called when someone returns from onboarding. Coming back from the return URL
 * proves nothing — a person can abandon the flow halfway and still land there.
 */
export async function refreshConnectOnLoad() {
  const session = await requirePermission('subscription:manage')
  try {
    await syncConnectAccount({ organizationId: session.organizationId })
  } catch (error) {
    void failure(error, undefined, 'payments.refresh')
  }
  // Deliberately does not revalidate. This runs during the render of the page
  // that displays the result, and Next throws when a render asks for cache
  // revalidation — which turned the return from Stripe Connect onboarding into
  // a server-error screen. There is nothing to revalidate anyway: the render
  // that called this is the render that shows the answer. A test enforces it.
}

export async function disconnectStripeAction(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('subscription:manage')
  try {
    await disconnectPaymentAccount(session)
  } catch (error) {
    return failure(error, undefined, 'payments.disconnect')
  }
  revalidatePath('/settings/payments')
  return { values: { disconnected: 'yes' } }
}
