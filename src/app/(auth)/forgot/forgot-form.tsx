'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Alert } from '@/components/ui/alert'
import { Field, Input } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import type { FormState } from '@/lib/form'
import { requestResetAction } from './actions'

export function ForgotForm() {
  const [state, formAction] = useActionState<FormState, FormData>(requestResetAction, {})

  if (state.values?.submitted === 'yes') {
    return (
      <div className="mt-5 space-y-4">
        <Alert tone="success" title="Check your email">
          If that address has an account, a reset link is on its way. It expires in an hour.
        </Alert>
        <p className="text-sm leading-relaxed text-ink-muted">
          Nothing arrived? Check your spam folder, then try again — and make sure you used the
          address you sign in with.
        </p>
        <Link
          href="/login"
          className="flex h-12 w-full items-center justify-center rounded-[--radius-control] border border-hairline-strong bg-surface font-semibold text-ink active:bg-surface-sunken"
        >
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <Field label="Email" error={state.fieldErrors?.email}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@company.com"
        />
      </Field>

      <SubmitButton size="lg" fullWidth pendingLabel="Sending…">
        Send reset link
      </SubmitButton>

      <p className="text-center text-sm text-ink-muted">
        <Link href="/login" className="font-semibold text-brand-600">
          Back to sign in
        </Link>
      </p>
    </form>
  )
}
