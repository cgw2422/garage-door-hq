'use client'

import { useActionState, useState } from 'react'
import type { SubscriptionStatus } from '@prisma/client'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  endComplimentaryAction,
  extendTrialAction,
  grantComplimentaryAction,
} from '../../actions'

/**
 * Support actions.
 *
 * Each one is audited against the company it affects, so a customer can always
 * be told exactly what was changed on their account and by whom.
 */
export function SubscriptionControls({
  organizationId,
  status,
}: {
  organizationId: string
  status: SubscriptionStatus
}) {
  const [extendState, extend] = useActionState<FormState, FormData>(extendTrialAction, {})
  const [grantState, grant] = useActionState<FormState, FormData>(grantComplimentaryAction, {})
  const [endState, end] = useActionState<FormState, FormData>(endComplimentaryAction, {})
  const [showGrant, setShowGrant] = useState(false)

  return (
    <Card>
      <CardHeader title="Support actions" />

      <div className="space-y-5">
        <form action={extend} className="space-y-3">
          <input type="hidden" name="organizationId" value={organizationId} />
          <Field label="Extend the trial" hint="Adds days from whichever is later: today or the current end.">
            <div className="flex gap-2">
              <Input
                name="days"
                inputMode="numeric"
                className="num w-24"
                defaultValue="14"
                aria-label="Days"
              />
              <SubmitButton variant="secondary" pendingLabel="Extending…">
                Extend
              </SubmitButton>
            </div>
          </Field>
          {extendState.error ? <Alert>{extendState.error}</Alert> : null}
          {extendState.values?.saved === 'yes' ? (
            <Alert tone="success">Trial extended.</Alert>
          ) : null}
        </form>

        {status === 'COMPLIMENTARY' ? (
          <form action={end} className="space-y-3">
            <input type="hidden" name="organizationId" value={organizationId} />
            <Field label="End complimentary access" hint="What should the account move to?">
              <div className="flex gap-2">
                <Select name="newStatus" defaultValue="TRIALING" className="flex-1">
                  <option value="TRIALING">Back to trial</option>
                  <option value="ACTIVE">Active (billing)</option>
                  <option value="CANCELLED">Cancelled</option>
                </Select>
                <SubmitButton variant="secondary" pendingLabel="Ending…">
                  End
                </SubmitButton>
              </div>
            </Field>
            {endState.error ? <Alert>{endState.error}</Alert> : null}
            {endState.values?.saved === 'yes' ? (
              <Alert tone="success">Complimentary access ended.</Alert>
            ) : null}
          </form>
        ) : showGrant ? (
          <form action={grant} className="space-y-3">
            <input type="hidden" name="organizationId" value={organizationId} />
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <Field label="Months">
                <Input name="months" inputMode="numeric" className="num" defaultValue="3" />
              </Field>
              <Field label="Reason" hint="Recorded in the audit log.">
                <Input name="reason" required placeholder="Beta partner" />
              </Field>
            </div>
            {grantState.error ? <Alert>{grantState.error}</Alert> : null}
            {grantState.values?.saved === 'yes' ? (
              <Alert tone="success">Complimentary access granted.</Alert>
            ) : null}
            <SubmitButton variant="secondary" fullWidth pendingLabel="Granting…">
              Grant complimentary access
            </SubmitButton>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowGrant(true)}
            className="text-[0.9375rem] font-semibold text-brand-600"
          >
            Grant complimentary access
          </button>
        )}
      </div>
    </Card>
  )
}
