'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, Input } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import type { FormState } from '@/lib/form'
import { saveCompany } from './actions'

export function CompanyForm({ referralCode }: { referralCode: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(saveCompany, {})

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="referralCode" value={referralCode} />
      {/* Resolved in the browser so estimates, schedules and "today" are right
          from the first screen instead of defaulting to the server's zone. */}
      <input
        type="hidden"
        name="timezone"
        defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
      />

      <Field label="Company name" error={state.fieldErrors?.name}>
        <Input
          name="name"
          required
          autoFocus
          placeholder="ABC Garage Doors"
          defaultValue={state.values?.name}
        />
      </Field>

      <Field label="Phone" error={state.fieldErrors?.phone}>
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 214-7788"
          defaultValue={state.values?.phone}
        />
      </Field>

      <Field label="ZIP code" error={state.fieldErrors?.postalCode}>
        <Input
          name="postalCode"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="28206"
          defaultValue={state.values?.postalCode}
        />
      </Field>

      {state.error ? <Alert>{state.error}</Alert> : null}

      <SubmitButton size="lg" fullWidth pendingLabel="Setting up…">
        Continue
      </SubmitButton>
    </form>
  )
}
