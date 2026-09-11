'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { SubmitButton } from '@/components/ui/submit-button'
import { AddressFields } from '@/components/app/address-fields'
import type { FormState } from '@/lib/form'
import { createPropertyAction } from './actions'

export function NewPropertyForm({ customerId }: { customerId: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(createPropertyAction, {})

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="customerId" value={customerId} />
      <Card>
        <div className="space-y-4">
          <AddressFields values={state.values} fieldErrors={state.fieldErrors} />
        </div>
      </Card>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <SubmitButton size="lg" fullWidth pendingLabel="Saving…">
        Save property
      </SubmitButton>
    </form>
  )
}
