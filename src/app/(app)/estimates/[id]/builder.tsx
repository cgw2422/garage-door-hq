'use client'

import { useActionState, useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { EstimateTier } from '@prisma/client'
import { cn } from '@/lib/cn'
import { formatCents } from '@/lib/money'
import { TIER_LABELS, primaryChannel } from '@/lib/estimate-presentation'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, Divider, EmptyState, SectionHeading } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { PageBody, StickyActions } from '@/components/app/page-header'
import { SendDocument } from '@/components/app/send-document'
import { Chip } from '@/components/ui/status'
import { DocumentIcon, MinusIcon, PlusIcon } from '@/components/ui/icons'
import {
  addItemAction,
  addPackageAction,
  presentEstimateAction,
  removeItemAction,
  removeOptionAction,
  setQuantityAction,
  setRecommendedAction,
  setTaxRateAction,
} from './actions'

type Tier = EstimateTier | null

interface OptionView {
  id: string
  tier: Tier
  name: string
  description: string | null
  isRecommended: boolean
  subtotalCents: number
  taxCents: number
  totalCents: number
  items: Array<{
    id: string
    name: string
    sku: string | null
    kind: string
    quantity: number
    unitPriceCents: number
    lineCents: number
  }>
}

export function EstimateBuilder({
  estimate,
  options,
  packages,
  catalog,
  currency,
  canEditTax,
  defaultTaxRateBps,
  portalLink,
  signature,
  customerEmail,
  customerName,
  emailConfigured,
}: {
  estimate: {
    id: string
    number: number
    status: string
    title: string | null
    taxRateBps: number
    taxRateLabel: string
    taxRateOverridden: boolean
    selectedOptionId: string | null
    jobId: string | null
    editable: boolean
    kind: 'REPAIR' | 'INSTALLATION'
  }
  options: OptionView[]
  packages: Array<{ id: string; name: string; defaultTier: Tier | null }>
  catalog: Array<{ id: string; label: string; category: string }>
  currency: string
  canEditTax: boolean
  defaultTaxRateBps: number
  portalLink: {
    id: string
    expiresAt: string
    viewCount: number
    lastViewedAt: string | null
  } | null
  signature: {
    id: string
    signerName: string
    signedAt: string
    version: number | null
    hash: string | null
  } | null
  customerEmail: string | null
  customerName: string
  /** False when no email provider is set; the send panel then never claims one. */
  emailConfigured: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [addPackageState, addPackage] = useActionState<FormState, FormData>(addPackageAction, {})
  const [addItemState, addItem] = useActionState<FormState, FormData>(addItemAction, {})
  const [taxState, saveTax] = useActionState<FormState, FormData>(setTaxRateAction, {})
  const [presentState, present] = useActionState<FormState, FormData>(presentEstimateAction, {})
  const [showTax, setShowTax] = useState(false)

  const hasLines = options.some((option) => option.items.length > 0)
  const sendFirst = primaryChannel(estimate.kind) === 'send'

  return (
    <>
      <PageBody>
        {signature ? (
          <Card className="border-success-100 bg-success-50">
            <p className="text-sm font-semibold text-success-700">
              Signed by {signature.signerName}
            </p>
            <p className="mt-0.5 text-sm text-success-700/90">
              {new Date(signature.signedAt).toLocaleString()}
              {signature.version ? ` · version ${signature.version}` : ''}
            </p>
            <div className="mt-3 rounded-[--radius-control] border border-success-100 bg-white p-2">
              <div className="relative h-20 w-full">
                <Image
                  src={`/api/files/signatures/${signature.id}`}
                  alt={`Signature of ${signature.signerName}`}
                  fill
                  unoptimized
                  sizes="400px"
                  className="object-contain"
                />
              </div>
            </div>
            {signature.hash ? (
              <p className="num mt-2 break-all text-[0.6875rem] text-success-700/70">
                Document hash {signature.hash.slice(0, 32)}…
              </p>
            ) : null}
          </Card>
        ) : null}

        {options.length === 0 ? (
          <Card>
            <EmptyState
              icon={<DocumentIcon />}
              title="Nothing on this estimate yet"
              body="Add a package below, or run the inspection and tap the work you found."
              action={
                estimate.jobId ? (
                  <ButtonLink href={`/jobs/${estimate.jobId}/inspection`} size="sm">
                    Open inspection
                  </ButtonLink>
                ) : null
              }
            />
          </Card>
        ) : (
          options.map((option) => (
            <OptionCard
              key={option.id}
              option={option}
              estimateId={estimate.id}
              currency={currency}
              editable={estimate.editable}
              isSelected={estimate.selectedOptionId === option.id}
              onChanged={() => startTransition(() => router.refresh())}
            />
          ))
        )}

        {estimate.editable ? (
          <>
            <div>
              <SectionHeading>Add a Package</SectionHeading>
              <Card>
                <form action={addPackage} className="flex gap-2">
                  <input type="hidden" name="estimateId" value={estimate.id} />
                  <Select name="packageId" required className="flex-1">
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name}
                        {pkg.defaultTier && pkg.defaultTier !== 'STANDARD'
                          ? ` (${TIER_LABELS[pkg.defaultTier]})`
                          : ''}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton icon={<PlusIcon />} pendingLabel="Adding…">
                    Add
                  </SubmitButton>
                </form>
                {addPackageState.error ? (
                  <Alert className="mt-2">{addPackageState.error}</Alert>
                ) : null}
              </Card>
            </div>

            <div>
              <SectionHeading>Add a Single Item</SectionHeading>
              <Card>
                <form action={addItem} className="space-y-3">
                  <input type="hidden" name="estimateId" value={estimate.id} />
                  <Select name="priceBookItemId" required aria-label="Price book item">
                    {catalog.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                  <div className="flex gap-2">
                    {options.length > 0 ? (
                      <Select name="optionId" aria-label="Add to option" className="flex-1">
                        {options.map((option) => (
                          <option key={option.id} value={option.id}>
                            Add to {option.name}
                          </option>
                        ))}
                      </Select>
                    ) : null}
                    <Input
                      name="quantity"
                      inputMode="decimal"
                      defaultValue="1"
                      aria-label="Quantity"
                      className="num w-20 text-center"
                    />
                    <SubmitButton icon={<PlusIcon />} pendingLabel="Adding…">
                      Add
                    </SubmitButton>
                  </div>
                </form>
                {addItemState.error ? <Alert className="mt-2">{addItemState.error}</Alert> : null}
              </Card>
            </div>

            <Card>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.9375rem] font-semibold text-ink">
                    Tax {estimate.taxRateLabel}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {estimate.taxRateOverridden
                      ? 'Overridden on this estimate'
                      : 'From your company settings'}
                  </p>
                </div>
                {canEditTax ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowTax((open) => !open)}
                  >
                    {showTax ? 'Cancel' : 'Change'}
                  </Button>
                ) : null}
              </div>

              {showTax && canEditTax ? (
                <form action={saveTax} className="mt-3 space-y-3">
                  <input type="hidden" name="estimateId" value={estimate.id} />
                  <div className="flex gap-2">
                    <Field label="Rate %" className="flex-1">
                      <Input
                        name="taxRatePercent"
                        inputMode="decimal"
                        className="num"
                        defaultValue={(estimate.taxRateBps / 100).toString()}
                      />
                    </Field>
                    <Field label="Jurisdiction" className="flex-1">
                      <Input name="taxJurisdiction" placeholder="Mecklenburg County" />
                    </Field>
                  </div>
                  <p className="text-xs text-ink-subtle">
                    Company default is {(defaultTaxRateBps / 100).toFixed(2)}%. Changing it here
                    affects this estimate only.
                  </p>
                  {taxState.error ? <Alert>{taxState.error}</Alert> : null}
                  <SubmitButton fullWidth pendingLabel="Saving…">
                    Save tax rate
                  </SubmitButton>
                </form>
              ) : null}
            </Card>
          </>
        ) : null}

        {hasLines ? (
          <div id="send-to-customer" className="scroll-mt-20">
          <SendDocument
            target="ESTIMATE"
            documentId={estimate.id}
            customerEmail={customerEmail}
            customerName={customerName}
            emailConfigured={emailConfigured}
            existingLink={portalLink}
            label="Send to the customer"
          />
          </div>
        ) : null}

        {hasLines ? (
          <a
            href={`/api/documents/estimates/${estimate.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[--radius-control] border border-hairline-strong bg-surface font-semibold text-ink active:bg-surface-sunken"
          >
            <DocumentIcon className="h-[1.15em] w-[1.15em]" />
            {signature ? 'Signed PDF' : 'Preview PDF'}
          </a>
        ) : null}

        {presentState.error ? <Alert>{presentState.error}</Alert> : null}
      </PageBody>

      <StickyActions>
        {estimate.status === 'ACCEPTED' ? (
          <ButtonLink href={`/jobs/${estimate.jobId}`} size="lg" className="flex-1">
            Back to job
          </ButtonLink>
        ) : (
          /*
           * Two channels, one document. Which one leads depends on what is
           * being sold: a repair is closed standing in the driveway, so
           * presenting is primary; a new door is a decision people take home,
           * so sending is. Neither is ever the only way.
           */
          <div className="flex-1 space-y-2">
            {sendFirst ? (
              <>
                <a
                  href="#send-to-customer"
                  className="safe-tap flex h-12 w-full items-center justify-center rounded-[--radius-control] bg-brand-600 text-base font-bold text-white active:bg-brand-700"
                >
                  Send to Customer
                </a>
                <form action={present}>
                  <input type="hidden" name="estimateId" value={estimate.id} />
                  <SubmitButton
                    variant="secondary"
                    fullWidth
                    disabled={!hasLines}
                    pendingLabel="Opening…"
                  >
                    Present on this device
                  </SubmitButton>
                </form>
              </>
            ) : (
              <>
                <form action={present}>
                  <input type="hidden" name="estimateId" value={estimate.id} />
                  <SubmitButton size="lg" fullWidth disabled={!hasLines} pendingLabel="Opening…">
                    Present to Customer
                  </SubmitButton>
                </form>
                {hasLines ? (
                  <a
                    href="#send-to-customer"
                    className="block py-1 text-center text-sm font-semibold text-brand-600"
                  >
                    Send instead
                  </a>
                ) : null}
              </>
            )}
          </div>
        )}
      </StickyActions>
    </>
  )
}

function OptionCard({
  option,
  estimateId,
  currency,
  editable,
  isSelected,
  onChanged,
}: {
  option: OptionView
  estimateId: string
  currency: string
  editable: boolean
  isSelected: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)

  async function run(work: () => Promise<unknown>) {
    setBusy(true)
    try {
      await work()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      className={cn(
        isSelected && 'border-brand-500 ring-1 ring-brand-500',
        option.isRecommended && !isSelected && 'border-brand-200',
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {/* A tier label only where there is a tier. Most estimates have
                none, and the option's own name is what it is called. */}
            {option.tier ? (
              <span className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
                {TIER_LABELS[option.tier]}
              </span>
            ) : null}
            {option.isRecommended ? <Chip tone="brand">Recommended</Chip> : null}
            {isSelected ? <Chip tone="success">Selected</Chip> : null}
          </div>
          <p className="mt-1 text-base font-bold text-ink">{option.name}</p>
          {option.description ? (
            <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{option.description}</p>
          ) : null}
        </div>
        <span className="num shrink-0 text-xl font-bold text-ink">
          {formatCents(option.totalCents, { currency })}
        </span>
      </div>

      <Divider />

      <ul className="my-3 space-y-2.5">
        {option.items.length === 0 ? (
          <li className="text-sm text-ink-subtle">No lines on this option yet.</li>
        ) : (
          option.items.map((item) => (
            <li key={item.id} className="flex items-start gap-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] text-ink">{item.name}</p>
                <p className="num text-xs text-ink-subtle">
                  {item.quantity} × {formatCents(item.unitPriceCents, { currency })}
                  {item.sku ? ` · ${item.sku}` : ''}
                </p>
              </div>
              <span className="num shrink-0 text-[0.9375rem] font-semibold text-ink">
                {formatCents(item.lineCents, { currency })}
              </span>
              {editable ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Decrease ${item.name}`}
                    disabled={busy || item.quantity <= 1}
                    onClick={() =>
                      run(() =>
                        setQuantityAction({
                          estimateId,
                          itemId: item.id,
                          quantity: item.quantity - 1,
                        }),
                      )
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-hairline-strong text-ink-muted disabled:opacity-40"
                  >
                    <MinusIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Increase ${item.name}`}
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        setQuantityAction({
                          estimateId,
                          itemId: item.id,
                          quantity: item.quantity + 1,
                        }),
                      )
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-hairline-strong text-ink-muted disabled:opacity-40"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    disabled={busy}
                    onClick={() => run(() => removeItemAction({ estimateId, itemId: item.id }))}
                    className="px-1 text-xs font-semibold text-danger-600 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>

      <Divider />

      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Subtotal</dt>
          <dd className="num font-semibold text-ink">
            {formatCents(option.subtotalCents, { currency })}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Tax</dt>
          <dd className="num font-semibold text-ink">
            {formatCents(option.taxCents, { currency })}
          </dd>
        </div>
        <div className="flex justify-between border-t border-hairline pt-1.5">
          <dt className="font-semibold text-ink">Total</dt>
          <dd className="num font-bold text-ink">
            {formatCents(option.totalCents, { currency })}
          </dd>
        </div>
      </dl>

      {editable ? (
        <div className="mt-3 flex gap-2">
          {!option.isRecommended ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => run(() => setRecommendedAction({ estimateId, optionId: option.id }))}
              className="flex-1"
            >
              Mark recommended
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => run(() => removeOptionAction({ estimateId, optionId: option.id }))}
            className="text-danger-600"
          >
            Remove option
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
