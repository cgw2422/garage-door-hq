'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'
import type { FormState } from '@/lib/form'
import { openBillingPortalAction, startSubscriptionAction } from './actions'

/**
 * The two buttons that matter.
 *
 * Both hand off to a Stripe-hosted page. Card entry, invoices, cancellation
 * and payment-method changes all happen there — this application never sees a
 * card number and never will.
 */

export function StartSubscriptionButton({ disabled, reason }: { disabled: boolean; reason: string | null }) {
  const [state, formAction] = useActionState<FormState, FormData>(startSubscriptionAction, {})

  return (
    <form action={formAction} className="space-y-2.5">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <SubmitButton size="lg" fullWidth disabled={disabled} pendingLabel="Opening checkout…">
        Activate Garage Door HQ — $39.99/month
      </SubmitButton>
      {disabled && reason ? (
        <p className="text-center text-xs leading-relaxed text-ink-subtle">{reason}</p>
      ) : (
        <p className="text-center text-xs leading-relaxed text-ink-subtle">
          You&apos;ll be taken to Stripe to enter your card. Cancel any time.
        </p>
      )}
    </form>
  )
}

export function ManageBillingButton({ disabled }: { disabled: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(openBillingPortalAction, {})

  return (
    <form action={formAction} className="space-y-2.5">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <SubmitButton variant="secondary" fullWidth disabled={disabled} pendingLabel="Opening…">
        Manage billing
      </SubmitButton>
      <p className="text-center text-xs leading-relaxed text-ink-subtle">
        Update your card, download invoices, or cancel — all on Stripe.
      </p>
    </form>
  )
}
