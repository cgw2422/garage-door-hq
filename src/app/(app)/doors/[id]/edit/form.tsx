'use client'

import { useActionState, useState } from 'react'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { archiveDoorAction, updateDoorAction } from '@/app/actions/records'

const WIDTHS = [96, 108, 120, 144, 168, 192, 216]
const HEIGHTS = [84, 96, 108, 120]

const feet = (inches: number) =>
  inches % 12 === 0 ? `${inches / 12} ft` : `${Math.floor(inches / 12)} ft ${inches % 12} in`

interface DoorDefaults {
  id: string
  propertyId: string
  isCommercial: boolean
  nickname: string
  positionLabel: string
  widthInches: string
  heightInches: string
  panelCount: string
  manufacturer: string
  model: string
  serialNumber: string
  material: string
  color: string
  insulated: string
  trackType: string
  trackRadiusInches: string
  headroomInches: string
  weightLbs: string
  installedAt: string
  warrantyEndsAt: string
  laborWarrantyEndsAt: string
  notesSummary: string
}

export function EditDoorForm({
  door,
  historyCounts,
}: {
  door: DoorDefaults
  historyCounts: { springSystems: number; events: number }
}) {
  const [state, formAction] = useActionState<FormState, FormData>(updateDoorAction, {})
  const [archiveState, archive] = useActionState<FormState, FormData>(archiveDoorAction, {})
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <Alert tone="info" title="Specifications only">
        Correcting a model number or a measurement is fine here. Spring systems, openers and the
        service timeline are not editable — they record what was actually done, and replacing
        hardware goes through completing a job so the history stays honest.
      </Alert>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="doorId" value={door.id} />

        <Card>
          <CardHeader title="Identity" />
          <div className="space-y-4">
            <Field label="Nickname">
              <Input name="nickname" defaultValue={door.nickname} placeholder="Front Garage" />
            </Field>
            {door.isCommercial ? (
              <Field label="Position label" hint="Bay 1, Receiving Door 3…">
                <Input name="positionLabel" defaultValue={door.positionLabel} />
              </Field>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="The Door" />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Width">
                <Select name="widthInches" defaultValue={door.widthInches}>
                  <option value="">Unknown</option>
                  {WIDTHS.map((inches) => (
                    <option key={inches} value={inches}>
                      {feet(inches)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Height">
                <Select name="heightInches" defaultValue={door.heightInches}>
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
                <Input name="manufacturer" defaultValue={door.manufacturer} />
              </Field>
              <Field label="Model">
                <Input name="model" defaultValue={door.model} />
              </Field>
            </div>

            <Field label="Serial number">
              <Input name="serialNumber" defaultValue={door.serialNumber} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Material">
                <Select name="material" defaultValue={door.material}>
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
                <Select name="insulated" defaultValue={door.insulated}>
                  <option value="unknown">Unknown</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Color">
                <Input name="color" defaultValue={door.color} />
              </Field>
              <Field label="Panels">
                <Input name="panelCount" inputMode="numeric" defaultValue={door.panelCount} />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Hardware & Measurements" />
          <div className="space-y-4">
            <Field label="Track type">
              <Input name="trackType" defaultValue={door.trackType} placeholder={'2" Standard Lift'} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Track radius">
                <Input
                  name="trackRadiusInches"
                  inputMode="decimal"
                  className="num"
                  defaultValue={door.trackRadiusInches}
                />
              </Field>
              <Field label="Headroom">
                <Input
                  name="headroomInches"
                  inputMode="decimal"
                  className="num"
                  defaultValue={door.headroomInches}
                />
              </Field>
              <Field label="Weight (lb)">
                <Input
                  name="weightLbs"
                  inputMode="decimal"
                  className="num"
                  defaultValue={door.weightLbs}
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Warranty" />
          <div className="space-y-4">
            <Field label="Installed">
              <Input name="installedAt" type="date" defaultValue={door.installedAt} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Manufacturer warranty ends">
                <Input name="warrantyEndsAt" type="date" defaultValue={door.warrantyEndsAt} />
              </Field>
              <Field label="Your labor warranty ends">
                <Input
                  name="laborWarrantyEndsAt"
                  type="date"
                  defaultValue={door.laborWarrantyEndsAt}
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Notes" />
          <Textarea name="notesSummary" rows={3} defaultValue={door.notesSummary} />
        </Card>

        {state.error ? <Alert>{state.error}</Alert> : null}

        <SubmitButton size="lg" fullWidth pendingLabel="Saving…">
          Save Door Passport
        </SubmitButton>
      </form>

      <Card>
        <CardHeader title="Archive" />
        <p className="mb-3 text-sm text-ink-muted">
          This door has {historyCounts.springSystems} spring system
          {historyCounts.springSystems === 1 ? '' : 's'} and {historyCounts.events} history
          entr{historyCounts.events === 1 ? 'y' : 'ies'} on file. Archiving keeps all of it and
          just takes the door off the active list.
        </p>

        {confirming ? (
          <form action={archive} className="space-y-2.5">
            <input type="hidden" name="doorId" value={door.id} />
            <input type="hidden" name="propertyId" value={door.propertyId} />
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
            Archive this door
          </Button>
        )}
      </Card>
    </>
  )
}
