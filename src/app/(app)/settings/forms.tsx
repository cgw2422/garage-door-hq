'use client'

import { useActionState, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  beginLogoUploadAction,
  completeLogoUploadAction,
  removeLogoAction,
  saveCompanyAction,
  saveLaborCostAction,
  saveNumberingAction,
  saveReviewDestinationAction,
} from './actions'

const WEEKDAYS = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
] as const

interface DayHours {
  open: boolean
  from: string
  to: string
}

const DEFAULT_HOURS: Record<string, DayHours> = Object.fromEntries(
  WEEKDAYS.map(([key]) => [
    key,
    key === 'sat' || key === 'sun'
      ? { open: false, from: '09:00', to: '13:00' }
      : { open: true, from: '07:30', to: '17:00' },
  ]),
)

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
]

export function CompanyForm({
  defaults,
  businessHours,
}: {
  defaults: Record<string, string>
  businessHours: Record<string, unknown> | null
}) {
  const [state, formAction] = useActionState<FormState, FormData>(saveCompanyAction, {})
  const [hours, setHours] = useState<Record<string, DayHours>>(() => {
    const parsed = (businessHours ?? {}) as Record<string, Partial<DayHours>>
    return Object.fromEntries(
      WEEKDAYS.map(([key]) => [
        key,
        {
          open: parsed[key]?.open ?? DEFAULT_HOURS[key]!.open,
          from: parsed[key]?.from ?? DEFAULT_HOURS[key]!.from,
          to: parsed[key]?.to ?? DEFAULT_HOURS[key]!.to,
        },
      ]),
    )
  })

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="businessHoursJson" value={JSON.stringify(hours)} />
      <Field label="Company name" error={state.fieldErrors?.name}>
        <Input name="name" required defaultValue={defaults.name} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone">
          <Input name="phone" type="tel" defaultValue={defaults.phone} />
        </Field>
        <Field label="Email" error={state.fieldErrors?.email}>
          <Input name="email" type="email" defaultValue={defaults.email} />
        </Field>
      </div>

      <Field label="Website">
        <Input name="website" defaultValue={defaults.website} />
      </Field>

      <Field label="Address">
        <Input name="addressLine1" defaultValue={defaults.addressLine1} />
      </Field>

      <Field label="Suite / unit">
        <Input name="addressLine2" defaultValue={defaults.addressLine2} />
      </Field>

      <div className="grid grid-cols-[1fr_4rem_6rem] gap-3">
        <Field label="City">
          <Input name="city" defaultValue={defaults.city} />
        </Field>
        <Field label="State">
          <Input name="state" maxLength={2} className="uppercase" defaultValue={defaults.state} />
        </Field>
        <Field label="ZIP">
          <Input name="postalCode" inputMode="numeric" defaultValue={defaults.postalCode} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Time zone" hint="Everything the app calls “today” uses this.">
          <Select name="timezone" defaultValue={defaults.timezone}>
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Currency">
          <Select name="currency" defaultValue={defaults.currency}>
            <option value="USD">US Dollar</option>
            <option value="CAD">Canadian Dollar</option>
          </Select>
        </Field>
      </div>

      <div>
        <span className="mb-1.5 block text-[0.8125rem] font-semibold text-ink-muted">
          Business hours
        </span>
        <div className="space-y-1.5">
          {WEEKDAYS.map(([key, label]) => {
            const day = hours[key]!
            return (
              <div key={key} className="flex items-center gap-2">
                <label className="flex w-28 shrink-0 items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={day.open}
                    onChange={(event) =>
                      setHours((current) => ({
                        ...current,
                        [key]: { ...day, open: event.target.checked },
                      }))
                    }
                    className="h-4 w-4 rounded border-hairline-strong text-brand-500"
                  />
                  {label.slice(0, 3)}
                </label>
                {day.open ? (
                  <>
                    <Input
                      type="time"
                      aria-label={`${label} opening time`}
                      value={day.from}
                      onChange={(event) =>
                        setHours((current) => ({
                          ...current,
                          [key]: { ...day, from: event.target.value },
                        }))
                      }
                      className="h-10 flex-1"
                    />
                    <Input
                      type="time"
                      aria-label={`${label} closing time`}
                      value={day.to}
                      onChange={(event) =>
                        setHours((current) => ({
                          ...current,
                          [key]: { ...day, to: event.target.value },
                        }))
                      }
                      className="h-10 flex-1"
                    />
                  </>
                ) : (
                  <span className="flex-1 text-sm text-ink-subtle">Closed</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Default tax rate %"
          hint="Can be overridden on any estimate or invoice."
          error={state.fieldErrors?.taxRatePercent}
        >
          <Input
            name="taxRatePercent"
            inputMode="decimal"
            className="num"
            defaultValue={defaults.taxRatePercent}
          />
        </Field>
        <Field label="Payment terms (days)">
          <Input
            name="defaultPaymentTermsDays"
            inputMode="numeric"
            className="num"
            defaultValue={defaults.defaultPaymentTermsDays}
          />
        </Field>
      </div>

      <Field label="Estimate terms" hint="Printed on every new estimate.">
        <Textarea name="estimateTermsText" rows={3} defaultValue={defaults.estimateTermsText} />
      </Field>

      <Field label="Invoice terms" hint="Printed on every new invoice.">
        <Textarea name="invoiceTermsText" rows={3} defaultValue={defaults.invoiceTermsText} />
      </Field>

      {state.error ? <Alert>{state.error}</Alert> : null}

      <SubmitButton fullWidth pendingLabel="Saving…">
        Save company settings
      </SubmitButton>
    </form>
  )
}

/**
 * Logo upload.
 *
 * Same private two-phase upload as a photo: the bytes go straight to storage,
 * and the image is served back only to signed-in members of this company.
 */
export function LogoManager({ hasLogo }: { hasLogo: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setError(null)
    setBusy(true)
    try {
      const begin = await beginLogoUploadAction({
        contentType: file.type as never,
        byteSize: file.size,
      })
      if (!begin.ok) throw new Error(begin.error)

      const response = await fetch(begin.url, {
        method: begin.method,
        headers: begin.headers,
        body: file,
      })
      if (!response.ok) throw new Error('The upload was rejected. Try again.')

      const done = await completeLogoUploadAction({ key: begin.key })
      if (!done.ok) throw new Error(done.error)

      startTransition(() => router.refresh())
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      {hasLogo ? (
        <div className="mb-3 flex h-20 items-center justify-start rounded-[--radius-control] border border-hairline bg-surface-sunken px-4">
          <div className="relative h-14 w-44">
            <Image
              src="/api/files/logo"
              alt="Your company logo"
              fill
              unoptimized
              sizes="176px"
              className="object-contain object-left"
            />
          </div>
        </div>
      ) : (
        <p className="mb-3 text-sm text-ink-muted">
          Add a logo and it appears on your estimate and invoice PDFs.
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
        }}
      />

      <div className="flex gap-2.5">
        <Button
          type="button"
          variant="secondary"
          fullWidth
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Uploading…' : hasLogo ? 'Replace logo' : 'Upload a logo'}
        </Button>
        {hasLogo ? (
          <form action={removeLogoAction}>
            <SubmitButton variant="secondary" className="text-danger-600" pendingLabel="Removing…">
              Remove
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {error ? <Alert className="mt-2">{error}</Alert> : null}
    </div>
  )
}

const ENTITY_LABELS: Record<string, string> = {
  JOB: 'Jobs',
  ESTIMATE: 'Estimates',
  INVOICE: 'Invoices',
  DOOR: 'Door Passports',
  CUSTOMER: 'Customers',
}

export function NumberingForm({
  sequences,
}: {
  sequences: Array<{ entity: string; nextValue: number }>
}) {
  const [state, formAction] = useActionState<FormState, FormData>(saveNumberingAction, {})
  const [entity, setEntity] = useState(sequences[0]?.entity ?? 'INVOICE')
  const current = sequences.find((sequence) => sequence.entity === entity)

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-ink-muted">
        Set where your next document number starts. It can only move forward — going backwards
        would reuse a number an existing document already has.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Record type">
          <Select name="entity" value={entity} onChange={(event) => setEntity(event.target.value)}>
            {sequences.map((sequence) => (
              <option key={sequence.entity} value={sequence.entity}>
                {ENTITY_LABELS[sequence.entity] ?? sequence.entity}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Next number">
          <Input
            key={entity}
            name="nextValue"
            inputMode="numeric"
            className="num"
            defaultValue={current?.nextValue ?? 1000}
          />
        </Field>
      </div>

      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.values?.saved === 'yes' ? <Alert tone="success">Saved.</Alert> : null}

      <SubmitButton variant="secondary" fullWidth pendingLabel="Saving…">
        Save numbering
      </SubmitButton>

      <p className="text-xs leading-relaxed text-ink-subtle">
        Custom prefixes are not editable yet. Doing that properly means storing the rendered
        number on each document so changing a prefix cannot appear to renumber past invoices.
      </p>
    </form>
  )
}

export function LaborCostForm({ enabled, hourly }: { enabled: boolean; hourly: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(saveLaborCostAction, {})
  const [on, setOn] = useState(enabled)

  return (
    <form action={formAction} className="space-y-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="laborCostEnabled"
          checked={on}
          onChange={(event) => setOn(event.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-hairline-strong text-brand-500"
        />
        <span>
          <span className="block text-[0.9375rem] font-semibold text-ink">
            Count internal labor as a job cost
          </span>
          <span className="mt-0.5 block text-sm leading-relaxed text-ink-muted">
            Off by default. Leave it off and your own time is not treated as a cost — estimated
            gross profit is then revenue minus parts and fees.
          </span>
        </span>
      </label>

      {on ? (
        <Field label="Internal cost per hour" hint="What an hour of technician time costs you.">
          <Input
            name="laborCostPerHour"
            inputMode="decimal"
            className="num"
            placeholder="42.00"
            defaultValue={hourly}
          />
        </Field>
      ) : null}

      {state.error ? <Alert>{state.error}</Alert> : null}

      <SubmitButton variant="secondary" fullWidth pendingLabel="Saving…">
        Save job costing
      </SubmitButton>
    </form>
  )
}

export function ReviewDestinationForm({
  url,
  label,
  enabled,
}: {
  url: string
  label: string
  enabled: boolean
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    saveReviewDestinationAction,
    {},
  )

  return (
    <form action={formAction} className="space-y-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="reviewRequestEnabled"
          defaultChecked={enabled}
          className="mt-0.5 h-5 w-5 rounded border-hairline-strong text-brand-500"
        />
        <span>
          <span className="block text-[0.9375rem] font-semibold text-ink">
            Queue a review request when a job completes
          </span>
          <span className="text-sm text-ink-muted">
            Nothing is sent yet — requests wait in the queue until messaging is connected.
          </span>
        </span>
      </label>
      {/* Google is the only destination offered today. The data model stores
          providers generically, so adding Facebook later needs no migration. */}
      <input type="hidden" name="provider" value="GOOGLE" />

      <Field
        label="Google review link"
        hint="Paste the “write a review” link from your Google Business Profile."
        error={state.fieldErrors?.url}
      >
        <Input
          name="url"
          type="url"
          inputMode="url"
          placeholder="https://g.page/r/…/review"
          defaultValue={url}
        />
      </Field>

      <Field label="Label" hint="Only shown to your team.">
        <Input name="label" defaultValue={label} placeholder="Google" />
      </Field>

      {state.error ? <Alert>{state.error}</Alert> : null}

      <SubmitButton variant="secondary" fullWidth pendingLabel="Saving…">
        Save review link
      </SubmitButton>
    </form>
  )
}
