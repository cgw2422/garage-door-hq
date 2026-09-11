'use client'

import { useActionState, useState } from 'react'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Field, Input, Select } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  saveCompanyAction,
  saveLaborCostAction,
  saveReviewDestinationAction,
} from './actions'

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
]

export function CompanyForm({ defaults }: { defaults: Record<string, string> }) {
  const [state, formAction] = useActionState<FormState, FormData>(saveCompanyAction, {})

  return (
    <form action={formAction} className="space-y-4">
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

      <Field label="Time zone" hint="Everything the app calls “today” uses this.">
        <Select name="timezone" defaultValue={defaults.timezone}>
          {TIMEZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace('_', ' ')}
            </option>
          ))}
        </Select>
      </Field>

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

      {state.error ? <Alert>{state.error}</Alert> : null}

      <SubmitButton fullWidth pendingLabel="Saving…">
        Save company settings
      </SubmitButton>
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

export function ReviewDestinationForm({ url, label }: { url: string; label: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    saveReviewDestinationAction,
    {},
  )

  return (
    <form action={formAction} className="space-y-4">
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
