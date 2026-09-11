'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { formatCents } from '@/lib/money'
import { formatCycles, formatSpringSize, formatWind } from '@/lib/measure'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { Field, Input, SegmentedControl, Stepper } from '@/components/ui/field'
import { Chip } from '@/components/ui/status'
import { AlertIcon, CheckIcon, SpringIcon } from '@/components/ui/icons'
import { findMatchingSprings, type MatchState } from './actions'

type Wind = 'LEFT_HAND' | 'RIGHT_HAND'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Searching…' : 'Find Matching Springs'}
    </Button>
  )
}

export function SpringCalculatorForm({
  jobId,
  doorId,
  currency,
  myLocationName,
  sizingAvailable,
}: {
  jobId: string
  doorId: string
  currency: string
  myLocationName: string
  sizingAvailable: boolean
}) {
  const [state, formAction] = useActionState<MatchState, FormData>(findMatchingSprings, {})
  const [wind, setWind] = useState<Wind>('LEFT_HAND')
  const [quantity, setQuantity] = useState(2)

  const result = state.result

  return (
    <>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="doorId" value={doorId} />
        <input type="hidden" name="wind" value={wind} />
        <input type="hidden" name="quantity" value={quantity} />

        <Card>
          <CardHeader title="Measure Your Spring" />

          <div className="space-y-4">
            <Field label="Wire Size (inches)" hint="Measure 20 coils and divide by 20.">
              <Input
                name="wireSizeInches"
                type="text"
                inputMode="decimal"
                placeholder="0.225"
                defaultValue={state.values?.wireSizeInches}
                required
                className="num text-lg font-semibold"
              />
            </Field>

            <Field label="Inside Diameter (inches)">
              <Input
                name="insideDiameterInches"
                type="text"
                inputMode="decimal"
                placeholder="2.00"
                defaultValue={state.values?.insideDiameterInches}
                required
                className="num text-lg font-semibold"
              />
            </Field>

            <Field label="Length (inches)" hint="Coil length only — do not include the cones.">
              <Input
                name="lengthInches"
                type="text"
                inputMode="decimal"
                placeholder="27"
                defaultValue={state.values?.lengthInches}
                required
                className="num text-lg font-semibold"
              />
            </Field>

            <Field label="Wind Direction">
              <SegmentedControl<Wind>
                name="Wind direction"
                value={wind}
                onChange={setWind}
                options={[
                  { value: 'LEFT_HAND', label: 'Left Hand' },
                  { value: 'RIGHT_HAND', label: 'Right Hand' },
                ]}
              />
            </Field>

            <Field label="Quantity">
              <Stepper value={quantity} onChange={setQuantity} min={1} max={8} label="spring quantity" />
            </Field>

            <Field
              label="Existing Cycle Rating (optional)"
              hint="If you know it, higher-cycle matches are flagged as upgrades."
            >
              <Input
                name="existingCycleRating"
                type="text"
                inputMode="numeric"
                placeholder="10000"
                defaultValue={state.values?.existingCycleRating}
                className="num"
              />
            </Field>
          </div>
        </Card>

        {state.error ? (
          <p role="alert" className="rounded-[--radius-control] bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-700">
            {state.error}
          </p>
        ) : null}

        <SubmitButton />
      </form>

      {!sizingAvailable ? (
        <Card className="border-warning-100 bg-warning-50">
          <div className="flex gap-3">
            <AlertIcon className="h-5 w-5 shrink-0 text-warning-600" />
            <div>
              <p className="text-sm font-semibold text-warning-700">
                Sizing from door weight is not available
              </p>
              <p className="mt-1 text-sm leading-relaxed text-warning-700/90">
                Garage Door HQ will not calculate a spring from a door weight until verified
                manufacturer data is loaded and tested. Measure the existing spring and match it.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {result ? (
        <div className="space-y-3">
          <h2 className="px-1 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
            {result.noCatalogEntry ? 'No Matches' : `${result.matches.length} Matching Springs`}
          </h2>

          {result.noCatalogEntry ? (
            <Card>
              <EmptyState
                icon={<SpringIcon />}
                title="Nothing in your price book matches that size"
                body={`${formatSpringSize(
                  result.query.wireSizeInches,
                  result.query.insideDiameterInches,
                  result.query.lengthInches,
                )} · ${formatWind(result.query.wind ?? null)}. Add it to your price book and it will match next time.`}
                action={
                  <ButtonLink href="/settings/price-book/new" size="sm" variant="secondary">
                    Add to Price Book
                  </ButtonLink>
                }
              />
            </Card>
          ) : (
            result.matches.map((match) => {
              const enough = match.onMyTruck >= quantity
              return (
                <Card key={match.priceBookItemId}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="num text-base font-bold text-ink">
                        {formatSpringSize(
                          match.wireSizeInches,
                          match.insideDiameterInches,
                          match.lengthInches,
                        )}
                      </p>
                      <p className="text-sm text-ink-muted">
                        {formatWind(match.wind)} · {formatCycles(match.cycleRating)}
                      </p>
                      {match.sku ? (
                        <p className="num mt-0.5 text-xs text-ink-subtle">SKU {match.sku}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="num text-lg font-bold text-ink">
                        {formatCents(match.priceCents, { currency })}
                      </span>
                      {match.matchQuality === 'cycle-upgrade' ? (
                        <Chip tone="brand">Upgrade</Chip>
                      ) : null}
                    </div>
                  </div>

                  <div
                    className={`mt-3 flex items-start gap-2.5 rounded-[--radius-control] px-3 py-2.5 ${
                      enough ? 'bg-success-50' : match.totalOnHand > 0 ? 'bg-warning-50' : 'bg-danger-50'
                    }`}
                  >
                    {enough ? (
                      <CheckIcon className="h-4 w-4 shrink-0 text-success-600" />
                    ) : (
                      <AlertIcon className="h-4 w-4 shrink-0 text-warning-600" />
                    )}
                    <div className="min-w-0 text-sm">
                      <p
                        className={`font-semibold ${
                          enough
                            ? 'text-success-700'
                            : match.totalOnHand > 0
                              ? 'text-warning-700'
                              : 'text-danger-700'
                        }`}
                      >
                        {enough
                          ? `You have ${match.onMyTruck} on ${myLocationName}`
                          : match.totalOnHand > 0
                            ? `Only ${match.onMyTruck} on ${myLocationName}`
                            : 'Out of stock everywhere'}
                      </p>
                      {match.availability.length > 0 ? (
                        <p className="mt-0.5 text-ink-muted">
                          {match.availability
                            .map((a) => `${a.locationName}: ${a.quantity}`)
                            .join(' · ')}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2.5">
                    <ButtonLink
                      href={`/inventory/items/${match.priceBookItemId}`}
                      variant="secondary"
                      className="flex-1"
                    >
                      View in Inventory
                    </ButtonLink>
                    <ButtonLink
                      href={
                        jobId
                          ? `/jobs/${jobId}/estimates/new?itemId=${match.priceBookItemId}&qty=${quantity}`
                          : `/estimates/new?itemId=${match.priceBookItemId}&qty=${quantity}`
                      }
                      className="flex-1"
                    >
                      Add to Estimate
                    </ButtonLink>
                  </div>
                </Card>
              )
            })
          )}
        </div>
      ) : null}
    </>
  )
}
