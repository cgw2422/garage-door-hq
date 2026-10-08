import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The marketing site's surfaces and vertical rhythm.
 *
 * The first version of this site was navy from top to bottom, and the result
 * was that nine different stories looked like one very long story. Light
 * sections fix that — but only if the type, the rules and the device frames
 * inside a section follow the surface without being told.
 *
 * They do it through CSS custom properties, set by the `surface-*` classes in
 * `globals.css` and read by everything below as `var(--m-heading)` and
 * friends. React context cannot do this (these are server components) and a
 * `tone` prop threaded through a dozen components is the kind of plumbing that
 * goes wrong in one place and is never noticed. The cascade just works.
 */

type Surface =
  /** Navy. The default, and the hero. */
  | 'base'
  /** A lighter navy, for a dark section next to another dark section. */
  | 'raised'
  /** Near-black. For the one or two moments that should feel like a full stop. */
  | 'deep'
  /** White. */
  | 'light'
  /** Very light grey, for a light section next to another light section. */
  | 'sunken'
  /** Electric blue. Once per page at most. */
  | 'brand'

const SURFACES: Record<Surface, string> = {
  base: 'surface-dark bg-navy-950',
  raised: 'surface-dark bg-navy-900',
  deep: 'surface-dark bg-[#03070d]',
  light: 'surface-light bg-white',
  sunken: 'surface-light bg-surface-sunken',
  brand: 'surface-dark surface-brand bg-brand-600',
}

export function Section({
  children,
  surface = 'base',
  className,
  id,
  size = 'normal',
}: {
  children: ReactNode
  surface?: Surface
  className?: string
  id?: string
  /** `tight` for a section that belongs to the one before it; `loose` for a finale. */
  size?: 'tight' | 'normal' | 'loose'
}) {
  return (
    <section
      id={id}
      className={cn(
        SURFACES[surface],
        'text-[color:var(--m-heading)]',
        size === 'tight' && 'py-12 sm:py-16',
        size === 'normal' && 'py-16 sm:py-24',
        size === 'loose' && 'py-20 sm:py-28 lg:py-32',
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
        'text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-[color:var(--m-accent)] sm:text-xs',
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
  size = 'normal',
}: {
  children: ReactNode
  className?: string
  as?: 'h1' | 'h2' | 'h3'
  size?: 'small' | 'normal' | 'large'
}) {
  return (
    <Tag
      className={cn(
        'text-balance font-bold leading-[1.08] tracking-tight text-[color:var(--m-heading)]',
        size === 'small' && 'text-xl sm:text-2xl',
        size === 'normal' && 'text-3xl sm:text-4xl lg:text-[2.625rem]',
        size === 'large' && 'text-4xl sm:text-5xl lg:text-6xl',
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
        'max-w-2xl text-pretty text-base leading-relaxed text-[color:var(--m-body)] sm:text-lg',
        className,
      )}
    >
      {children}
    </p>
  )
}

/**
 * A list of concrete things, as short lines with a dot.
 *
 * Used where the point is coverage — the parts an inspection covers, the
 * fields a Door Passport holds — and a paragraph would turn fourteen nouns
 * into a wall.
 */
export function FactList({
  items,
  className,
  columns = 2,
}: {
  items: readonly string[]
  className?: string
  columns?: 1 | 2 | 3
}) {
  return (
    <ul
      className={cn(
        'grid gap-x-6 gap-y-2.5',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {items.map((item) => (
        <li
          key={item}
          className="flex items-start gap-2.5 text-sm text-[color:var(--m-heading)] sm:text-base"
        >
          <span
            aria-hidden
            className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--m-accent)]"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/** Ticked features, for the things included in the plan. */
export function CheckList({
  items,
  className,
  columns = 2,
}: {
  items: readonly string[]
  className?: string
  columns?: 1 | 2 | 3
}) {
  return (
    <ul
      className={cn(
        'grid gap-x-6 gap-y-2.5',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {items.map((item) => (
        <li
          key={item}
          className="flex items-start gap-2.5 text-sm text-[color:var(--m-heading)] sm:text-[0.9375rem]"
        >
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className="mt-[0.1em] h-5 w-5 shrink-0 text-[color:var(--m-accent)]"
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

/**
 * The sentence that qualifies the claim above it.
 *
 * "This is matching, not engineering." "Profit here is an estimate, not your
 * books." Set apart rather than buried, because a careful buyer is looking for
 * exactly these, and a site that hides them makes them go and ask.
 */
export function Aside({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'border-l-2 border-[color:var(--m-accent)] pl-4 text-sm leading-relaxed text-[color:var(--m-muted)]',
        className,
      )}
    >
      {children}
    </p>
  )
}

/** A bordered box for a secondary point inside a section. */
export function Panel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-[--radius-card] border border-[color:var(--m-panel-border)] bg-[color:var(--m-panel)] p-5 sm:p-6',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** A hairline that reads on either surface. */
export function Rule({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-[color:var(--m-rule)]', className)} />
}

/** A small pill — a step name, a tag, a capability. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-[color:var(--m-chip-border)] bg-[color:var(--m-chip-bg)] px-3.5 py-2 text-sm font-semibold text-[color:var(--m-heading)]',
        className,
      )}
    >
      {children}
    </span>
  )
}
