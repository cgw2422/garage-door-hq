'use client'

import { useActionState } from 'react'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { addStockedItemAction } from '../actions'

export function AddStockedItemForm({
  catalog,
  locations,
  defaultItemId,
  defaultLocationId,
}: {
  catalog: Array<{ id: string; name: string; sku: string | null }>
  locations: Array<{ id: string; name: string }>
  defaultItemId?: string
  defaultLocationId?: string
}) {
  const [state, formAction] = useActionState<FormState, FormData>(addStockedItemAction, {})

  return (
    <form action={formAction} className="space-y-4">
      <Card>
        <CardHeader title="What and where" />
        <div className="space-y-4">
          <Field label="Item">
            <Select name="priceBookItemId" defaultValue={defaultItemId ?? catalog[0]?.id} required>
              {catalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.sku ? ` · ${item.sku}` : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Location">
            <Select
              name="locationId"
              defaultValue={defaultLocationId ?? locations[0]?.id}
              required
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Starting numbers" />
        <div className="space-y-4">
          <Field
            label="How many are there now"
            hint="Posted as a receipt, so the count has a transaction behind it."
          >
            <Input
              name="openingQuantity"
              inputMode="decimal"
              className="num text-lg font-semibold"
              placeholder="0"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum" hint="Restock alert below this.">
              <Input name="minQuantity" inputMode="decimal" className="num" defaultValue="0" />
            </Field>
            <Field label="Bin">
              <Input name="binLocation" placeholder="A1" />
            </Field>
          </div>
        </div>
      </Card>

      {state.error ? <Alert>{state.error}</Alert> : null}

      <SubmitButton size="lg" fullWidth pendingLabel="Adding…">
        Start tracking it here
      </SubmitButton>
    </form>
  )
}
