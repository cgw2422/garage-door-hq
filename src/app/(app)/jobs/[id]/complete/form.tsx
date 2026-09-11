'use client'

import { useActionState, useState } from 'react'
import { cn } from '@/lib/cn'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, Divider } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { PageBody } from '@/components/app/page-header'
import { PhotoCapture } from '@/components/app/photo-capture'
import { SignaturePad } from '@/components/app/signature-pad'
import { Chip } from '@/components/ui/status'
import { CheckIcon, MinusIcon, PlusIcon, SpringIcon } from '@/components/ui/icons'
import { completeJobAction } from './actions'

interface PartRow {
  priceBookItemId: string
  name: string
  sku: string | null
  quantity: number
  isSpring: boolean
  onHand: number
}

/**
 * The completion checklist.
 *
 * Everything here is one transaction on the server: parts leave the truck, the
 * Door Passport records what changed, the invoice is generated from the signed
 * option and the job's costing is recalculated — or none of it happens.
 */
export function CompleteJobForm({
  jobId,
  locationName,
  hasAcceptedEstimate,
  acceptedOptionName,
  suggestedParts,
  catalog,
  afterPhotoCount,
  hasSignature,
  doorLabel,
}: {
  jobId: string
  locationName: string
  hasAcceptedEstimate: boolean
  acceptedOptionName: string | null
  suggestedParts: PartRow[]
  catalog: Array<{ id: string; name: string; sku: string | null }>
  afterPhotoCount: number
  hasSignature: boolean
  doorLabel: string | null
}) {
  const [state, formAction] = useActionState<FormState, FormData>(completeJobAction, {})
  const [parts, setParts] = useState<PartRow[]>(suggestedParts)
  const [addId, setAddId] = useState(catalog[0]?.id ?? '')
  const [signature, setSignature] = useState<string | null>(null)
  const [signerName, setSignerName] = useState('')
  const [finish, setFinish] = useState<'payment' | 'invoice'>('payment')

  const springsReplaced = parts.some((part) => part.isSpring)
  const shortages = parts.filter((part) => part.quantity > part.onHand)

  function setQuantity(itemId: string, quantity: number) {
    setParts((current) =>
      current
        .map((part) =>
          part.priceBookItemId === itemId ? { ...part, quantity: Math.max(quantity, 0) } : part,
        )
        .filter((part) => part.quantity > 0),
    )
  }

  function addPart() {
    const item = catalog.find((entry) => entry.id === addId)
    if (!item) return
    setParts((current) =>
      current.some((part) => part.priceBookItemId === item.id)
        ? current.map((part) =>
            part.priceBookItemId === item.id ? { ...part, quantity: part.quantity + 1 } : part,
          )
        : [
            ...current,
            {
              priceBookItemId: item.id,
              name: item.name,
              sku: item.sku,
              quantity: 1,
              isSpring: false,
              onHand: 0,
            },
          ],
    )
  }

  return (
    <form action={formAction}>
      <PageBody className="pb-8">
        <input type="hidden" name="jobId" value={jobId} />
        <input
          type="hidden"
          name="partsJson"
          value={JSON.stringify(
            parts.map((part) => ({
              priceBookItemId: part.priceBookItemId,
              quantity: part.quantity,
            })),
          )}
        />
        <input type="hidden" name="signatureDataUrl" value={signature ?? ''} />
        <input type="hidden" name="finish" value={finish} />

        <Card>
          <CardHeader title="Before you finish" />
          <ul className="space-y-2.5">
            <CheckRow done={hasAcceptedEstimate}>
              {hasAcceptedEstimate
                ? `Customer approved ${acceptedOptionName}`
                : 'No signed estimate — the invoice will be built from parts used'}
            </CheckRow>
            <CheckRow done={parts.length > 0}>
              {parts.length > 0
                ? `${parts.length} part line${parts.length === 1 ? '' : 's'} recorded`
                : 'No parts recorded'}
            </CheckRow>
            <CheckRow done={afterPhotoCount > 0}>
              {afterPhotoCount > 0 ? `${afterPhotoCount} after photo(s)` : 'No after photos yet'}
            </CheckRow>
            <CheckRow done={hasSignature || Boolean(signature)}>
              {hasSignature || signature ? 'Signature captured' : 'No completion signature'}
            </CheckRow>
          </ul>
        </Card>

        <Card>
          <CardHeader title={`Parts Used · ${locationName}`} />
          {parts.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Nothing recorded. Add anything that came off the truck so stock stays accurate.
            </p>
          ) : (
            <ul className="space-y-3">
              {parts.map((part) => (
                <li key={part.priceBookItemId} className="flex items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.9375rem] font-medium text-ink">{part.name}</p>
                    <p className="num text-xs text-ink-subtle">
                      {part.sku ? `${part.sku} · ` : ''}
                      {part.onHand} on hand
                      {part.isSpring ? ' · updates the Door Passport' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Fewer ${part.name}`}
                      onClick={() => setQuantity(part.priceBookItemId, part.quantity - 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline-strong text-ink-muted"
                    >
                      <MinusIcon className="h-4 w-4" />
                    </button>
                    <span className="num w-7 text-center text-[0.9375rem] font-bold text-ink">
                      {part.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`More ${part.name}`}
                      onClick={() => setQuantity(part.priceBookItemId, part.quantity + 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline-strong text-ink-muted"
                    >
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Divider className="my-3" />

          <div className="flex gap-2">
            <Select
              value={addId}
              onChange={(event) => setAddId(event.target.value)}
              aria-label="Add a part"
              className="flex-1"
            >
              {catalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.sku ? ` · ${item.sku}` : ''}
                </option>
              ))}
            </Select>
            <Button type="button" variant="secondary" icon={<PlusIcon />} onClick={addPart}>
              Add
            </Button>
          </div>

          {shortages.length > 0 ? (
            <Alert tone="warning" className="mt-3" title="More than you have on hand">
              {shortages.map((part) => part.name).join(', ')}. Completing will be refused until the
              counts match — adjust inventory or correct the quantity.
            </Alert>
          ) : null}
        </Card>

        {springsReplaced && doorLabel ? (
          <Card className="border-brand-100 bg-brand-50">
            <div className="flex gap-3">
              <SpringIcon className="h-5 w-5 shrink-0 text-brand-600" />
              <div className="text-sm text-brand-800">
                <p className="font-semibold">{doorLabel}&apos;s passport will be updated</p>
                <p className="mt-0.5 leading-relaxed">
                  The current spring system becomes historical and the springs you fitted become
                  current, with a timeline entry showing what changed.
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="After Photos" />
          <PhotoCapture
            kind="AFTER"
            label="Take after photos"
            target={{ jobId }}
            revalidate={`/jobs/${jobId}/complete`}
          />
        </Card>

        <Card>
          <CardHeader title="Work Performed" />
          <Textarea
            name="workSummary"
            rows={3}
            placeholder="Replaced both torsion springs, balanced the door, tested safety reverse."
          />
        </Card>

        <Card>
          <CardHeader title="Customer Sign-Off" />
          <p className="mb-3 -mt-1 text-sm text-ink-muted">Optional, but it ends arguments.</p>
          <div className="space-y-3">
            <Field label="Signed by">
              <Input
                name="signerName"
                value={signerName}
                onChange={(event) => setSignerName(event.target.value)}
                autoComplete="name"
              />
            </Field>
            <SignaturePad label="Work completion signature" onChange={setSignature} height={150} />
          </div>
        </Card>

        <Card>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="requestReview"
              defaultChecked
              className="h-5 w-5 rounded border-hairline-strong text-brand-500"
            />
            <span className="text-[0.9375rem] text-ink">
              Queue a review request for this customer
            </span>
          </label>
        </Card>

        {state.error ? <Alert>{state.error}</Alert> : null}

        <div className="space-y-2.5">
          <SubmitButton
            size="lg"
            fullWidth
            onClick={() => setFinish('payment')}
            pendingLabel="Completing…"
          >
            Complete &amp; Collect Payment
          </SubmitButton>
          <SubmitButton
            size="lg"
            fullWidth
            variant="secondary"
            onClick={() => setFinish('invoice')}
            pendingLabel="Completing…"
          >
            Complete &amp; Send Invoice
          </SubmitButton>
        </div>
      </PageBody>
    </form>
  )
}

function CheckRow({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          done ? 'bg-success-50 text-success-600' : 'bg-surface-sunken text-ink-subtle',
        )}
      >
        {done ? <CheckIcon className="h-3.5 w-3.5" /> : <span className="text-xs">—</span>}
      </span>
      <span className={cn('text-sm', done ? 'text-ink' : 'text-ink-muted')}>{children}</span>
      {done ? null : <Chip tone="neutral">optional</Chip>}
    </li>
  )
}
