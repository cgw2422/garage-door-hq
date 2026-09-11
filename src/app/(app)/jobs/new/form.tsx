'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import type { FormState } from '@/lib/form'
import { createJobAction } from './actions'

interface PropertyOption {
  id: string
  label: string
  doors: Array<{ id: string; label: string }>
}

export function NewJobForm({
  customerId,
  properties,
  jobTypes,
  technicians,
  defaultPropertyId,
  defaultDoorId,
  defaultDate,
  currentUserId,
}: {
  customerId: string
  properties: PropertyOption[]
  jobTypes: Array<{ id: string; name: string }>
  technicians: Array<{ id: string; name: string }>
  defaultPropertyId?: string
  defaultDoorId?: string
  defaultDate?: string
  currentUserId: string
}) {
  const [state, formAction] = useActionState<FormState, FormData>(createJobAction, {})
  const [propertyId, setPropertyId] = useState(
    defaultPropertyId ?? properties[0]?.id ?? '',
  )

  const doors = properties.find((property) => property.id === propertyId)?.doors ?? []
  const today = defaultDate ?? new Date().toISOString().slice(0, 10)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="customerId" value={customerId} />

      <Card>
        <CardHeader title="Where" />
        <div className="space-y-4">
          <Field label="Service address">
            <Select
              name="propertyId"
              value={propertyId}
              onChange={(event) => setPropertyId(event.target.value)}
              required
            >
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.label}
                </option>
              ))}
            </Select>
          </Field>

          {doors.length > 0 ? (
            <Field label="Door" hint="Linking the door adds this visit to its passport.">
              <Select name="doorId" defaultValue={defaultDoorId ?? (doors.length === 1 ? doors[0]!.id : '')}>
                <option value="">Not sure yet</option>
                {doors.map((door) => (
                  <option key={door.id} value={door.id}>
                    {door.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="What" />
        <div className="space-y-4">
          <Field label="Job type">
            <Select name="jobTypeId" defaultValue={state.values?.jobTypeId ?? ''}>
              <option value="">Not sure yet</option>
              {jobTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="What did the customer say?">
            <Textarea
              name="reportedIssue"
              rows={3}
              placeholder="Heard a bang and now the door won't open."
              defaultValue={state.values?.reportedIssue}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="When" />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input
                name="scheduledDate"
                type="date"
                defaultValue={state.values?.scheduledDate ?? today}
              />
            </Field>
            <Field label="Time">
              <Input
                name="scheduledTime"
                type="time"
                step={900}
                defaultValue={state.values?.scheduledTime ?? '09:00'}
              />
            </Field>
          </div>

          <Field label="Expected length">
            <Select name="durationMinutes" defaultValue="60">
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
              <option value="180">3 hours</option>
              <option value="240">Half day</option>
            </Select>
          </Field>

          {/* Solo mode: no technician picker at all — the job is simply theirs. */}
          {technicians.length > 0 ? (
            <Field label="Technician">
              <Select name="assignedToId" defaultValue={currentUserId}>
                {technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
      </Card>

      {state.error ? <Alert>{state.error}</Alert> : null}

      <SubmitButton size="lg" fullWidth pendingLabel="Creating…">
        Create job
      </SubmitButton>
    </form>
  )
}
