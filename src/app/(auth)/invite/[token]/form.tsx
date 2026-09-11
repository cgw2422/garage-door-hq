'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Field, Input } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { acceptInvitationAction } from '@/app/(app)/settings/team/actions'

export function AcceptInviteForm({
  token,
  email,
  hasAccount,
  firstName,
}: {
  token: string
  email: string
  hasAccount: boolean
  firstName: string | null
}) {
  const [state, formAction] = useActionState<FormState, FormData>(acceptInvitationAction, {})

  if (state.values?.accepted === 'yes' && hasAccount) {
    return (
      <div className="mt-5">
        <Alert tone="success" title="You're on the team">
          Sign in with {email} to get started.
        </Alert>
        <Link
          href="/login"
          className="mt-3 inline-block font-semibold text-brand-600"
        >
          Go to sign in
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="token" value={token} />

      <Field label="Email">
        <Input value={email} readOnly disabled />
      </Field>

      {hasAccount ? (
        <p className="text-sm text-ink-muted">
          You already have a Garage Door HQ account
          {firstName ? `, ${firstName}` : ''}. Accepting adds this company to it.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" error={state.fieldErrors?.firstName}>
              <Input name="firstName" autoComplete="given-name" required />
            </Field>
            <Field label="Last name" error={state.fieldErrors?.lastName}>
              <Input name="lastName" autoComplete="family-name" required />
            </Field>
          </div>

          <Field
            label="Choose a password"
            hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            error={state.fieldErrors?.password}
          >
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
            />
          </Field>
        </>
      )}

      {state.error ? <Alert>{state.error}</Alert> : null}

      <SubmitButton size="lg" fullWidth pendingLabel="Joining…">
        Join the team
      </SubmitButton>
    </form>
  )
}
