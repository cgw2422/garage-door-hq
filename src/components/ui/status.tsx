import type { ReactNode } from 'react'
import type { InspectionItemStatus, InvoiceStatus, JobStatus } from '@prisma/client'
import { cn } from '@/lib/cn'

/**
 * Status colour is semantic and consistent across the whole product:
 *   green = paid / completed / good, amber = attention / worn / low stock,
 *   red = failed / broken / past due, blue = active / primary, slate = neutral.
 * Every chip in the app goes through this file so those meanings never drift.
 */
export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

const TONES: Record<Tone, string> = {
  neutral: 'bg-navy-100 text-navy-700',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
}

const DOTS: Record<Tone, string> = {
  neutral: 'bg-navy-400',
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
}

export function Chip({
  tone = 'neutral',
  children,
  dot = false,
  className,
}: {
  tone?: Tone
  children: ReactNode
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[--radius-chip] px-2.5 py-1 text-xs font-semibold',
        TONES[tone],
        className,
      )}
    >
      {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[tone])} /> : null}
      {children}
    </span>
  )
}

export const JOB_STATUS_META: Record<JobStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SCHEDULED: { label: 'Scheduled', tone: 'neutral' },
  ON_MY_WAY: { label: 'On My Way', tone: 'brand' },
  ARRIVED: { label: 'Arrived', tone: 'brand' },
  IN_PROGRESS: { label: 'In Progress', tone: 'brand' },
  WAITING: { label: 'Waiting', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
}

export function JobStatusChip({ status }: { status: JobStatus }) {
  const meta = JOB_STATUS_META[status]
  return (
    <Chip tone={meta.tone} dot>
      {meta.label}
    </Chip>
  )
}

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SENT: { label: 'Sent', tone: 'brand' },
  PARTIAL: { label: 'Partial', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  PAST_DUE: { label: 'Past Due', tone: 'danger' },
  VOID: { label: 'Void', tone: 'neutral' },
}

export function InvoiceStatusChip({ status }: { status: InvoiceStatus }) {
  const meta = INVOICE_STATUS_META[status]
  return <Chip tone={meta.tone}>{meta.label}</Chip>
}

export const INSPECTION_STATUS_META: Record<
  InspectionItemStatus,
  { label: string; tone: Tone }
> = {
  NOT_CHECKED: { label: 'Not checked', tone: 'neutral' },
  GOOD: { label: 'Good', tone: 'success' },
  WORN: { label: 'Worn', tone: 'warning' },
  NEEDS_ATTENTION: { label: 'Needs attention', tone: 'warning' },
  FAILED: { label: 'Failed', tone: 'danger' },
  NOT_APPLICABLE: { label: 'N/A', tone: 'neutral' },
}

export function InspectionStatusChip({ status }: { status: InspectionItemStatus }) {
  const meta = INSPECTION_STATUS_META[status]
  return (
    <Chip tone={meta.tone} dot={status !== 'NOT_CHECKED' && status !== 'NOT_APPLICABLE'}>
      {meta.label}
    </Chip>
  )
}

/** Stock level colour follows the same semantics as everything else. */
export function stockTone(quantity: number, minQuantity: number): Tone {
  if (quantity <= 0) return 'danger'
  if (minQuantity > 0 && quantity <= minQuantity) return 'warning'
  return 'success'
}
