'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { Button } from '@/components/ui/button'
import type { FormState } from '@/lib/form'
import { createDoorAction } from './actions'

/** Standard residential sizes, in inches, plus room to type anything else. */
const WIDTHS = [96, 108, 120, 144, 168, 192, 216]
const HEIGHTS = [84, 96, 108, 120]

const feet = (inches: number) =>
  inches % 12 === 0 ? `${inches / 12} ft` : `${Math.floor(inches / 12)} ft ${inches % 12} in`

export function NewDoorForm({
  propertyId,
  isCommercial,
  existingDoorCount,
}: {
  propertyId: string
  isCommercial: boolean
  existingDoorCount: number
}) {
  const [state, formAction] = useActionState<FormState, FormData>(createDoorAction, {})
  const [showSprings, setShowSprings] = useState(false)
  const [showOpener, setShowOpener] = useState(false)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="propertyId" value={propertyId} />

      <Card>
        <CardHeader title="The Door" />
        <div className="space-y-4">
          {isCommercial ? (
            <Field
              label="Position label"
              hint="Bay 1, Receiving Door 3 — how the building numbers it."
            >
              <Input
                name="positionLabel"
                autoFocus
                placeholder={`Receiving Door ${existingDoorCount + 1}`}
                defaultValue={state.values?.positionLabel}
              />
            </Field>
          ) : null}

          <Field label="Nickname" hint="Front Garage, Left Bay, Shop Door…">
            <Input
              name="nickname"
              autoFocus={!isCommercial}
              placeholder="Front Garage"
              defaultValue={state.values?.nickname}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Width">
              <Select name="widthInches" defaultValue={state.values?.widthInches ?? ''}>
                <option value="">Unknown</option>
                {WIDTHS.map((inches) => (
                  <option key={inches} value={inches}>
                    {feet(inches)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Height">
              <Select name="heightInches" defaultValue={state.values?.heightInches ?? ''}>
                <option value="">Unknown</option>
                {HEIGHTS.map((inches) => (
                  <option key={inches} value={inches}>
                    {feet(inches)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Manufacturer">
              <Input
                name="manufacturer"
                placeholder="Clopay"
                defaultValue={state.values?.manufacturer}
              />
            </Field>
            <Field label="Model">
              <Input name="model" defaultValue={state.values?.model} />
            </Field>
          </div>

          <Field label="Serial number" hint="Usually on a sticker inside the end stile.">
            <Input name="serialNumber" defaultValue={state.values?.serialNumber} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Material">
              <Select name="material" defaultValue={state.values?.material ?? ''}>
                <option value="">Unknown</option>
                <option value="STEEL">Steel</option>
                <option value="ALUMINUM">Aluminum</option>
                <option value="WOOD">Wood</option>
                <option value="WOOD_COMPOSITE">Wood composite</option>
                <option value="FIBERGLASS">Fiberglass</option>
                <option value="VINYL">Vinyl</option>
                <option value="GLASS">Glass</option>
                <option value="ROLLING_STEEL">Rolling steel</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field label="Insulated">
              <Select name="insulated" defaultValue={state.values?.insulated ?? 'unknown'}>
                <option value="unknown">Unknown</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Color">
              <Input name="color" defaultValue={state.values?.color} />
            </Field>
            <Field label="Panels">
              <Input
                name="panelCount"
                inputMode="numeric"
                placeholder="4"
                defaultValue={state.values?.panelCount}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Door weight (lb)" hint="Measured, not guessed.">
              <Input
                name="weightLbs"
                inputMode="decimal"
                className="num"
                defaultValue={state.values?.weightLbs}
              />
            </Field>
            <Field label="Installed">
              <Input name="installedAt" type="date" defaultValue={state.values?.installedAt} />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea name="notesSummary" rows={2} defaultValue={state.values?.notesSummary} />
          </Field>
        </div>
      </Card>

      <Card padded={!showSprings}>
        {showSprings ? (
          <>
            <CardHeader title="Spring System" />
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Wire">
                  <Input
                    name="spring.wireSizeInches"
                    inputMode="decimal"
                    placeholder="0.225"
                    className="num"
                    defaultValue={state.values?.['spring.wireSizeInches']}
                  />
                </Field>
                <Field label="Inside dia.">
                  <Input
                    name="spring.insideDiameterInches"
                    inputMode="decimal"
                    placeholder="2"
                    className="num"
                    defaultValue={state.values?.['spring.insideDiameterInches']}
                  />
                </Field>
                <Field label="Length">
                  <Input
                    name="spring.lengthInches"
                    inputMode="decimal"
                    placeholder="27"
                    className="num"
                    defaultValue={state.values?.['spring.lengthInches']}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quantity">
                  <Select name="spring.quantity" defaultValue="2">
                    <option value="1">1 spring</option>
                    <option value="2">2 springs (pair)</option>
                  </Select>
                </Field>
                <Field label="Cycle rating">
                  <Input
                    name="spring.cycleRating"
                    inputMode="numeric"
                    placeholder="10000"
                    className="num"
                    defaultValue={state.values?.['spring.cycleRating']}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Drum">
                  <Input name="spring.drumModel" placeholder="400-8" defaultValue={state.values?.['spring.drumModel']} />
                </Field>
                <Field label="Shaft">
                  <Input name="spring.shaftDiameter" placeholder={'1"'} defaultValue={state.values?.['spring.shaftDiameter']} />
                </Field>
              </div>
            </div>
          </>
        ) : (
          <Button type="button" variant="secondary" fullWidth onClick={() => setShowSprings(true)}>
            Add spring measurements
          </Button>
        )}
      </Card>

      <Card padded={!showOpener}>
        {showOpener ? (
          <>
            <CardHeader title="Opener" />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Manufacturer">
                  <Input
                    name="opener.manufacturer"
                    placeholder="LiftMaster"
                    defaultValue={state.values?.['opener.manufacturer']}
                  />
                </Field>
                <Field label="Model">
                  <Input name="opener.model" defaultValue={state.values?.['opener.model']} />
                </Field>
              </div>
              <Field label="Serial number">
                <Input name="opener.serialNumber" defaultValue={state.values?.['opener.serialNumber']} />
              </Field>
              <Field label="Drive type">
                <Select name="opener.driveType" defaultValue="">
                  <option value="">Unknown</option>
                  <option value="BELT">Belt</option>
                  <option value="CHAIN">Chain</option>
                  <option value="SCREW">Screw</option>
                  <option value="DIRECT_DRIVE">Direct drive</option>
                  <option value="WALL_MOUNT">Wall mount</option>
                  <option value="JACKSHAFT">Jackshaft</option>
                  <option value="TROLLEY">Trolley</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>
            </div>
          </>
        ) : (
          <Button type="button" variant="secondary" fullWidth onClick={() => setShowOpener(true)}>
            Add opener details
          </Button>
        )}
      </Card>

      {state.error ? <Alert>{state.error}</Alert> : null}

      <SubmitButton size="lg" fullWidth pendingLabel="Saving…">
        Save Door Passport
      </SubmitButton>
    </form>
  )
}
