'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, Input } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'
import type { FormState } from '@/lib/form'
import { completeResetAction } from './actions'

export function ResetForm({ token, email }: { token: string; email: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(completeResetAction, {})

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="token" value={token} />

      {/* Present but not editable: the token decides the account, never this. */}
      <Field label="Account">
        <Input value={email} readOnly disabled autoComplete="username" />
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

      <SubmitButton size="lg" fullWidth pendingLabel="Saving…">
        Set new password
      </SubmitButton>

      <p className="text-xs leading-relaxed text-ink-subtle">
        Setting a new password signs you out everywhere else.
      </p>
    </form>
  )
}
