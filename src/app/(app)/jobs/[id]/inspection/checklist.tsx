'use client'

import {
  useActionState,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from 'react'
import { useRouter } from 'next/navigation'
import type { InspectionItemStatus, InspectionResponseType } from '@prisma/client'
import { cn } from '@/lib/cn'
import { formatCents } from '@/lib/money'
import {
  RESPONSE_SETS,
  STATUS_LABELS,
  STATUS_LABELS_COMPACT,
  isActionable,
  severityOf,
} from '@/lib/inspection-template'
import { isRemedyQuoted, remedyApplies, type RemedyOption } from '@/server/inspections/service'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, Divider, SectionHeading } from '@/components/ui/card'
import { Textarea } from '@/components/ui/field'
import { DraftStatus } from '@/components/app/draft-status'
import { useFieldDraft } from '@/components/app/use-field-draft'
import { SubmitButton } from '@/components/ui/submit-button'
import { PageBody, StickyActions } from '@/components/app/page-header'
import { PhotoCapture } from '@/components/app/photo-capture'
import { Chip } from '@/components/ui/status'
import { CameraIcon, CheckIcon, PlusIcon } from '@/components/ui/icons'
import {
  addRemedyAction,
  addTieredOptionsAction,
  finishInspectionAction,
  removeRemedyAction,
  setNoteAction,
  setStatusAction,
  type QuoteResult,
} from './actions'

export interface ChecklistItem {
  id: string
  componentKey: string
  label: string
  status: InspectionItemStatus
  responseType: InspectionResponseType
  note: string | null
  quoted: boolean
  photoCount: number
  group: string
  hint: string | null
  /** ISO timestamp, so a local draft never overwrites a newer server value. */
  updatedAt: string | null
}

interface EstimateSummary {
  id: string
  optionCount: number
  lineCount: number
  totalCents: number
}

/**
 * Colour by severity, so the whole checklist scans at arm's length: green is
 * fine, amber wants watching, red is a finding, grey is neither. Worn and
 * Needs Attention are both amber but not the same amber — one is an
 * observation, the other is a recommendation.
 */
const SEVERITY_FILL: Record<string, string> = {
  OK: 'data-[on=true]:bg-success-500',
  MONITOR: 'data-[on=true]:bg-warning-500',
  ATTENTION: 'data-[on=true]:bg-warning-600',
  CRITICAL: 'data-[on=true]:bg-danger-500',
  NONE: 'data-[on=true]:bg-navy-500',
}

/**
 * How many choices share a row.
 *
 * Three or four answers get the full width between them rather than being
 * squeezed into five columns for the sake of a grid that no longer applies.
 *
 * Five wrap to two rows instead of shrinking, because they do not fit: on a
 * 390px phone a fifth of the row is 60px and "Attention" needs 69px, measured
 * in the browser rather than guessed. Three columns gives every answer a
 * 107px target — easier to hit with a glove on than five slivers, and the
 * word stays a word. It is never abbreviated to "Attn", which reads like a
 * form field rather than like a technician.
 */
const COLUMNS: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-3',
}

const GROUP_ORDER = ['Spring System', 'Hardware', 'Door', 'Opener', 'Safety']

export function InspectionChecklist({
  jobId,
  inspectionId,
  currency,
  items,
  remedies,
  quotedServices,
  estimate,
}: {
  jobId: string
  inspectionId: string
  currency: string
  items: ChecklistItem[]
  remedies: Record<string, RemedyOption[]>
  /** `TIER:priceBookItemId` for everything already on the draft estimate. */
  quotedServices: string[]
  estimate: EstimateSummary | null
}) {
  const [optimisticItems, applyStatus] = useOptimistic(
    items,
    (current, update: { id: string; status: InspectionItemStatus }) =>
      current.map((item) => (item.id === update.id ? { ...item, status: update.status } : item)),
  )
  /**
   * The quote, as the screen currently understands it.
   *
   * Seeded from the server and then moved by what the add and remove actions
   * answer with, so a tap changes the button, every other button selling the
   * same service, and the running total together — without a refetch the
   * technician has to wait through. The server stays the source of truth: each
   * answer is the state it just wrote, not a guess made here.
   */
  const [quote, setQuote] = useState<{
    quoted: string[]
    estimate: EstimateSummary | null
  }>({ quoted: quotedServices, estimate })

  // A later server render (navigating back from the estimate, say) wins over
  // anything held here.
  const serverQuote = useMemo(
    () => ({ quoted: quotedServices, estimate }),
    [quotedServices, estimate],
  )
  useEffect(() => setQuote(serverQuote), [serverQuote])

  // Covers the moment between the tap and the answer, so the button does not
  // sit there looking untouched while the request is in flight.
  const [optimisticQuoted, nudgeQuoted] = useOptimistic(
    quote.quoted,
    (current, change: { keys: string[]; added: boolean }) =>
      change.added
        ? [...new Set([...current, ...change.keys])]
        : current.filter((key) => !change.keys.includes(key)),
  )
  const quotedSet = useMemo(() => new Set(optimisticQuoted), [optimisticQuoted])
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

  function applyQuote(result: QuoteResult) {
    if (!result.ok) {
      setError(result.error)
      // Put the buttons back where the server says they are.
      router.refresh()
      return
    }
    setQuote({ quoted: result.quoted, estimate: result.estimate })
    // The rest of the screen — the Quoted chips, the findings count — is still
    // the server's to redraw, and does so quietly behind the state above.
    router.refresh()
  }

  /**
   * One button, both directions.
   *
   * Which way it goes is decided by the estimate, not by anything this button
   * remembers: if the service is on the quote the tap takes it off, wherever
   * in the checklist the tap happened.
   */
  function toggleRemedy(item: ChecklistItem, remedy: RemedyOption) {
    setError(null)
    const keys = remedy.targetItemIds.map((id) => `${remedy.tier}:${id}`)
    const added = isRemedyQuoted(remedy, quotedSet)

    startTransition(async () => {
      nudgeQuoted({ keys, added: !added })
      applyQuote(
        added
          ? await removeRemedyAction({ jobId, remedyId: remedy.id })
          : await addRemedyAction({ jobId, itemId: item.id, remedyId: remedy.id }),
      )
    })
  }

  function addTiered(item: ChecklistItem) {
    setError(null)
    startTransition(async () => {
      applyQuote(
        await addTieredOptionsAction({
          jobId,
          itemId: item.id,
          componentKey: item.componentKey,
        }),
      )
    })
  }

  return (
    <>
      <PageBody>
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
                    remedies={(remedies[item.componentKey] ?? []).filter((remedy) =>
                      remedyApplies(remedy.forStatuses, item.status),
                    )}
                    quoted={quotedSet}
                    onStatus={(status) => setStatus(item, status)}
                    onToggleRemedy={(remedy) => toggleRemedy(item, remedy)}
                    onAddTiered={() => addTiered(item)}
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
        {quote.estimate && quote.estimate.lineCount > 0 ? (
          <ButtonLink href={`/estimates/${quote.estimate.id}`} size="lg" className="flex-1">
            Review Estimate ·{' '}
            {formatCents(quote.estimate.totalCents, { currency, showCents: false })}
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
  quoted,
  onStatus,
  onToggleRemedy,
  onAddTiered,
}: {
  item: ChecklistItem
  jobId: string
  currency: string
  remedies: RemedyOption[]
  quoted: ReadonlySet<string>
  onStatus: (status: InspectionItemStatus) => void
  onToggleRemedy: (remedy: RemedyOption) => void
  onAddTiered: () => void
}) {
  const [showDetail, setShowDetail] = useState(false)
  const actionable = isActionable(item.status)
  const choices = RESPONSE_SETS[item.responseType]

  // Notes are the one thing on this screen that is expensive to lose: a
  // technician types what they are looking at, standing in a garage, often on
  // one bar. The draft hook keeps it on the device until the server confirms.
  const draft = useFieldDraft({
    key: `inspection:${item.id}:note`,
    serverValue: item.note ?? '',
    serverUpdatedAt: item.updatedAt,
    save: (value) => setNoteAction({ itemId: item.id, note: value || null, jobId }),
  })

  // A restored draft is worth seeing without opening the row.
  const hasUnsyncedNote = draft.state === 'unsynced' || draft.state === 'failed'

  const tiers = new Set(remedies.map((remedy) => remedy.tier))
  const hasFullSet = tiers.has('GOOD') && tiers.has('BETTER') && tiers.has('BEST')
  // Once all three tiers are on the estimate there is nothing left for the
  // one-tap button to do, and offering it again invites a second tap that
  // looks like it failed.
  const fullSetQuoted =
    hasFullSet &&
    remedies
      .filter((remedy) => remedy.tier !== 'STANDARD')
      .every((remedy) => isRemedyQuoted(remedy, quoted))

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

      <div className={cn('mt-2.5 grid gap-1.5', COLUMNS[choices.length] ?? 'grid-cols-5')}>
        {choices.map((choice) => {
          const on = item.status === choice
          const full = STATUS_LABELS[choice]
          const compact = STATUS_LABELS_COMPACT[choice]
          return (
            <button
              key={choice}
              type="button"
              data-on={on}
              aria-pressed={on}
              // The full wording is what a screen reader and a test both read,
              // whatever the width chose to show.
              aria-label={`${item.label}: ${full}`}
              onClick={() => onStatus(choice)}
              className={cn(
                'flex h-11 items-center justify-center rounded-[--radius-control] border px-1 text-center text-[0.8125rem] font-bold leading-tight transition-colors',
                on
                  ? cn('border-transparent text-white', SEVERITY_FILL[severityOf(choice)])
                  : 'border-hairline-strong bg-surface text-ink-muted active:bg-surface-sunken',
              )}
            >
              {compact === full ? (
                full
              ) : (
                <>
                  <span className="sm:hidden">{compact}</span>
                  <span className="hidden sm:inline">{full}</span>
                </>
              )}
            </button>
          )
        })}
      </div>

      {actionable && remedies.length > 0 ? (
        <div className="mt-2.5 space-y-2 rounded-[--radius-control] bg-surface-sunken p-2.5">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-ink-subtle">
            Add to estimate
          </p>

          {hasFullSet && !fullSetQuoted ? (
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
            {remedies.map((remedy) => {
              // Already on the estimate — established from the estimate
              // itself, not from whether this particular button was the one
              // that was tapped. The same service offered under three
              // findings agrees with itself.
              const added = isRemedyQuoted(remedy, quoted)
              return (
                <button
                  key={remedy.id}
                  type="button"
                  // A word, not only a colour: a technician in bright sun
                  // reading a phone at arm's length should not have to
                  // distinguish two shades to know what happened.
                  aria-pressed={added}
                  aria-label={
                    added
                      ? `Remove ${remedy.name} from the estimate`
                      : `Add ${remedy.name} to the estimate`
                  }
                  onClick={() => onToggleRemedy(remedy)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-[--radius-chip] border px-2.5 py-1.5 text-xs font-semibold',
                    added
                      ? 'border-success-500 bg-success-50 text-success-700 active:bg-success-100'
                      : 'border-brand-200 bg-white text-brand-700 active:bg-brand-50',
                  )}
                >
                  {added ? (
                    <>
                      <CheckIcon className="h-3.5 w-3.5" />
                      Added · {remedy.name}
                    </>
                  ) : (
                    <>
                      <PlusIcon className="h-3.5 w-3.5" />
                      {remedy.name}
                    </>
                  )}
                  <span className={cn('num', added ? 'text-success-700' : 'text-ink-muted')}>
                    {formatCents(remedy.priceCents, { currency, showCents: false })}
                  </span>
                </button>
              )
            })}
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
        {draft.value && !showDetail ? (
          <span className="min-w-0 truncate text-xs text-ink-muted">· {draft.value}</span>
        ) : null}
        {hasUnsyncedNote && !showDetail ? (
          <Chip tone="warning" dot>
            Not saved
          </Chip>
        ) : null}
      </div>

      {showDetail ? (
        <div className="mt-2 space-y-2">
          <Textarea
            rows={2}
            value={draft.value}
            placeholder="What did you see?"
            onChange={(event) => draft.change(event.target.value)}
            onBlur={() => void draft.flush()}
          />

          <DraftStatus
            state={draft.state}
            error={draft.error}
            restored={draft.restored}
            onRetry={() => void draft.flush()}
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
