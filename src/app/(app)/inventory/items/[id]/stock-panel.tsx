'use client'

import { useActionState, useState } from 'react'
import { cn } from '@/lib/cn'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, Divider } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { Chip, type Tone } from '@/components/ui/status'
import { adjustStockAction, setMinimumAction, transferStockAction } from '../../actions'

const REASONS = [
  { value: 'RECEIVED', label: 'Received a shipment' },
  { value: 'RETURNED', label: 'Returned to the truck' },
  { value: 'CORRECTION_UP', label: 'Count correction — found more' },
  { value: 'CORRECTION_DOWN', label: 'Count correction — found fewer' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'LOST', label: 'Lost or stolen' },
  { value: 'USED_OFF_JOB', label: 'Used without a job' },
]

type Panel = 'none' | 'adjust' | 'transfer' | 'minimum'

export function ItemStockPanel({
  priceBookItemId,
  locationId,
  locationName,
  quantity,
  minQuantity,
  binLocation,
  tone,
  otherLocations,
}: {
  priceBookItemId: string
  locationId: string
  locationName: string
  quantity: number
  minQuantity: number
  binLocation: string | null
  tone: Tone
  otherLocations: Array<{ id: string; name: string }>
}) {
  const [panel, setPanel] = useState<Panel>('none')
  const [adjustState, adjust] = useActionState<FormState, FormData>(adjustStockAction, {})
  const [transferState, transfer] = useActionState<FormState, FormData>(transferStockAction, {})
  const [minState, saveMinimum] = useActionState<FormState, FormData>(setMinimumAction, {})

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-semibold text-ink">{locationName}</p>
          <p className="num text-sm text-ink-muted">
            minimum {minQuantity}
            {binLocation ? ` · bin ${binLocation}` : ''}
          </p>
        </div>
        <Chip tone={tone}>
          <span className="num">{quantity} on hand</span>
        </Chip>
      </div>

      <Divider className="my-3" />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={panel === 'adjust' ? 'primary' : 'secondary'}
          onClick={() => setPanel(panel === 'adjust' ? 'none' : 'adjust')}
        >
          Adjust
        </Button>
        {otherLocations.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant={panel === 'transfer' ? 'primary' : 'secondary'}
            onClick={() => setPanel(panel === 'transfer' ? 'none' : 'transfer')}
          >
            Transfer
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={panel === 'minimum' ? 'primary' : 'secondary'}
          onClick={() => setPanel(panel === 'minimum' ? 'none' : 'minimum')}
        >
          Minimum
        </Button>
      </div>

      {panel === 'adjust' ? (
        <form action={adjust} className="mt-3 space-y-3">
          <input type="hidden" name="locationId" value={locationId} />
          <input type="hidden" name="priceBookItemId" value={priceBookItemId} />

          <Field label="Reason" hint="Direction comes from the reason, so you cannot add by mistake.">
            <Select name="reason" defaultValue="RECEIVED">
              {REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="How many" error={adjustState.fieldErrors?.quantity}>
            <Input
              name="quantity"
              inputMode="decimal"
              className="num text-lg font-semibold"
              required
              placeholder="1"
            />
          </Field>

          <Field label="Note">
            <Textarea name="note" rows={2} placeholder="Optional detail for the history." />
          </Field>

          {adjustState.error ? <Alert>{adjustState.error}</Alert> : null}

          <SubmitButton fullWidth pendingLabel="Posting…">
            Post adjustment
          </SubmitButton>
        </form>
      ) : null}

      {panel === 'transfer' ? (
        <form action={transfer} className="mt-3 space-y-3">
          <input type="hidden" name="fromLocationId" value={locationId} />
          <input type="hidden" name="priceBookItemId" value={priceBookItemId} />

          <Field label="Move to">
            <Select name="toLocationId" required>
              {otherLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="How many" error={transferState.fieldErrors?.quantity}>
            <Input
              name="quantity"
              inputMode="decimal"
              className="num text-lg font-semibold"
              required
              placeholder="1"
            />
          </Field>

          <Field label="Note">
            <Textarea name="note" rows={2} />
          </Field>

          {transferState.error ? <Alert>{transferState.error}</Alert> : null}

          <SubmitButton fullWidth pendingLabel="Moving…">
            Transfer from {locationName}
          </SubmitButton>
        </form>
      ) : null}

      {panel === 'minimum' ? (
        <form action={saveMinimum} className="mt-3 space-y-3">
          <input type="hidden" name="locationId" value={locationId} />
          <input type="hidden" name="priceBookItemId" value={priceBookItemId} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum" hint="Restock alert below this.">
              <Input
                name="minQuantity"
                inputMode="decimal"
                className="num"
                defaultValue={minQuantity}
              />
            </Field>
            <Field label="Bin">
              <Input name="binLocation" defaultValue={binLocation ?? ''} placeholder="A1" />
            </Field>
          </div>

          {minState.error ? <Alert>{minState.error}</Alert> : null}
          {minState.values?.saved === 'yes' ? <Alert tone="success">Saved.</Alert> : null}

          <SubmitButton variant="secondary" fullWidth pendingLabel="Saving…">
            Save
          </SubmitButton>
        </form>
      ) : null}

      <p className={cn('mt-3 text-xs text-ink-subtle', panel === 'none' ? '' : 'hidden')}>
        Adjustments and transfers are recorded in the history below.
      </p>
    </Card>
  )
}
