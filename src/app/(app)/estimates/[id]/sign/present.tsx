'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/cn'
import { formatCents } from '@/lib/money'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { PageBody, StickyActions } from '@/components/app/page-header'
import { SignaturePad } from '@/components/app/signature-pad'
import { Chip } from '@/components/ui/status'
import { CheckIcon } from '@/components/ui/icons'
import { selectOptionAction, signEstimateAction } from './actions'

type Tier = 'GOOD' | 'BETTER' | 'BEST' | 'STANDARD'

const TIER_LABEL: Record<Tier, string> = {
  GOOD: 'Good',
  BETTER: 'Better',
  BEST: 'Best',
  STANDARD: 'Recommended',
}

interface PresentOption {
  id: string
  tier: Tier
  name: string
  description: string | null
  isRecommended: boolean
  totalCents: number
  items: Array<{ id: string; name: string; quantity: number; lineCents: number }>
}

/**
 * The screen the customer actually looks at, on the technician's phone.
 *
 * Big option cards, one obvious recommendation, itemized so nothing is hidden,
 * then a signature. Selecting an option is persisted as it happens so a dropped
 * connection at the signature step does not lose the choice.
 */
export function PresentAndSign({
  estimateId,
  customerName,
  currency,
  options,
  selectedOptionId,
  termsText,
}: {
  estimateId: string
  customerName: string
  currency: string
  options: PresentOption[]
  selectedOptionId: string | null
  termsText: string | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState<string | null>(
    selectedOptionId ?? options.find((option) => option.isRecommended)?.id ?? null,
  )
  const [signature, setSignature] = useState<string | null>(null)
  const [state, formAction] = useActionState<FormState, FormData>(signEstimateAction, {})

  const chosen = options.find((option) => option.id === selected) ?? null

  function choose(optionId: string) {
    setSelected(optionId)
    startTransition(async () => {
      await selectOptionAction({ estimateId, optionId })
      router.refresh()
    })
  }

  return (
    <>
      <PageBody className="pb-44">
        <p className="px-1 text-sm text-ink-muted">
          Choose the option you&apos;d like us to do today.
        </p>

        {options.map((option) => {
          const isChosen = option.id === selected
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => choose(option.id)}
              className={cn(
                'block w-full rounded-[--radius-card] border bg-surface p-4 text-left shadow-[--shadow-card] transition-colors',
                isChosen
                  ? 'border-brand-500 ring-2 ring-brand-500'
                  : 'border-hairline active:bg-surface-sunken',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
                      {TIER_LABEL[option.tier]}
                    </span>
                    {option.isRecommended ? <Chip tone="brand">Most Popular</Chip> : null}
                  </div>
                  <p className="mt-1 text-base font-bold text-ink">{option.name}</p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="num text-2xl font-bold leading-none text-ink">
                    {formatCents(option.totalCents, { currency, showCents: false })}
                  </span>
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full border-2',
                      isChosen
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-hairline-strong',
                    )}
                    aria-hidden="true"
                  >
                    {isChosen ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                  </span>
                </div>
              </div>

              {option.description ? (
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{option.description}</p>
              ) : null}

              <ul className="mt-3 space-y-1.5 border-t border-hairline pt-3">
                {option.items.map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 text-ink-muted">
                      {item.quantity > 1 ? `${item.quantity} × ` : ''}
                      {item.name}
                    </span>
                    <span className="num shrink-0 text-ink">
                      {formatCents(item.lineCents, { currency })}
                    </span>
                  </li>
                ))}
              </ul>
            </button>
          )
        })}

        <form action={formAction}>
          <Card className="space-y-4">
            <input type="hidden" name="estimateId" value={estimateId} />
            <input type="hidden" name="optionId" value={selected ?? ''} />
            <input type="hidden" name="signatureDataUrl" value={signature ?? ''} />

            <div>
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
                Approve the work
              </p>
              {chosen ? (
                <p className="mt-1 text-[0.9375rem] text-ink">
                  <span className="font-semibold">{chosen.name}</span> ·{' '}
                  <span className="num font-bold">
                    {formatCents(chosen.totalCents, { currency })}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-ink-muted">Choose an option above first.</p>
              )}
            </div>

            {termsText ? (
              <p className="rounded-[--radius-control] bg-surface-sunken px-3 py-2.5 text-xs leading-relaxed text-ink-muted">
                {termsText}
              </p>
            ) : null}

            <Field label="Signed by" error={state.fieldErrors?.signerName}>
              <Input
                name="signerName"
                required
                defaultValue={state.values?.signerName ?? customerName}
                autoComplete="name"
              />
            </Field>

            <SignaturePad onChange={setSignature} />

            {state.error ? <Alert>{state.error}</Alert> : null}
            {state.fieldErrors?.signatureDataUrl ? (
              <Alert>{state.fieldErrors.signatureDataUrl}</Alert>
            ) : null}
          </Card>

          <p className="mt-4 px-1 text-center text-xs leading-relaxed text-ink-subtle">
            Signing records the exact version of this estimate. It cannot be changed afterwards.
          </p>

          {/* Inside the form so useFormStatus tracks the real submission and a
              second tap cannot record a second signature. */}
          <StickyActions>
            <SubmitButton
              size="lg"
              fullWidth
              disabled={!selected || !signature}
              pendingLabel="Recording approval…"
            >
              Approve &amp; Sign
            </SubmitButton>
          </StickyActions>
        </form>
      </PageBody>
    </>
  )
}
