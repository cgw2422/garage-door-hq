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
import { SignaturePad } from '@/components/app/signature-pad'
import { Logo } from '@/components/ui/logo'
import { Chip } from '@/components/ui/status'
import { CheckIcon, DocumentIcon } from '@/components/ui/icons'
import { portalSelectOptionAction, portalSignAction } from '../../actions'

interface PortalOption {
  id: string
  tier: string
  name: string
  description: string | null
  isRecommended: boolean
  totalCents: number
  subtotalCents: number
  taxCents: number
  items: Array<{ id: string; name: string; description: string | null; quantity: number; lineCents: number }>
}

const TIER_LABEL: Record<string, string> = {
  GOOD: 'Good',
  BETTER: 'Better',
  BEST: 'Best',
  STANDARD: 'Recommended',
}

/**
 * What a customer sees. No account, no navigation, no other records —
 * one document, three choices and a place to sign.
 */
export function PortalEstimate({
  token,
  companyName,
  companyPhone,
  currency,
  estimateNumber,
  title,
  customerName,
  customerMessage,
  termsText,
  status,
  selectedOptionId,
  signature,
  options,
}: {
  token: string
  companyName: string
  companyPhone: string | null
  currency: string
  estimateNumber: string
  title: string | null
  customerName: string
  customerMessage: string | null
  termsText: string | null
  status: string
  selectedOptionId: string | null
  signature: { signerName: string; signedAt: string } | null
  options: PortalOption[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState<string | null>(
    selectedOptionId ?? options.find((option) => option.isRecommended)?.id ?? null,
  )
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [, selectAction] = useActionState<FormState, FormData>(portalSelectOptionAction, {})
  const [signState, signAction] = useActionState<FormState, FormData>(portalSignAction, {})

  const accepted = status === 'ACCEPTED' || signState.values?.signed === 'yes'
  const chosen = options.find((option) => option.id === selected) ?? null

  function choose(optionId: string) {
    if (accepted) return
    setSelected(optionId)
    const body = new FormData()
    body.set('token', token)
    body.set('optionId', optionId)
    startTransition(async () => {
      await selectAction(body)
      router.refresh()
    })
  }

  return (
    <>
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-ink">{companyName}</p>
          {companyPhone ? (
            <a href={`tel:${companyPhone}`} className="num text-sm text-brand-600">
              {companyPhone}
            </a>
          ) : null}
        </div>
        <Logo tone="light" />
      </header>

      <Card className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
              Estimate {estimateNumber}
            </p>
            <h1 className="mt-1 text-xl font-bold text-ink">{title ?? 'Your Estimate'}</h1>
            <p className="text-sm text-ink-muted">Prepared for {customerName}</p>
          </div>
          {accepted ? <Chip tone="success">Accepted</Chip> : null}
        </div>

        {customerMessage ? (
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
            {customerMessage}
          </p>
        ) : null}
      </Card>

      {accepted && signature ? (
        <Alert tone="success" title="Thank you — this estimate is approved" className="mb-4">
          Signed by {signature.signerName} on{' '}
          {new Date(signature.signedAt).toLocaleDateString()}. Your technician has been notified.
        </Alert>
      ) : (
        <p className="mb-3 px-1 text-sm text-ink-muted">
          Choose the option you&apos;d like, then sign at the bottom.
        </p>
      )}

      <div className="space-y-3">
        {options.map((option) => {
          const isChosen = option.id === selected
          return (
            <button
              key={option.id}
              type="button"
              disabled={accepted}
              onClick={() => choose(option.id)}
              className={cn(
                'block w-full rounded-[--radius-card] border bg-surface p-4 text-left shadow-[--shadow-card] transition-colors',
                isChosen ? 'border-brand-500 ring-2 ring-brand-500' : 'border-hairline',
                accepted && !isChosen && 'opacity-50',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
                      {TIER_LABEL[option.tier] ?? option.tier}
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
                      isChosen ? 'border-brand-500 bg-brand-500 text-white' : 'border-hairline-strong',
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

              <p className="num mt-2 text-right text-xs text-ink-subtle">
                Subtotal {formatCents(option.subtotalCents, { currency })} · Tax{' '}
                {formatCents(option.taxCents, { currency })}
              </p>
            </button>
          )
        })}
      </div>

      {!accepted ? (
        <form action={signAction} className="mt-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="optionId" value={selected ?? ''} />
          <input type="hidden" name="signatureDataUrl" value={signatureData ?? ''} />

          <Card className="space-y-4">
            <div>
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
                Approve this work
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

            <Field label="Your name" error={signState.fieldErrors?.signerName}>
              <Input name="signerName" required autoComplete="name" defaultValue={customerName} />
            </Field>

            <SignaturePad onChange={setSignatureData} label="Your signature" />

            {signState.error ? <Alert>{signState.error}</Alert> : null}

            <SubmitButton
              size="lg"
              fullWidth
              disabled={!selected || !signatureData}
              pendingLabel="Submitting…"
            >
              Approve &amp; Sign
            </SubmitButton>
          </Card>
        </form>
      ) : (
        <a
          href={`/api/p/e/${token}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[--radius-control] border border-hairline-strong bg-surface font-semibold text-ink"
        >
          <DocumentIcon className="h-[1.15em] w-[1.15em]" />
          Download a PDF copy
        </a>
      )}

      <p className="mt-6 text-center text-xs leading-relaxed text-ink-subtle">
        This link is private to you. Questions? Call {companyName}
        {companyPhone ? ` on ${companyPhone}` : ''}.
      </p>
    </>
  )
}
