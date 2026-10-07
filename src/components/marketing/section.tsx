import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The marketing site's vertical rhythm.
 *
 * Every section on the public site is one of these, so the spacing between a
 * heading and its screenshot is the same on the sixth section as on the first,
 * and a new page inherits the rhythm without anyone re-deciding it.
 *
 * The surfaces are deliberately few. Three shades of navy and one near-black
 * carry the whole site; alternating between them is what separates one story
 * from the next, rather than borders or cards everywhere.
 */

type Surface = 'base' | 'raised' | 'deep' | 'brand'

const SURFACES: Record<Surface, string> = {
  base: 'bg-navy-950 text-white',
  raised: 'bg-navy-900 text-white',
  deep: 'bg-[#03070d] text-white',
  brand: 'bg-brand-900 text-white',
}

export function Section({
  children,
  surface = 'base',
  className,
  id,
  tight = false,
}: {
  children: ReactNode
  surface?: Surface
  className?: string
  id?: string
  /** Less air above and below, for a section that belongs to the one before it. */
  tight?: boolean
}) {
  return (
    <section
      id={id}
      className={cn(
        SURFACES[surface],
        tight ? 'py-12 sm:py-16' : 'py-16 sm:py-24 lg:py-28',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">{children}</div>
    </section>
  )
}

/** A small uppercase label above a heading. The site's only all-caps type. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-brand-400 sm:text-xs',
        className,
      )}
    >
      {children}
    </p>
  )
}

/**
 * A section's headline.
 *
 * `text-balance` matters more here than anywhere: these are short sentences
 * that look broken when the last word wraps alone, and they wrap at almost
 * every width because the type is large.
 */
export function Headline({
  children,
  className,
  as: Tag = 'h2',
}: {
  children: ReactNode
  className?: string
  as?: 'h1' | 'h2' | 'h3'
}) {
  return (
    <Tag
      className={cn(
        'text-balance font-bold leading-[1.08] tracking-tight',
        Tag === 'h1' ? 'text-4xl sm:text-5xl lg:text-6xl' : 'text-3xl sm:text-4xl lg:text-[2.75rem]',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

/** The paragraph under a headline. */
export function Lede({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'max-w-2xl text-pretty text-base leading-relaxed text-navy-200 sm:text-lg',
        className,
      )}
    >
      {children}
    </p>
  )
}

/**
 * A list of concrete things, set as a two-column grid of short lines.
 *
 * Used where the point is coverage — the parts an inspection covers, the
 * fields a Door Passport holds — and a paragraph would turn fourteen nouns
 * into a wall.
 */
export function FactList({ items, className }: { items: readonly string[]; className?: string }) {
  return (
    <ul className={cn('grid gap-x-6 gap-y-2.5 sm:grid-cols-2', className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm text-navy-100 sm:text-base">
          <span aria-hidden className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/** Ticked features, for the things included in the plan. */
export function CheckList({ items, className }: { items: readonly string[]; className?: string }) {
  return (
    <ul className={cn('grid gap-x-6 gap-y-2.5 sm:grid-cols-2', className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm text-navy-100 sm:text-[0.9375rem]">
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className="mt-[0.1em] h-5 w-5 shrink-0 text-brand-400"
            fill="none"
          >
            <path
              d="m5 10.5 3.2 3.2L15 7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
