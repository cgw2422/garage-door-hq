'use client'

import { useActionState, useState } from 'react'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  archiveCustomerAction,
  restoreCustomerAction,
  updateCustomerAction,
} from '@/app/actions/records'

export function EditCustomerForm({
  customer,
  canArchive,
}: {
  customer: {
    id: string
    firstName: string
    lastName: string
    companyName: string
    phone: string
    altPhone: string
    email: string
    notesSummary: string
    isArchived: boolean
  }
  canArchive: boolean
}) {
  const [state, formAction] = useActionState<FormState, FormData>(updateCustomerAction, {})
  const [archiveState, archive] = useActionState<FormState, FormData>(archiveCustomerAction, {})
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="customerId" value={customer.id} />

        <Card>
          <CardHeader title="Details" />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" error={state.fieldErrors?.firstName}>
                <Input name="firstName" required defaultValue={customer.firstName} />
              </Field>
              <Field label="Last name" error={state.fieldErrors?.lastName}>
                <Input name="lastName" required defaultValue={customer.lastName} />
              </Field>
            </div>

            <Field label="Company">
              <Input name="companyName" defaultValue={customer.companyName} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <Input name="phone" type="tel" defaultValue={customer.phone} />
              </Field>
              <Field label="Other phone">
                <Input name="altPhone" type="tel" defaultValue={customer.altPhone} />
              </Field>
            </div>

            <Field label="Email" error={state.fieldErrors?.email}>
              <Input name="email" type="email" defaultValue={customer.email} />
            </Field>

            <Field label="Notes">
              <Textarea name="notesSummary" rows={3} defaultValue={customer.notesSummary} />
            </Field>
          </div>
        </Card>

        {state.error ? <Alert>{state.error}</Alert> : null}

        <SubmitButton size="lg" fullWidth pendingLabel="Saving…">
          Save changes
        </SubmitButton>
      </form>

      <p className="px-1 text-xs leading-relaxed text-ink-subtle">
        Editing a customer does not change estimates or invoices they are already on — those
        keep the details they were created with.
      </p>

      {canArchive ? (
        <Card>
          <CardHeader title="Archive" />
          {customer.isArchived ? (
            <form action={restoreCustomerAction}>
              <input type="hidden" name="customerId" value={customer.id} />
              <SubmitButton variant="secondary" fullWidth pendingLabel="Restoring…">
                Restore this customer
              </SubmitButton>
            </form>
          ) : confirming ? (
            <form action={archive} className="space-y-2.5">
              <input type="hidden" name="customerId" value={customer.id} />
              <p className="text-sm text-ink-muted">
                Archiving hides them from lists and search. Their jobs, invoices and payment
                history stay exactly as they are.
              </p>
              {archiveState.error ? <Alert>{archiveState.error}</Alert> : null}
              <div className="flex gap-2.5">
                <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <SubmitButton variant="danger" fullWidth pendingLabel="Archiving…">
                  Archive
                </SubmitButton>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="secondary"
              fullWidth
              className="text-danger-600"
              onClick={() => setConfirming(true)}
            >
              Archive this customer
            </Button>
          )}
        </Card>
      ) : null}
    </>
  )
}
