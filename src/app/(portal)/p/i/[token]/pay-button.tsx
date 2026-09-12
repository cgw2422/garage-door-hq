'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'
import type { FormState } from '@/lib/form'
import { portalStartPaymentAction } from '../../actions'

/**
 * Pay this invoice.
 *
 * Hands off to Stripe Checkout on the garage door company's own account. No
 * card field exists anywhere in this application, and nothing about the
 * invoice changes here — it is marked paid by the webhook that confirms the
 * payment, not by the customer landing back on this page.
 */
export function PayInvoiceButton({ token, amountLabel }: { token: string; amountLabel: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(portalStartPaymentAction, {})

  return (
    <form action={formAction} className="mt-4 space-y-2.5">
      <input type="hidden" name="token" value={token} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      <SubmitButton size="lg" fullWidth pendingLabel="Opening secure payment…">
        Pay {amountLabel}
      </SubmitButton>
      <p className="text-center text-xs leading-relaxed text-ink-subtle">
        Secure card payment handled by Stripe.
      </p>
    </form>
  )
}
