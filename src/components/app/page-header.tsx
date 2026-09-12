import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import { ChevronLeftIcon } from '@/components/ui/icons'

/**
 * Sticky screen header. Carries a back affordance on detail screens because a
 * technician navigating one-handed should never need the browser chrome.
 */
export function PageHeader({
  title,
  subtitle,
  backHref,
  action,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  backHref?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'safe-top sticky top-0 z-30 border-b border-hairline bg-surface/95 backdrop-blur',
        className,
      )}
    >
      <div className="mx-auto flex min-h-14 max-w-3xl items-center gap-2 px-3 py-2">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Back"
            className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full text-ink active:bg-surface-sunken"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.0625rem] font-bold leading-tight text-ink">{title}</h1>
          {subtitle ? (
            <p className="truncate text-[0.8125rem] leading-tight text-ink-muted">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  )
}

/** Standard screen body: one column on a phone, centred and capped above it. */
export function PageBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full max-w-3xl space-y-4 px-3 pb-28 pt-4 md:pb-8', className)}>
      {children}
    </div>
  )
}

/**
 * Sticky footer for the one action that finishes the screen - Start Job,
 * Send Estimate, Complete Job. Sits above the tab bar, never behind it.
 */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <>
      {/*
        Reserves the space the fixed bar covers.

        Without this, whatever happens to be last on a page ends up trapped
        under the bar with no way to scroll it clear — which is how a working
        button becomes untappable on a phone. Keeping the spacer here rather
        than asking every page for a bottom padding class means a screen
        cannot forget.
      */}
      <div aria-hidden="true" className="safe-bottom h-[9.5rem] md:h-24" />

      <div className="fixed inset-x-0 bottom-[4.25rem] z-30 border-t border-hairline bg-surface/95 px-3 py-3 backdrop-blur md:bottom-0">
        <div className="safe-bottom mx-auto flex max-w-3xl gap-2.5">{children}</div>
      </div>
    </>
  )
}
