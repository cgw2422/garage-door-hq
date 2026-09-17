'use client'

import { useMemo, useState, useTransition } from 'react'
import type { EstimateTier } from '@prisma/client'
import { cn } from '@/lib/cn'
import { formatCents } from '@/lib/money'
import { badgeFor, optionsHeading, type OptionLayout } from '@/lib/estimate-presentation'
import { Alert } from '@/components/ui/alert'
import { SignaturePad } from '@/components/app/signature-pad'
import { CheckIcon } from '@/components/ui/icons'
import {
  endPresentationAction,
  recoverPresentationAction,
  signInPresentationAction,
} from './actions'

export interface PresentedOption {
  id: string
  name: string
  description: string | null
  tier: EstimateTier | null
  isRecommended: boolean
  subtotalCents: number
  taxCents: number
  totalCents: number
  items: Array<{ id: string; name: string; description: string | null; quantity: number }>
}

interface Company {
  name: string
  phone: string | null
  website: string | null
  logoSrc: string | null
}

/**
 * Customer Presentation Mode.
 *
 * A technician taps Present, hands over the phone, and a homeowner who has
 * never seen this software decides what to do about their garage door. Big
 * type, big targets, the company's name at the top, and nothing on screen that
 * belongs to the business rather than to the customer.
 *
 * The number of options decides the shape. One option is a recommendation to
 * approve, not a tier to compare — it never gets labelled "Good", because
 * there is nothing for it to be better than. Two are a choice. Three, if the
 * company sells that way, are Good, Better and Best. Nothing is invented to
 * fill a layout, and no technician is ever asked to make up a second option to
 * get past this screen.
 *
 * What keeps the business out of reach is not this component. It is that the
 * technician's session is suspended while this is open, and this page was
 * resolved from a token that names one estimate. The design can therefore be
 * about the customer rather than about defending anything.
 */
type Stage = 'ready' | 'choose' | 'approve' | 'done'

export function CustomerPresentation({
  estimateNumber,
  currency,
  company,
  customerName,
  serviceAddress,
  door,
  diagnosis,
  findings,
  title,
  layout,
  options,
  taxRateBps,
  termsText,
  expiresAt,
  alreadySigned,
}: {
  estimateNumber: string
  currency: string
  company: Company
  customerName: string
  serviceAddress: string | null
  door: string | null
  diagnosis: string | null
  findings: Array<{ id: string; label: string; photoIds: string[] }>
  title: string | null
  layout: OptionLayout
  options: PresentedOption[]
  taxRateBps: number
  termsText: string | null
  expiresAt: string | null
  alreadySigned: { signerName: string; optionId: string | null } | null
}) {
  const [stage, setStage] = useState<Stage>(alreadySigned ? 'done' : 'ready')
  const [chosenId, setChosenId] = useState<string | null>(
    alreadySigned?.optionId ?? (options.length === 1 ? (options[0]?.id ?? null) : null),
  )
  const [signerName, setSignerName] = useState(customerName)
  const [signature, setSignature] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const chosen = useMemo(
    () => options.find((option) => option.id === chosenId) ?? null,
    [options, chosenId],
  )

  function approve() {
    if (!chosen || !signature || pending) return
    setError(null)
    startTransition(async () => {
      const result = await signInPresentationAction({
        optionId: chosen.id,
        signerName: signerName.trim(),
        signatureDataUrl: signature,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setStage('done')
    })
  }

  // --- the handover screen -------------------------------------------------
  if (stage === 'ready') {
    return (
      <Shell company={company} bare exit={false}>
        <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-7 px-6 py-12 text-center">
          <div className="space-y-3">
            <h1 className="text-[2rem] font-bold leading-tight text-ink">
              Ready to show your customer?
            </h1>
            <p className="text-lg leading-relaxed text-ink-muted">
              Customer Presentation Mode hides your internal business information — your
              costs, your margins, your notes and your price book — and locks the rest of
              Garage Door HQ until you unlock it with your password.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setStage('choose')}
            className="safe-tap w-full rounded-[--radius-control] bg-brand-600 px-6 py-5 text-xl font-bold text-white active:bg-brand-700"
          >
            Present Estimate
          </button>

          <ExitControl label="Not yet — back to the estimate" />
        </div>
      </Shell>
    )
  }

  // --- all set -------------------------------------------------------------
  //
  // Nothing here leads anywhere. The customer is still holding the device, so
  // leaving is a deliberate act by the technician, with their password.
  if (stage === 'done') {
    return (
      <Shell company={company} bare exit={false}>
        <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 px-6 py-12 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-50">
            <CheckIcon className="h-10 w-10 text-success-600" />
          </div>
          <div className="space-y-3">
            <h1 className="text-[2.5rem] font-bold leading-tight text-ink">Approved</h1>
            {chosen ? (
              <p className="text-lg leading-relaxed text-ink-muted">
                {chosen.name} ·{' '}
                <span className="num font-bold text-ink">
                  {formatCents(chosen.totalCents, { currency })}
                </span>
              </p>
            ) : null}
            <p className="text-xl font-semibold text-ink">
              Please return this device to your technician.
            </p>
          </div>

          <ExitControl label="Technician: exit Presentation Mode" />
        </div>
      </Shell>
    )
  }

  // --- choosing, then approving -------------------------------------------
  return (
    <Shell company={company}>
      <div className="mx-auto max-w-2xl px-5 pb-28 pt-6">
        <header className="space-y-1.5 border-b border-hairline pb-5">
          <p className="text-[0.8125rem] font-bold uppercase tracking-[0.12em] text-brand-600">
            Estimate {estimateNumber}
          </p>
          <h1 className="text-[1.75rem] font-bold leading-tight text-ink">
            {title ?? 'Recommended work'}
          </h1>
          <dl className="grid gap-1 pt-2 text-[0.9375rem] text-ink-muted">
            <Row label="Prepared for" value={customerName} />
            {serviceAddress ? <Row label="Service address" value={serviceAddress} /> : null}
            {door ? <Row label="Door" value={door} /> : null}
          </dl>
        </header>

        {diagnosis ? (
          <section className="border-b border-hairline py-5">
            <h2 className="text-[0.8125rem] font-bold uppercase tracking-[0.12em] text-ink-subtle">
              What we found
            </h2>
            <p className="mt-2 text-[1.0625rem] leading-relaxed text-ink">{diagnosis}</p>
            {findings.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {findings.map((finding) => (
                  <li
                    key={finding.id}
                    className="rounded-[--radius-chip] bg-warning-50 px-3 py-1.5 text-sm font-semibold text-warning-700"
                  >
                    {finding.label}
                  </li>
                ))}
              </ul>
            ) : null}
            {findings.some((finding) => finding.photoIds.length > 0) ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {findings
                  .flatMap((finding) =>
                    finding.photoIds.map((photoId) => ({ photoId, label: finding.label })),
                  )
                  .map(({ photoId, label }) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={photoId}
                      src={`/api/files/photos/${photoId}`}
                      alt={label}
                      className="h-28 w-28 flex-none rounded-[--radius-control] object-cover"
                    />
                  ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {stage === 'choose' ? (
          <section className="py-6">
            <h2 className="text-[1.375rem] font-bold text-ink">
              {optionsHeading(layout, options.length)}
            </h2>

            <div className="mt-4 space-y-3">
              {options.map((option) => (
                <OptionCard
                  key={option.id}
                  option={option}
                  layout={layout}
                  currency={currency}
                  selected={chosenId === option.id}
                  onSelect={() => setChosenId(option.id)}
                />
              ))}
            </div>

            {termsText ? (
              <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-ink-subtle">
                {termsText}
              </p>
            ) : null}
            {expiresAt ? (
              <p className="mt-2 text-sm text-ink-subtle">
                Valid until {new Date(expiresAt).toLocaleDateString()}.
              </p>
            ) : null}
          </section>
        ) : null}

        {stage === 'approve' && chosen ? (
          <section className="py-6">
            <h2 className="text-[0.8125rem] font-bold uppercase tracking-[0.12em] text-ink-subtle">
              You&rsquo;re approving
            </h2>
            <p className="mt-1.5 text-[1.5rem] font-bold leading-tight text-ink">{chosen.name}</p>
            <p className="num mt-1 text-[2rem] font-bold leading-none text-brand-600">
              {formatCents(chosen.totalCents, { currency })}
            </p>

            <h3 className="mt-6 text-[0.8125rem] font-bold uppercase tracking-[0.12em] text-ink-subtle">
              Included work
            </h3>
            <ul className="mt-2 space-y-2">
              {chosen.items.map((item) => (
                <li key={item.id} className="flex gap-3 text-[1.0625rem] text-ink">
                  <CheckIcon className="mt-1 h-4 w-4 flex-none text-success-600" />
                  <span>
                    {item.quantity > 1 ? `${item.quantity} × ` : ''}
                    {item.name}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-6 space-y-1.5 border-t border-hairline pt-4 text-[1.0625rem]">
              <Money label="Subtotal" cents={chosen.subtotalCents} currency={currency} />
              <Money
                label={`Tax${taxRateBps > 0 ? ` (${(taxRateBps / 100).toFixed(2)}%)` : ''}`}
                cents={chosen.taxCents}
                currency={currency}
              />
              <div className="flex items-baseline justify-between border-t border-hairline pt-2 text-[1.375rem] font-bold text-ink">
                <dt>Total</dt>
                <dd className="num">{formatCents(chosen.totalCents, { currency })}</dd>
              </div>
            </dl>

            <div className="mt-7 space-y-3">
              <label
                htmlFor="present-signer"
                className="block text-[0.8125rem] font-bold uppercase tracking-[0.12em] text-ink-subtle"
              >
                Your name
              </label>
              <input
                id="present-signer"
                value={signerName}
                onChange={(event) => setSignerName(event.target.value)}
                className="h-14 w-full rounded-[--radius-control] border border-hairline-strong bg-surface px-4 text-[1.125rem] text-ink"
                autoComplete="name"
              />
              <p className="text-[0.8125rem] font-bold uppercase tracking-[0.12em] text-ink-subtle">
                Sign here
              </p>
              <SignaturePad onChange={setSignature} />
            </div>

            {termsText ? (
              <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-ink-subtle">
                {termsText}
              </p>
            ) : null}
          </section>
        ) : null}

        {error ? (
          <div className="pb-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-hairline bg-surface/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {stage === 'choose' ? (
            <button
              type="button"
              disabled={!chosen}
              onClick={() => setStage('approve')}
              className="safe-tap w-full rounded-[--radius-control] bg-brand-600 px-6 py-4 text-lg font-bold text-white disabled:opacity-40 active:bg-brand-700"
            >
              {layout === 'single'
                ? 'Approve This Repair'
                : chosen
                  ? `Approve ${chosen.name}`
                  : 'Choose an option to continue'}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={!signature || signerName.trim().length < 2 || pending}
                onClick={approve}
                className="safe-tap w-full rounded-[--radius-control] bg-success-600 px-6 py-4 text-lg font-bold text-white disabled:opacity-40 active:bg-success-700"
              >
                {pending
                  ? 'Approving…'
                  : `Approve ${formatCents(chosen?.totalCents ?? 0, { currency })}`}
              </button>
              {options.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setStage('choose')}
                  className="py-2 text-base font-semibold text-ink-muted"
                >
                  Back to the options
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Shell>
  )
}

/**
 * Leaving, which only the technician can do.
 *
 * Two taps and then a password. The two taps keep a stray thumb from opening
 * the form; the password is what makes this technician-only rather than
 * merely awkward — a confirmation dialog is something a curious customer taps
 * through, and a hidden gesture is something they discover.
 *
 * On success the browser is sent to the job with a full navigation rather than
 * a client-side one, because the presentation cookie has just been cleared and
 * the middleware needs to see that on the next request.
 */
export function ExitControl({
  label,
  recover = false,
  compact = false,
}: {
  label: string
  /** The cookie is gone; end the technician's live presentation by identity. */
  recover?: boolean
  /** A small control in the masthead rather than a line of its own. */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    if (pending || password.length === 0) return
    setError(null)
    start(async () => {
      const result = recover
        ? await recoverPresentationAction(password)
        : await endPresentationAction(password)
      if (!result.ok) {
        setError(result.error)
        setPassword('')
        return
      }
      window.location.href = result.href
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'font-semibold text-ink-subtle',
          compact ? 'px-2 py-1 text-xs' : 'mx-auto py-2 text-sm',
        )}
      >
        {label}
      </button>
    )
  }

  const panel = (
    <div className="mx-auto w-full max-w-sm space-y-3 rounded-[--radius-card] border border-hairline bg-surface p-4 text-left shadow-[--shadow-card]">
      <div>
        <p className="text-[0.9375rem] font-bold text-ink">Technician sign-in</p>
        <p className="mt-0.5 text-sm text-ink-muted">
          Enter your Garage Door HQ password to unlock the app on this device.
        </p>
      </div>

      <input
        type="password"
        value={password}
        autoFocus
        autoComplete="current-password"
        onChange={(event) => setPassword(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
        }}
        className="h-12 w-full rounded-[--radius-control] border border-hairline-strong bg-surface px-3 text-base text-ink"
        placeholder="Your password"
      />

      {error ? <Alert>{error}</Alert> : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setPassword('')
            setError(null)
          }}
          className="h-12 flex-1 rounded-[--radius-control] border border-hairline-strong text-[0.9375rem] font-semibold text-ink-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending || password.length === 0}
          onClick={submit}
          className="h-12 flex-1 rounded-[--radius-control] bg-ink text-[0.9375rem] font-bold text-white disabled:opacity-40"
        >
          {pending ? 'Unlocking…' : 'Unlock'}
        </button>
      </div>
    </div>
  )

  // From the masthead the panel has to float, or it would push the customer's
  // estimate down the page while they are reading it.
  if (!compact) return panel

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/40 px-5 pt-24">
      {panel}
    </div>
  )
}

/**
 * The company's masthead, theirs not ours.
 *
 * The customer's relationship is with the garage door company standing in
 * their driveway. Garage Door HQ does not appear on this screen at all.
 */
function Shell({
  company,
  children,
  bare,
  exit = true,
}: {
  company: Company
  children: React.ReactNode
  bare?: boolean
  /** The stages that carry their own exit turn this off. */
  exit?: boolean
}) {
  return (
    <div className="min-h-dvh bg-surface">
      <div
        className={cn(
          'safe-top relative flex items-center justify-center gap-3 border-b border-hairline bg-surface px-5 py-4',
          bare && 'border-b-0',
        )}
      >
        {/*
          The way out, on every screen.
          
          A technician needs to be able to stop halfway — the customer says
          they want to think about it, or wants it emailed instead — and
          without this the only way out of the middle of a presentation would
          be to sign something. It is small and unremarkable rather than
          hidden: it leads to a password box, so how visible it is changes
          nothing about who can use it.
        */}
        {exit ? (
          // Centred with flex rather than a translate: a transform on an
          // ancestor becomes the containing block for `position: fixed` and
          // opens its own stacking context, which would trap the unlock panel
          // behind the estimate it is supposed to cover.
          <div className="absolute inset-y-0 right-3 flex items-center">
            <ExitControl label="Technician" compact />
          </div>
        ) : null}
        {company.logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={company.logoSrc}
            alt={company.name}
            className="h-9 w-auto max-w-[160px] object-contain"
          />
        ) : null}
        <div className="text-center">
          <p className="text-[1.0625rem] font-bold leading-tight text-ink">{company.name}</p>
          {company.phone ? <p className="num text-sm text-ink-muted">{company.phone}</p> : null}
        </div>
      </div>
      {children}
    </div>
  )
}

function OptionCard({
  option,
  layout,
  currency,
  selected,
  onSelect,
}: {
  option: PresentedOption
  layout: OptionLayout
  currency: string
  selected: boolean
  onSelect: () => void
}) {
  const badge = badgeFor(option, layout)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'block w-full rounded-[--radius-card] border-2 p-5 text-left transition-colors',
        selected
          ? 'border-brand-600 bg-brand-50'
          : 'border-hairline-strong bg-surface active:bg-surface-sunken',
      )}
    >
      {badge ? (
        <span
          className={cn(
            'mb-2 inline-block rounded-[--radius-chip] px-2.5 py-1 text-[0.75rem] font-bold uppercase tracking-[0.1em]',
            badge.tone === 'tier' ? 'bg-navy-100 text-navy-700' : 'bg-brand-600 text-white',
          )}
        >
          {badge.text}
        </span>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[1.25rem] font-bold leading-tight text-ink">{option.name}</p>
          {option.description ? (
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-muted">
              {option.description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-none items-center gap-3">
          <p className="num text-[1.5rem] font-bold leading-none text-ink">
            {formatCents(option.totalCents, { currency, showCents: false })}
          </p>
          <span
            aria-hidden="true"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full border-2',
              selected ? 'border-brand-600 bg-brand-600' : 'border-hairline-strong',
            )}
          >
            {selected ? <CheckIcon className="h-4 w-4 text-white" /> : null}
          </span>
        </div>
      </div>

      {option.items.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-hairline pt-3">
          {option.items.map((item) => (
            <li key={item.id} className="flex gap-2 text-[0.9375rem] text-ink-muted">
              <CheckIcon className="mt-1 h-3.5 w-3.5 flex-none text-success-600" />
              <span>
                {item.quantity > 1 ? `${item.quantity} × ` : ''}
                {item.name}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </button>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="flex-none text-ink-subtle">{label}</dt>
      <dd className="min-w-0 text-ink">{value}</dd>
    </div>
  )
}

function Money({ label, cents, currency }: { label: string; cents: number; currency: string }) {
  return (
    <div className="flex items-baseline justify-between text-ink-muted">
      <dt>{label}</dt>
      <dd className="num">{formatCents(cents, { currency })}</dd>
    </div>
  )
}
