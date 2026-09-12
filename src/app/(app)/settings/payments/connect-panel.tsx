'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'
import type { FormState } from '@/lib/form'
import { connectStripeAction, disconnectStripeAction } from './actions'

export function ConnectStripeButton({ label, disabled }: { label: string; disabled: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(connectStripeAction, {})

  return (
    <form action={formAction} className="space-y-2.5">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <SubmitButton size="lg" fullWidth disabled={disabled} pendingLabel="Opening Stripe…">
        {label}
      </SubmitButton>
    </form>
  )
}

export function DisconnectButton() {
  const [state, formAction] = useActionState<FormState, FormData>(disconnectStripeAction, {})

  return (
    <form action={formAction} className="space-y-2.5">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.values?.disconnected === 'yes' ? (
        <Alert tone="success">
          Card payment is switched off. Your Stripe account and its history are untouched.
        </Alert>
      ) : null}
      <SubmitButton variant="secondary" fullWidth pendingLabel="Switching off…">
        Stop taking card payments
      </SubmitButton>
      <p className="text-xs leading-relaxed text-ink-subtle">
        This only stops Garage Door HQ offering card payment. Your Stripe account stays yours,
        with all of its history.
      </p>
    </form>
  )
}
