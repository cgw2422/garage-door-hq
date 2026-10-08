import type { ReactNode } from 'react'
import { Eyebrow, Headline, Lede, Section } from './section'
import { cn } from '@/lib/cn'

/**
 * The shapes a section can take.
 *
 * The first version of this site had one: words on the left, a phone on the
 * right, alternating sides. Nine of those in a row read as one section with a
 * very long scrollbar. These are the alternatives — a split, a full-width
 * showcase with the words above it, a grid of short capabilities, a band of
 * numbers — so that no two consecutive sections have the same silhouette.
 *
 * Surfaces come from `Section`; nothing here decides its own colours.
 */

/** Words on one side, product on the other. Still the workhorse, used less. */
export function SplitFeature({
  eyebrow,
  headline,
  lede,
  children,
  media,
  surface = 'base',
  flip = false,
  id,
  /** Give the media more of the row, for a browser frame rather than a phone. */
  wide = false,
  size,
}: {
  eyebrow?: string
  headline: ReactNode
  lede?: ReactNode
  children?: ReactNode
  media: ReactNode
  surface?: 'base' | 'raised' | 'deep' | 'light' | 'sunken' | 'brand'
  flip?: boolean
  id?: string
  wide?: boolean
  size?: 'tight' | 'normal' | 'loose'
}) {
  return (
    <Section surface={surface} id={id} size={size}>
      <div
        className={cn(
          'grid items-center gap-10 lg:gap-16',
          wide ? 'lg:grid-cols-[0.8fr_1.2fr]' : 'lg:grid-cols-2',
        )}
      >
        <div className={cn(flip && 'lg:order-2')}>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <Headline className={cn(eyebrow && 'mt-3')}>{headline}</Headline>
          {lede ? <Lede className="mt-5">{lede}</Lede> : null}
          {children ? <div className="mt-7">{children}</div> : null}
        </div>
        <div className={cn('flex justify-center', flip && 'lg:order-1')}>{media}</div>
      </div>
    </Section>
  )
}

/**
 * Words centred above one large product screen.
 *
 * For the two or three things that carry the page. A desktop capture at the
 * full measure is the only way a reader can actually read the numbers on it,
 * and reading the numbers is the whole argument.
 */
export function ShowcaseFeature({
  eyebrow,
  headline,
  lede,
  children,
  media,
  surface = 'light',
  id,
  size,
  /** Supporting content placed below the screen rather than above it. */
  below,
}: {
  eyebrow?: string
  headline: ReactNode
  lede?: ReactNode
  children?: ReactNode
  media: ReactNode
  surface?: 'base' | 'raised' | 'deep' | 'light' | 'sunken' | 'brand'
  id?: string
  size?: 'tight' | 'normal' | 'loose'
  below?: ReactNode
}) {
  return (
    <Section surface={surface} id={id} size={size}>
      <div className="mx-auto max-w-3xl text-center">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Headline className={cn(eyebrow && 'mt-3')}>{headline}</Headline>
        {lede ? <Lede className="mx-auto mt-5 text-center">{lede}</Lede> : null}
        {children ? <div className="mt-7">{children}</div> : null}
      </div>
      <div className="mt-12">{media}</div>
      {below ? <div className="mx-auto mt-12 max-w-4xl">{below}</div> : null}
    </Section>
  )
}

/**
 * A grid of short capabilities.
 *
 * For the long tail — the things that matter but do not each deserve a
 * screenshot and three hundred words. Three columns of a name and a sentence
 * covers twelve features in the height one split section used to take.
 */
export function CapabilityGrid({
  items,
  columns = 3,
  className,
}: {
  items: readonly { name: string; detail: string }[]
  columns?: 2 | 3
  className?: string
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-8 gap-y-7',
        columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.name}>
          <dt className="text-base font-bold text-[color:var(--m-heading)]">{item.name}</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-[color:var(--m-body)]">
            {item.detail}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * A row of figures pulled out of the product.
 *
 * Breaks up a run of prose sections with something that is not a paragraph and
 * not a screenshot. Every number here is countable in the application — the
 * inspection really does have twenty-three components — so this is a summary,
 * not a marketing statistic.
 */
export function StatBand({
  items,
  className,
}: {
  items: readonly { value: string; label: string }[]
  className?: string
}) {
  return (
    <dl
      className={cn(
        'grid gap-px overflow-hidden rounded-[--radius-card] border border-[color:var(--m-panel-border)] bg-[color:var(--m-panel-border)] sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="bg-[color:var(--m-panel)] px-6 py-7 text-center">
          <dt className="sr-only">{item.label}</dt>
          <dd>
            <span className="num block text-3xl font-bold leading-none text-[color:var(--m-heading)] sm:text-4xl">
              {item.value}
            </span>
            <span className="mt-2.5 block text-sm leading-snug text-[color:var(--m-body)]">
              {item.label}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * A numbered step inside a phase.
 *
 * The connector line is drawn by the parent `Phase`, not here, so the last
 * step in a group does not trail a line into empty space.
 */
export function Step({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: ReactNode
}) {
  return (
    <li className="relative pl-14">
      <span
        aria-hidden
        className="num absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border-2 border-[color:var(--m-accent)] bg-[color:var(--m-panel)] text-sm font-bold text-[color:var(--m-accent)]"
      >
        {number}
      </span>
      <h3 className="pt-1.5 text-lg font-bold text-[color:var(--m-heading)] sm:text-xl">{title}</h3>
      <div className="mt-2 text-[0.9375rem] leading-relaxed text-[color:var(--m-body)]">
        {children}
      </div>
    </li>
  )
}

/**
 * A group of steps under one heading, with a line running through them.
 *
 * Ten full-width sections in a row made ten steps feel like ten unrelated
 * things. Four phases with a visible spine make the same ten feel like one
 * job, and fit on a screen and a half instead of eight.
 */
export function Phase({
  index,
  name,
  summary,
  steps,
  media,
  last = false,
}: {
  index: number
  name: string
  summary: string
  steps: ReactNode
  media?: ReactNode
  /** Omit the connector below the last phase. */
  last?: boolean
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,22rem)] lg:gap-14">
      <div className="relative">
        {/* The spine. Sits behind the step markers and stops at the last one. */}
        {!last ? (
          <span
            aria-hidden
            className="absolute bottom-0 left-5 top-12 w-px bg-[color:var(--m-rule)]"
          />
        ) : null}

        <div className="relative">
          <Eyebrow>
            Phase {index} · {name}
          </Eyebrow>
          <p className="mt-2.5 max-w-xl text-pretty text-lg font-semibold leading-snug text-[color:var(--m-heading)] sm:text-xl">
            {summary}
          </p>
        </div>

        <ol className="relative mt-7 space-y-7">{steps}</ol>
      </div>

      {media ? <div className="flex justify-center lg:justify-end">{media}</div> : null}
    </div>
  )
}

/**
 * The qualifying sentence, in a box rather than a margin note.
 *
 * Used where the qualification is the most interesting thing in the section —
 * "it will not size a spring from a door weight" — and burying it in small
 * grey text would read as hiding it.
 */
export function Caveat({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[--radius-card] border border-[color:var(--m-panel-border)] bg-[color:var(--m-panel)] p-5 sm:p-6">
      <p className="text-sm font-bold uppercase tracking-[0.12em] text-[color:var(--m-accent)]">
        {title}
      </p>
      <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-[color:var(--m-body)]">
        {children}
      </p>
    </div>
  )
}
