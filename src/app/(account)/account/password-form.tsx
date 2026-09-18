'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, Input } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'
import type { FormState } from '@/lib/form'
import { changePasswordAction } from './actions'

export function PasswordForm() {
  const [state, formAction] = useActionState<FormState, FormData>(changePasswordAction, {})

  return (
    <form action={formAction} className="mt-3 space-y-4">
      <Field label="Current password" error={state.fieldErrors?.currentPassword}>
        <Input name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>

      <Field
        label="New password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={state.fieldErrors?.password}
      >
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>

      <Field label="Confirm new password" error={state.fieldErrors?.confirm}>
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>

      {state.error ? <Alert>{state.error}</Alert> : null}

      <SubmitButton pendingLabel="Saving…">Change password</SubmitButton>

      <p className="text-xs leading-relaxed text-ink-subtle">
        This signs you out on every device, including this one, so you will sign in again with
        the new password. That is the point — a password change that left other sessions running
        would not have removed anybody.
      </p>
    </form>
  )
}
