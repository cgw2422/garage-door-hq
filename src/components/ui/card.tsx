import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import { ChevronRightIcon } from './icons'

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section
      className={cn(
        'rounded-[--radius-card] border border-hairline bg-surface shadow-[--shadow-card]',
        padded && 'p-4',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function CardHeader({
  title,
  action,
  className,
}: {
  title: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
        {title}
      </h2>
      {action}
    </div>
  )
}

/** A tappable row inside a card list. The whole row is the target. */
export function ListRow({
  href,
  leading,
  title,
  subtitle,
  trailing,
  className,
}: {
  href?: string
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  className?: string
}) {
  const body = (
    <>
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.9375rem] font-semibold text-ink">{title}</div>
        {subtitle ? <div className="mt-0.5 truncate text-sm text-ink-muted">{subtitle}</div> : null}
      </div>
      {trailing ? (
        <div className="flex shrink-0 items-center gap-2 text-right">{trailing}</div>
      ) : null}
      {href ? <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-subtle" /> : null}
    </>
  )

  const classes = cn(
    'flex min-h-[--spacing-tap] w-full items-center gap-3 px-4 py-3 text-left',
    href && 'active:bg-surface-sunken',
    className,
  )

  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px bg-hairline', className)} />
}

export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-end justify-between gap-3 px-1">
      <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
        {children}
      </h2>
      {action}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="mb-1 text-ink-subtle [&>svg]:h-8 [&>svg]:w-8">{icon}</div> : null}
      <p className="font-semibold text-ink">{title}</p>
      {body ? <p className="max-w-xs text-sm text-ink-muted">{body}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
