'use client'

import { useActionState } from 'react'
import type { PriceBookCategory } from '@prisma/client'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '@/lib/price-book-categories'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { createItemAction, updateItemAction } from './actions'

export interface ItemDefaults {
  id?: string
  name: string
  category: PriceBookCategory
  description: string
  sku: string
  cost: string
  price: string
  unit: string
  supplier: string
  supplierPartNo: string
  taxable: boolean
  trackInventory: boolean
}

export const BLANK_ITEM: ItemDefaults = {
  name: '',
  category: 'MISCELLANEOUS',
  description: '',
  sku: '',
  cost: '',
  price: '',
  unit: 'ea',
  supplier: '',
  supplierPartNo: '',
  taxable: true,
  trackInventory: true,
}

export function ItemForm({
  mode,
  defaults,
}: {
  mode: 'create' | 'edit'
  defaults: ItemDefaults
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    mode === 'create' ? createItemAction : updateItemAction,
    {},
  )
  const saved = state.values?.saved === 'yes'

  return (
    <form action={formAction} className="space-y-4">
      {defaults.id ? <input type="hidden" name="itemId" value={defaults.id} /> : null}

      <Card>
        <CardHeader title="Item" />
        <div className="space-y-4">
          <Field label="Name" error={state.fieldErrors?.name}>
            <Input
              name="name"
              required
              autoFocus={mode === 'create'}
              defaultValue={state.values?.name ?? defaults.name}
              placeholder="Torsion Spring .225 x 2&quot; x 27&quot; LH"
            />
          </Field>

          <Field label="Category">
            <Select name="category" defaultValue={state.values?.category ?? defaults.category}>
              {CATEGORY_ORDER.map((key) => (
                <option key={key} value={key}>
                  {CATEGORY_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Description" hint="Shown to the customer on estimates and invoices.">
            <Textarea
              name="description"
              rows={2}
              defaultValue={state.values?.description ?? defaults.description}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU" hint="Used to match springs.">
              <Input
                name="sku"
                className="num uppercase"
                defaultValue={state.values?.sku ?? defaults.sku}
              />
            </Field>
            <Field label="Unit">
              <Input name="unit" defaultValue={state.values?.unit ?? defaults.unit} placeholder="ea" />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Pricing" />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Your cost" hint="Drives job profit." error={state.fieldErrors?.cost}>
              <Input
                name="cost"
                inputMode="decimal"
                className="num text-lg font-semibold"
                placeholder="0.00"
                defaultValue={state.values?.cost ?? defaults.cost}
              />
            </Field>
            <Field label="Selling price" error={state.fieldErrors?.price}>
              <Input
                name="price"
                inputMode="decimal"
                className="num text-lg font-semibold"
                placeholder="0.00"
                defaultValue={state.values?.price ?? defaults.price}
              />
            </Field>
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="taxable"
              defaultChecked={defaults.taxable}
              className="mt-0.5 h-5 w-5 rounded border-hairline-strong text-brand-500"
            />
            <span>
              <span className="block text-[0.9375rem] font-semibold text-ink">Taxable</span>
              <span className="text-sm text-ink-muted">
                Labor and service calls are usually not.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="trackInventory"
              defaultChecked={defaults.trackInventory}
              className="mt-0.5 h-5 w-5 rounded border-hairline-strong text-brand-500"
            />
            <span>
              <span className="block text-[0.9375rem] font-semibold text-ink">
                Track inventory
              </span>
              <span className="text-sm text-ink-muted">
                Deducts from the truck when it is used on a job.
              </span>
            </span>
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader title="Supplier" />
        <div className="space-y-4">
          <Field label="Supplier">
            <Input name="supplier" defaultValue={state.values?.supplier ?? defaults.supplier} />
          </Field>
          <Field label="Supplier part number">
            <Input
              name="supplierPartNo"
              className="num"
              defaultValue={state.values?.supplierPartNo ?? defaults.supplierPartNo}
            />
          </Field>
        </div>
      </Card>

      {state.error ? <Alert>{state.error}</Alert> : null}
      {saved ? <Alert tone="success">Saved.</Alert> : null}

      <SubmitButton size="lg" fullWidth pendingLabel="Saving…">
        {mode === 'create' ? 'Add to price book' : 'Save changes'}
      </SubmitButton>
    </form>
  )
}
