'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, Input } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'
import type { FormState } from '@/lib/form'
import { signUp } from './actions'

export function SignupForm({ referralCode }: { referralCode: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(signUp, {})

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="referralCode" value={referralCode} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" error={state.fieldErrors?.firstName}>
          <Input
            name="firstName"
            autoComplete="given-name"
            required
            defaultValue={state.values?.firstName}
          />
        </Field>
        <Field label="Last name" error={state.fieldErrors?.lastName}>
          <Input
            name="lastName"
            autoComplete="family-name"
            required
            defaultValue={state.values?.lastName}
          />
        </Field>
      </div>

      <Field label="Email" error={state.fieldErrors?.email}>
        <Input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
        />
      </Field>

      <Field
        label="Password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={state.fieldErrors?.password}
      >
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>

      {state.error ? <Alert>{state.error}</Alert> : null}

      <SubmitButton size="lg" fullWidth pendingLabel="Creating your account…">
        Create account
      </SubmitButton>
    </form>
  )
}
