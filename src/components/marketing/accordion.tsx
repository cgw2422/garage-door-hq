import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * An expandable answer.
 *
 * Built on `<details>`/`<summary>` rather than a client component with
 * `useState`. That is not laziness: the native element is already keyboard
 * operable, already announced correctly as expanded or collapsed, already
 * findable by the browser's own in-page search (which expands a closed
 * section to show a match), and it works before — or without — hydration. A
 * hand-rolled version of all of that would be more code that does less.
 *
 * It also ships no JavaScript, on a page whose job is to load fast on a phone.
 *
 * The chevron rotates on open through `[&_svg]:open:rotate-180`, and the
 * reduced-motion rule in `globals.css` already neutralises the transition for
 * anyone who asked for that.
 */
export function Accordion({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'divide-y divide-[color:var(--m-rule)] overflow-hidden rounded-[--radius-card] border border-[color:var(--m-panel-border)] bg-[color:var(--m-panel)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function AccordionItem({
  question,
  children,
  defaultOpen = false,
}: {
  question: string
  children: ReactNode
  /** Open on load. Used for the first item in a group, so the pattern is obvious. */
  defaultOpen?: boolean
}) {
  return (
    <details className="group [&_svg]:open:rotate-180" open={defaultOpen}>
      <summary
        className={cn(
          'flex cursor-pointer list-none items-start justify-between gap-5 px-5 py-4 sm:px-6 sm:py-5',
          'text-left text-base font-bold text-[color:var(--m-heading)] marker:hidden sm:text-lg',
          'hover:bg-[color:var(--m-chip-bg)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <span className="text-pretty">{question}</span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="mt-1 h-5 w-5 shrink-0 text-[color:var(--m-accent)] transition-transform"
          fill="none"
        >
          <path
            d="m5 7.5 5 5 5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className="space-y-3 px-5 pb-5 text-[0.9375rem] leading-relaxed text-[color:var(--m-body)] sm:px-6 sm:pb-6">
        {children}
      </div>
    </details>
  )
}
