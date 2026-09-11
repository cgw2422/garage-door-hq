'use client'

import { useActionState, useState } from 'react'
import { cn } from '@/lib/cn'
import { Alert } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'
import type { FormState } from '@/lib/form'
import { saveCompanySize } from './actions'

type Size = 'SOLO' | 'SMALL_2_5' | 'LARGE_6_PLUS'

const OPTIONS: Array<{ value: Size; label: string; detail: string }> = [
  { value: 'SOLO', label: 'Solo owner/operator', detail: "One truck, called My Truck. We won't ask you which." },
  { value: 'SMALL_2_5', label: '2–5 person company', detail: 'A warehouse plus a truck per technician.' },
  { value: 'LARGE_6_PLUS', label: '6+ person company', detail: 'A warehouse plus a truck per technician.' },
]

export function SizeForm() {
  const [state, formAction] = useActionState<FormState, FormData>(saveCompanySize, {})
  const [size, setSize] = useState<Size>('SOLO')

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="companySize" value={size} />

      <div role="radiogroup" aria-label="Company size" className="space-y-2.5">
        {OPTIONS.map((option) => {
          const selected = option.value === size
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setSize(option.value)}
              className={cn(
                'flex w-full flex-col items-start gap-0.5 rounded-[--radius-control] border px-4 py-3.5 text-left transition-colors',
                selected
                  ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                  : 'border-hairline-strong bg-surface active:bg-surface-sunken',
              )}
            >
              <span className={cn('font-semibold', selected ? 'text-brand-700' : 'text-ink')}>
                {option.label}
              </span>
              <span className="text-sm text-ink-muted">{option.detail}</span>
            </button>
          )
        })}
      </div>

      {state.error ? <Alert>{state.error}</Alert> : null}

      <SubmitButton size="lg" fullWidth pendingLabel="Saving…">
        Continue
      </SubmitButton>
    </form>
  )
}
