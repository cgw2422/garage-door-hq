'use client'

import { useActionState, useState } from 'react'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  archivePropertyAction,
  restorePropertyAction,
  updatePropertyAction,
} from '@/app/actions/records'

export function EditPropertyForm({
  property,
  canArchive,
}: {
  property: {
    id: string
    customerId: string
    nickname: string
    line1: string
    line2: string
    city: string
    state: string
    postalCode: string
    kind: string
    accessInstructions: string
    gateInfo: string
    isArchived: boolean
  }
  canArchive: boolean
}) {
  const [state, formAction] = useActionState<FormState, FormData>(updatePropertyAction, {})
  const [archiveState, archive] = useActionState<FormState, FormData>(archivePropertyAction, {})
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="propertyId" value={property.id} />

        <Card>
          <CardHeader title="Address" />
          <div className="space-y-4">
            <Field label="Nickname" hint="Home, Rental, Main Shop…">
              <Input name="nickname" defaultValue={property.nickname} />
            </Field>

            <Field label="Street address" error={state.fieldErrors?.line1}>
              <Input name="line1" required defaultValue={property.line1} />
            </Field>

            <Field label="Unit / suite">
              <Input name="line2" defaultValue={property.line2} />
            </Field>

            <div className="grid grid-cols-[1fr_5rem] gap-3">
              <Field label="City" error={state.fieldErrors?.city}>
                <Input name="city" required defaultValue={property.city} />
              </Field>
              <Field label="State" error={state.fieldErrors?.state}>
                <Input
                  name="state"
                  required
                  maxLength={2}
                  className="uppercase"
                  defaultValue={property.state}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="ZIP" error={state.fieldErrors?.postalCode}>
                <Input name="postalCode" required inputMode="numeric" defaultValue={property.postalCode} />
              </Field>
              <Field label="Type">
                <Select name="kind" defaultValue={property.kind}>
                  <option value="RESIDENTIAL">Residential</option>
                  <option value="COMMERCIAL">Commercial</option>
                </Select>
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Getting in" />
          <div className="space-y-4">
            <Field label="Access instructions">
              <Textarea
                name="accessInstructions"
                rows={2}
                defaultValue={property.accessInstructions}
                placeholder="Gate code, dog, park in the driveway…"
              />
            </Field>
            <Field label="Gate information">
              <Input name="gateInfo" defaultValue={property.gateInfo} />
            </Field>
          </div>
        </Card>

        {state.error ? <Alert>{state.error}</Alert> : null}

        <SubmitButton size="lg" fullWidth pendingLabel="Saving…">
          Save changes
        </SubmitButton>
      </form>

      {canArchive ? (
        <Card>
          <CardHeader title="Archive" />
          {property.isArchived ? (
            <form action={restorePropertyAction}>
              <input type="hidden" name="propertyId" value={property.id} />
              <SubmitButton variant="secondary" fullWidth pendingLabel="Restoring…">
                Restore this property
              </SubmitButton>
            </form>
          ) : confirming ? (
            <form action={archive} className="space-y-2.5">
              <input type="hidden" name="propertyId" value={property.id} />
              <input type="hidden" name="customerId" value={property.customerId} />
              <p className="text-sm text-ink-muted">
                The doors at this address and their service history are kept.
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
              Archive this property
            </Button>
          )}
        </Card>
      ) : null}
    </>
  )
}
