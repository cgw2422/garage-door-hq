'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { AddressFields } from '@/components/app/address-fields'
import type { FormState } from '@/lib/form'
import { createCustomerAction } from './actions'

export function NewCustomerForm() {
  const [state, formAction] = useActionState<FormState, FormData>(createCustomerAction, {})

  return (
    <form action={formAction} className="space-y-4">
      <Card>
        <CardHeader title="Customer" />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" error={state.fieldErrors?.firstName}>
              <Input name="firstName" required autoFocus defaultValue={state.values?.firstName} />
            </Field>
            <Field label="Last name" error={state.fieldErrors?.lastName}>
              <Input name="lastName" required defaultValue={state.values?.lastName} />
            </Field>
          </div>

          <Field label="Company" hint="Leave blank for a homeowner.">
            <Input name="companyName" defaultValue={state.values?.companyName} />
          </Field>

          <Field label="Phone" error={state.fieldErrors?.phone}>
            <Input
              name="phone"
              type="tel"
              inputMode="tel"
              placeholder="(555) 234-5678"
              defaultValue={state.values?.phone}
            />
          </Field>

          <Field label="Email" error={state.fieldErrors?.email}>
            <Input name="email" type="email" inputMode="email" defaultValue={state.values?.email} />
          </Field>

          <Field label="Notes">
            <Textarea name="notesSummary" rows={2} defaultValue={state.values?.notesSummary} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Service Address" />
        <p className="mb-4 -mt-1 text-sm text-ink-muted">
          Optional now — but adding it takes you straight to the door.
        </p>
        <div className="space-y-4">
          <AddressFields
            prefix="property."
            required={false}
            values={state.values}
            fieldErrors={state.fieldErrors}
          />
        </div>
      </Card>

      {state.error ? <Alert>{state.error}</Alert> : null}

      <SubmitButton size="lg" fullWidth pendingLabel="Saving…">
        Save customer
      </SubmitButton>
    </form>
  )
}
