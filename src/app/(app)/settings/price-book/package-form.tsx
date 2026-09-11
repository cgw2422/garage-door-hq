'use client'

import { useActionState, useState } from 'react'
import { cn } from '@/lib/cn'
import { formatCents } from '@/lib/money'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, Divider } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { MinusIcon, PlusIcon } from '@/components/ui/icons'
import { createPackageAction, updatePackageAction } from './actions'

export interface PackageLine {
  priceBookItemId: string
  name: string
  sku: string | null
  priceCents: number
  quantity: number
}

export interface PackageDefaults {
  id?: string
  name: string
  description: string
  defaultTier: 'GOOD' | 'BETTER' | 'BEST' | 'STANDARD' | ''
  isRecommendedDefault: boolean
  price: string
  lines: PackageLine[]
}

export const BLANK_PACKAGE: PackageDefaults = {
  name: '',
  description: '',
  defaultTier: 'STANDARD',
  isRecommendedDefault: false,
  price: '',
  lines: [],
}

/**
 * Package editor.
 *
 * Line order is explicit and saved, because it is the order the customer reads
 * on the estimate. Move buttons rather than drag-and-drop: a technician
 * reordering this on a phone needs a target they can hit, not a gesture.
 */
export function PackageForm({
  mode,
  defaults,
  catalog,
  currency,
}: {
  mode: 'create' | 'edit'
  defaults: PackageDefaults
  catalog: Array<{ id: string; name: string; sku: string | null; priceCents: number }>
  currency: string
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    mode === 'create' ? createPackageAction : updatePackageAction,
    {},
  )
  const [lines, setLines] = useState<PackageLine[]>(defaults.lines)
  const [addId, setAddId] = useState(catalog[0]?.id ?? '')
  const [overridePrice, setOverridePrice] = useState(defaults.price !== '')

  const componentTotal = lines.reduce(
    (sum, line) => sum + Math.round(line.quantity * line.priceCents),
    0,
  )
  const saved = state.values?.saved === 'yes'

  function addLine() {
    const item = catalog.find((entry) => entry.id === addId)
    if (!item) return
    setLines((current) =>
      current.some((line) => line.priceBookItemId === item.id)
        ? current.map((line) =>
            line.priceBookItemId === item.id
              ? { ...line, quantity: line.quantity + 1 }
              : line,
          )
        : [
            ...current,
            {
              priceBookItemId: item.id,
              name: item.name,
              sku: item.sku,
              priceCents: item.priceCents,
              quantity: 1,
            },
          ],
    )
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= lines.length) return
    setLines((current) => {
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved!)
      return next
    })
  }

  function setQuantity(itemId: string, quantity: number) {
    setLines((current) =>
      current
        .map((line) =>
          line.priceBookItemId === itemId ? { ...line, quantity: Math.max(quantity, 0) } : line,
        )
        .filter((line) => line.quantity > 0),
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      {defaults.id ? <input type="hidden" name="packageId" value={defaults.id} /> : null}
      <input
        type="hidden"
        name="linesJson"
        value={JSON.stringify(
          lines.map((line) => ({
            priceBookItemId: line.priceBookItemId,
            quantity: line.quantity,
          })),
        )}
      />

      <Card>
        <CardHeader title="Package" />
        <div className="space-y-4">
          <Field label="Name" error={state.fieldErrors?.name}>
            <Input
              name="name"
              required
              autoFocus={mode === 'create'}
              placeholder="25,000-Cycle Spring Replacement"
              defaultValue={state.values?.name ?? defaults.name}
            />
          </Field>

          <Field label="Description" hint="The customer reads this on the estimate.">
            <Textarea
              name="description"
              rows={2}
              defaultValue={state.values?.description ?? defaults.description}
            />
          </Field>

          <Field
            label="Usual tier"
            hint="Where it lands in a Good / Better / Best presentation."
          >
            <Select name="defaultTier" defaultValue={defaults.defaultTier || 'STANDARD'}>
              <option value="STANDARD">Standalone option</option>
              <option value="GOOD">Good</option>
              <option value="BETTER">Better</option>
              <option value="BEST">Best</option>
            </Select>
          </Field>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="isRecommendedDefault"
              defaultChecked={defaults.isRecommendedDefault}
              className="mt-0.5 h-5 w-5 rounded border-hairline-strong text-brand-500"
            />
            <span>
              <span className="block text-[0.9375rem] font-semibold text-ink">
                Mark as the recommendation
              </span>
              <span className="text-sm text-ink-muted">
                Shows as &ldquo;Most Popular&rdquo; when this package is added.
              </span>
            </span>
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader title={`Contents (${lines.length})`} />

        {lines.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Add the parts and labor this package includes. They appear as separate priced lines
            on the estimate.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {lines.map((line, index) => (
              <li key={line.priceBookItemId} className="flex items-center gap-2">
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    aria-label={`Move ${line.name} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="flex h-6 w-6 items-center justify-center rounded text-ink-subtle disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${line.name} down`}
                    disabled={index === lines.length - 1}
                    onClick={() => move(index, 1)}
                    className="flex h-6 w-6 items-center justify-center rounded text-ink-subtle disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-medium text-ink">{line.name}</p>
                  <p className="num text-xs text-ink-subtle">
                    {line.sku ? `${line.sku} · ` : ''}
                    {formatCents(line.priceCents, { currency })} each
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`Fewer ${line.name}`}
                    onClick={() => setQuantity(line.priceBookItemId, line.quantity - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline-strong text-ink-muted"
                  >
                    <MinusIcon className="h-3.5 w-3.5" />
                  </button>
                  <span className="num w-6 text-center text-sm font-bold text-ink">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={`More ${line.name}`}
                    onClick={() => setQuantity(line.priceBookItemId, line.quantity + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline-strong text-ink-muted"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Divider className="my-3" />

        <div className="flex gap-2">
          <Select
            value={addId}
            onChange={(event) => setAddId(event.target.value)}
            aria-label="Add an item to this package"
            className="flex-1"
          >
            {catalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.sku ? ` · ${item.sku}` : ''}
              </option>
            ))}
          </Select>
          <Button type="button" variant="secondary" icon={<PlusIcon />} onClick={addLine}>
            Add
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Price" />
        <div className="space-y-3">
          <p className={cn('num text-sm', overridePrice ? 'text-ink-subtle' : 'text-ink')}>
            Components add up to{' '}
            <span className="font-bold">{formatCents(componentTotal, { currency })}</span>
          </p>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={overridePrice}
              onChange={(event) => setOverridePrice(event.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-hairline-strong text-brand-500"
            />
            <span>
              <span className="block text-[0.9375rem] font-semibold text-ink">
                Set a package price
              </span>
              <span className="text-sm text-ink-muted">
                Leave off to price it as the sum of its parts.
              </span>
            </span>
          </label>

          {overridePrice ? (
            <Field label="Package price">
              <Input
                name="price"
                inputMode="decimal"
                className="num text-lg font-semibold"
                placeholder={(componentTotal / 100).toFixed(2)}
                defaultValue={defaults.price}
              />
            </Field>
          ) : (
            <input type="hidden" name="price" value="" />
          )}
        </div>
      </Card>

      {state.error ? <Alert>{state.error}</Alert> : null}
      {saved ? <Alert tone="success">Saved.</Alert> : null}

      <SubmitButton size="lg" fullWidth disabled={lines.length === 0} pendingLabel="Saving…">
        {mode === 'create' ? 'Create package' : 'Save package'}
      </SubmitButton>
    </form>
  )
}
