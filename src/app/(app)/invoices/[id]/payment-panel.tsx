'use client'

import { useActionState, useState } from 'react'
import { formatCents } from '@/lib/money'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { recordPaymentAction, sendInvoiceAction } from './actions'

/**
 * Manual payment recording.
 *
 * "Card" here means the customer paid by card somewhere else and it is being
 * written down. No card number is ever collected: when a real processor is
 * integrated it will own that flow and this panel will record its result.
 */
export function PaymentPanel({
  invoiceId,
  balanceCents,
  currency,
  status,
  openByDefault,
  canRecord,
  canSend,
}: {
  invoiceId: string
  balanceCents: number
  currency: string
  status: string
  openByDefault: boolean
  canRecord: boolean
  canSend: boolean
}) {
  const [open, setOpen] = useState(openByDefault)
  const [state, formAction] = useActionState<FormState, FormData>(recordPaymentAction, {})
  const [sendState, sendAction] = useActionState<FormState, FormData>(sendInvoiceAction, {})

  if (balanceCents <= 0) {
    return (
      <Alert tone="success" title="Paid in full">
        Nothing outstanding on this invoice.
      </Alert>
    )
  }

  return (
    <>
      {status === 'DRAFT' && canSend ? (
        <form action={sendAction}>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <SubmitButton variant="secondary" size="lg" fullWidth pendingLabel="Sending…">
            Mark invoice sent
          </SubmitButton>
          {sendState.error ? <Alert className="mt-2">{sendState.error}</Alert> : null}
        </form>
      ) : null}

      {canRecord ? (
        open ? (
          <Card>
            <CardHeader title="Record a payment" />
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="invoiceId" value={invoiceId} />

              <Field label="Method">
                <Select name="method" defaultValue="CARD">
                  <option value="CARD">Card</option>
                  <option value="CASH">Cash</option>
                  <option value="CHECK">Check</option>
                  <option value="ACH">Bank transfer / ACH</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount" error={state.fieldErrors?.amountDollars}>
                  <Input
                    name="amountDollars"
                    inputMode="decimal"
                    className="num text-lg font-semibold"
                    defaultValue={(balanceCents / 100).toFixed(2)}
                    required
                  />
                </Field>
                <Field label="Processing fee" hint="Optional — feeds job profit.">
                  <Input name="feeDollars" inputMode="decimal" className="num" placeholder="0.00" />
                </Field>
              </div>

              <Field label="Reference" hint="Check number, last four, confirmation code.">
                <Input name="reference" />
              </Field>

              {state.error ? <Alert>{state.error}</Alert> : null}

              <p className="text-xs leading-relaxed text-ink-subtle">
                Garage Door HQ does not store card numbers. Record what was collected elsewhere.
              </p>

              <div className="flex gap-2.5">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <SubmitButton fullWidth pendingLabel="Recording…">
                  Record {formatCents(balanceCents, { currency, showCents: false })}
                </SubmitButton>
              </div>
            </form>
          </Card>
        ) : (
          <Button size="lg" fullWidth onClick={() => setOpen(true)}>
            Take payment
          </Button>
        )
      ) : null}
    </>
  )
}
