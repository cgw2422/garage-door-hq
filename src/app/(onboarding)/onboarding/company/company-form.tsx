'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { cn } from '@/lib/cn'
import { Field, Input } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import type { FormState } from '@/lib/form'
import { saveCompany } from './actions'

type Catalog = 'starter' | 'blank'

export function CompanyForm({ referralCode }: { referralCode: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(saveCompany, {})
  const [catalog, setCatalog] = useState<Catalog>('starter')

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="referralCode" value={referralCode} />
      {/* Resolved in the browser so estimates, schedules and "today" are right
          from the first screen instead of defaulting to the server's zone. */}
      <input
        type="hidden"
        name="timezone"
        defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
      />

      <Field label="Company name" error={state.fieldErrors?.name}>
        <Input
          name="name"
          required
          autoFocus
          placeholder="ABC Garage Doors"
          defaultValue={state.values?.name}
        />
      </Field>

      <Field label="Phone" error={state.fieldErrors?.phone}>
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 214-7788"
          defaultValue={state.values?.phone}
        />
      </Field>

      <Field label="ZIP code" error={state.fieldErrors?.postalCode}>
        <Input
          name="postalCode"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="28206"
          defaultValue={state.values?.postalCode}
        />
      </Field>

      <input type="hidden" name="catalog" value={catalog} />

      <div>
        <span className="mb-1.5 block text-[0.8125rem] font-semibold text-ink-muted">
          Price book
        </span>
        <div role="radiogroup" aria-label="Price book" className="space-y-2">
          {(
            [
              {
                value: 'starter' as const,
                label: 'Start with a garage door catalog',
                detail:
                  'Springs, hardware, openers, labor and ready-made Good/Better/Best packages. Prices are examples to replace with yours.',
              },
              {
                value: 'blank' as const,
                label: 'Start empty',
                detail: 'Add your own items and packages from scratch.',
              },
            ]
          ).map((option) => {
            const selected = option.value === catalog
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setCatalog(option.value)}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 rounded-[--radius-control] border px-3.5 py-3 text-left transition-colors',
                  selected
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                    : 'border-hairline-strong bg-surface active:bg-surface-sunken',
                )}
              >
                <span
                  className={cn(
                    'text-sm font-semibold',
                    selected ? 'text-brand-700' : 'text-ink',
                  )}
                >
                  {option.label}
                </span>
                <span className="text-xs leading-relaxed text-ink-muted">{option.detail}</span>
              </button>
            )
          })}
        </div>
      </div>

      {state.error ? <Alert>{state.error}</Alert> : null}

      <SubmitButton size="lg" fullWidth pendingLabel="Setting up…">
        Continue
      </SubmitButton>
    </form>
  )
}
