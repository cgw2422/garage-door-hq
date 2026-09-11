import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The dashboard's revenue block: one number that answers "how is today
 * going?" before anything else on the screen.
 */
export function RevenueTile({
  label,
  value,
  footnote,
}: {
  label: string
  value: string
  footnote?: string
}) {
  return (
    <div className="rounded-[--radius-card] bg-success-500 px-5 py-5 text-white shadow-[--shadow-card]">
      <p className="num text-[2.125rem] font-bold leading-none">{value}</p>
      <p className="mt-1.5 text-sm font-medium text-white/85">{label}</p>
      {footnote ? <p className="mt-0.5 text-xs text-white/70">{footnote}</p> : null}
    </div>
  )
}

/** Small supporting numbers shown in a row of three beneath the revenue tile. */
export function StatTile({
  value,
  label,
  tone = 'ink',
}: {
  value: ReactNode
  label: string
  tone?: 'ink' | 'success' | 'warning' | 'danger' | 'brand'
}) {
  const toneClass = {
    ink: 'text-ink',
    success: 'text-success-600',
    warning: 'text-warning-600',
    danger: 'text-danger-600',
    brand: 'text-brand-600',
  }[tone]

  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-[--radius-card] border border-hairline bg-surface px-2 py-3.5 text-center shadow-[--shadow-card]">
      <span className={cn('num text-xl font-bold leading-none', toneClass)}>{value}</span>
      <span className="mt-1.5 text-[0.6875rem] font-medium leading-tight text-ink-muted">
        {label}
      </span>
    </div>
  )
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="flex gap-2.5">{children}</div>
}

/** Label/value pair used on detail screens (Door Passport, job summary). */
export function DataPoint({
  label,
  value,
  className,
}: {
  label: string
  value: ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[0.9375rem] font-medium text-ink">{value}</dd>
    </div>
  )
}

export function DataGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-4 gap-y-3.5', cols === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {children}
    </dl>
  )
}
