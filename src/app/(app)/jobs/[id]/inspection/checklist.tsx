'use client'

import { useActionState, useMemo, useOptimistic, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { InspectionItemStatus } from '@prisma/client'
import { cn } from '@/lib/cn'
import { formatCents } from '@/lib/money'
import { isActionable } from '@/lib/inspection-template'
import type { RemedyOption } from '@/server/inspections/service'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, Divider, SectionHeading } from '@/components/ui/card'
import { Textarea } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { PageBody, StickyActions } from '@/components/app/page-header'
import { PhotoCapture } from '@/components/app/photo-capture'
import { Chip } from '@/components/ui/status'
import { CameraIcon, PlusIcon } from '@/components/ui/icons'
import {
  addRemedyAction,
  addTieredOptionsAction,
  finishInspectionAction,
  setNoteAction,
  setStatusAction,
} from './actions'

export interface ChecklistItem {
  id: string
  componentKey: string
  label: string
  status: InspectionItemStatus
  note: string | null
  quoted: boolean
  photoCount: number
  group: string
  hint: string | null
}

interface EstimateSummary {
  id: string
  optionCount: number
  lineCount: number
  totalCents: number
}

/**
 * Five states, short labels, one tap each. A technician walking a door should
 * be able to mark every component without reading anything twice.
 */
const STATUS_BUTTONS: Array<{
  value: InspectionItemStatus
  short: string
  full: string
  tone: string
}> = [
  { value: 'GOOD', short: 'Good', full: 'Good', tone: 'data-[on=true]:bg-success-500' },
  { value: 'WORN', short: 'Worn', full: 'Worn', tone: 'data-[on=true]:bg-warning-500' },
  { value: 'NEEDS_ATTENTION', short: 'Attn', full: 'Needs attention', tone: 'data-[on=true]:bg-warning-600' },
  { value: 'FAILED', short: 'Fail', full: 'Failed', tone: 'data-[on=true]:bg-danger-500' },
  { value: 'NOT_APPLICABLE', short: 'N/A', full: 'Not applicable', tone: 'data-[on=true]:bg-navy-500' },
]

const GROUP_ORDER = ['Spring System', 'Hardware', 'Door', 'Opener', 'Safety']

export function InspectionChecklist({
  jobId,
  inspectionId,
  currency,
  items,
  remedies,
  estimate,
}: {
  jobId: string
  inspectionId: string
  currency: string
  items: ChecklistItem[]
  remedies: Record<string, RemedyOption[]>
  estimate: EstimateSummary | null
}) {
  const [optimisticItems, applyStatus] = useOptimistic(
    items,
    (current, update: { id: string; status: InspectionItemStatus }) =>
      current.map((item) => (item.id === update.id ? { ...item, status: update.status } : item)),
  )
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [finishState, finishAction] = useActionState<FormState, FormData>(
    finishInspectionAction,
    {},
  )
  const router = useRouter()

  const groups = useMemo(() => {
    const byGroup = new Map<string, ChecklistItem[]>()
    for (const item of optimisticItems) {
      const bucket = byGroup.get(item.group) ?? []
      bucket.push(item)
      byGroup.set(item.group, bucket)
    }
    return GROUP_ORDER.filter((group) => byGroup.has(group)).map((group) => ({
      group,
      items: byGroup.get(group)!,
    }))
  }, [optimisticItems])

  const checked = optimisticItems.filter((item) => item.status !== 'NOT_CHECKED').length
  const findings = optimisticItems.filter((item) => isActionable(item.status))
  const quoted = optimisticItems.filter((item) => item.quoted).length

  function setStatus(item: ChecklistItem, status: InspectionItemStatus) {
    setError(null)
    startTransition(async () => {
      applyStatus({ id: item.id, status })
      await setStatusAction({ itemId: item.id, status, jobId })
    })
  }

  async function addRemedy(item: ChecklistItem, remedy: RemedyOption) {
    setError(null)
    const result = await addRemedyAction({ jobId, itemId: item.id, remedyId: remedy.id })
    if (!result.ok) setError(result.error)
    else router.refresh()
  }

  async function addTiered(item: ChecklistItem) {
    setError(null)
    const result = await addTieredOptionsAction({
      jobId,
      itemId: item.id,
      componentKey: item.componentKey,
    })
    if (!result.ok) setError(result.error)
    else router.refresh()
  }

  return (
    <>
      <PageBody className="pb-40">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="num text-2xl font-bold leading-none text-ink">
                {checked}
                <span className="text-base font-semibold text-ink-subtle">
                  /{optimisticItems.length}
                </span>
              </p>
              <p className="mt-1 text-sm text-ink-muted">components checked</p>
            </div>
            <div className="flex gap-2">
              {findings.length > 0 ? (
                <Chip tone="warning">{findings.length} findings</Chip>
              ) : (
                <Chip tone="success">No findings</Chip>
              )}
              {quoted > 0 ? <Chip tone="brand">{quoted} quoted</Chip> : null}
            </div>
          </div>
        </Card>

        {error ? <Alert>{error}</Alert> : null}

        {groups.map(({ group, items: groupItems }) => (
          <div key={group}>
            <SectionHeading>{group}</SectionHeading>
            <Card padded={false}>
              {groupItems.map((item, index) => (
                <div key={item.id}>
                  {index > 0 ? <Divider className="ml-4" /> : null}
                  <ChecklistRow
                    item={item}
                    jobId={jobId}
                    currency={currency}
                    remedies={(remedies[item.componentKey] ?? []).filter(
                      (remedy) =>
                        remedy.forStatuses.length === 0 ||
                        remedy.forStatuses.includes(item.status),
                    )}
                    onStatus={(status) => setStatus(item, status)}
                    onAddRemedy={(remedy) => void addRemedy(item, remedy)}
                    onAddTiered={() => void addTiered(item)}
                  />
                </div>
              ))}
            </Card>
          </div>
        ))}

        <form action={finishAction} className="space-y-3">
          <input type="hidden" name="inspectionId" value={inspectionId} />
          <input type="hidden" name="jobId" value={jobId} />
          <Card>
            <SectionHeading>Summary</SectionHeading>
            <Textarea
              name="summary"
              rows={3}
              placeholder="Leave blank and we'll summarize the findings for you."
            />
          </Card>
          {finishState.error ? <Alert>{finishState.error}</Alert> : null}
          <SubmitButton variant="secondary" size="lg" fullWidth pendingLabel="Finishing…">
            Finish inspection
          </SubmitButton>
        </form>
      </PageBody>

      <StickyActions>
        {estimate && estimate.lineCount > 0 ? (
          <ButtonLink href={`/estimates/${estimate.id}`} size="lg" className="flex-1">
            Review Estimate · {formatCents(estimate.totalCents, { currency, showCents: false })}
          </ButtonLink>
        ) : (
          <ButtonLink
            href={`/jobs/${jobId}/estimates/new`}
            variant="secondary"
            size="lg"
            className="flex-1"
          >
            Build estimate manually
          </ButtonLink>
        )}
      </StickyActions>
    </>
  )
}

function ChecklistRow({
  item,
  jobId,
  currency,
  remedies,
  onStatus,
  onAddRemedy,
  onAddTiered,
}: {
  item: ChecklistItem
  jobId: string
  currency: string
  remedies: RemedyOption[]
  onStatus: (status: InspectionItemStatus) => void
  onAddRemedy: (remedy: RemedyOption) => void
  onAddTiered: () => void
}) {
  const [showDetail, setShowDetail] = useState(false)
  const [note, setNote] = useState(item.note ?? '')
  const actionable = isActionable(item.status)

  const tiers = new Set(remedies.map((remedy) => remedy.tier))
  const hasFullSet = tiers.has('GOOD') && tiers.has('BETTER') && tiers.has('BEST')

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-semibold text-ink">{item.label}</p>
          {item.hint ? <p className="text-xs text-ink-subtle">{item.hint}</p> : null}
        </div>
        {item.quoted ? (
          <Chip tone="success" dot>
            Quoted
          </Chip>
        ) : null}
      </div>

      <div className="mt-2.5 grid grid-cols-5 gap-1.5">
        {STATUS_BUTTONS.map((button) => {
          const on = item.status === button.value
          return (
            <button
              key={button.value}
              type="button"
              data-on={on}
              aria-pressed={on}
              aria-label={`${item.label}: ${button.full}`}
              onClick={() => onStatus(button.value)}
              className={cn(
                'h-10 rounded-[--radius-control] border text-[0.8125rem] font-bold transition-colors',
                on
                  ? cn('border-transparent text-white', button.tone)
                  : 'border-hairline-strong bg-surface text-ink-muted active:bg-surface-sunken',
              )}
            >
              {button.short}
            </button>
          )
        })}
      </div>

      {actionable && remedies.length > 0 ? (
        <div className="mt-2.5 space-y-2 rounded-[--radius-control] bg-surface-sunken p-2.5">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-subtle">
            Add to estimate
          </p>

          {hasFullSet ? (
            <Button
              type="button"
              size="sm"
              fullWidth
              icon={<PlusIcon />}
              onClick={onAddTiered}
            >
              Add Good / Better / Best
            </Button>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {remedies.map((remedy) => (
              <button
                key={remedy.id}
                type="button"
                onClick={() => onAddRemedy(remedy)}
                className="inline-flex items-center gap-1.5 rounded-[--radius-chip] border border-brand-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-700 active:bg-brand-50"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                {remedy.name}
                <span className="num text-ink-muted">
                  {formatCents(remedy.priceCents, { currency, showCents: false })}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowDetail((open) => !open)}
          className="text-[0.8125rem] font-semibold text-brand-600"
        >
          {showDetail ? 'Hide' : item.note ? 'Edit note' : 'Add note'}
        </button>
        {item.photoCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-ink-subtle">
            <CameraIcon className="h-3.5 w-3.5" />
            {item.photoCount}
          </span>
        ) : null}
        {item.note && !showDetail ? (
          <span className="min-w-0 truncate text-xs text-ink-muted">· {item.note}</span>
        ) : null}
      </div>

      {showDetail ? (
        <div className="mt-2 space-y-2">
          <Textarea
            rows={2}
            value={note}
            placeholder="What did you see?"
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => {
              if (note !== (item.note ?? '')) {
                void setNoteAction({ itemId: item.id, note: note || null, jobId })
              }
            }}
          />
          <PhotoCapture
            compact
            kind="INSPECTION"
            label="Photo"
            target={{ inspectionItemId: item.id }}
            revalidate={`/jobs/${jobId}/inspection`}
          />
        </div>
      ) : null}
    </div>
  )
}
