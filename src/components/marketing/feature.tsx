import type { ReactNode } from 'react'
import { Eyebrow, Headline, Lede, Section } from './section'
import { cn } from '@/lib/cn'

/**
 * A story: words on one side, the product on the other.
 *
 * Most of the homepage is these, alternating sides. The alternation is what
 * stops nine sections of the same shape reading as a list, and the shared
 * component is what stops the ninth one drifting half a rem away from the
 * first.
 *
 * Below `lg` it always stacks words-then-picture, because a screenshot above
 * a heading on a phone is a picture with no caption until you scroll.
 */
export function FeatureSection({
  eyebrow,
  headline,
  lede,
  children,
  media,
  surface = 'base',
  flip = false,
  id,
  wide = false,
}: {
  eyebrow?: string
  headline: ReactNode
  lede?: ReactNode
  /** Supporting content under the lede: lists, small print, a secondary note. */
  children?: ReactNode
  media: ReactNode
  surface?: 'base' | 'raised' | 'deep' | 'brand'
  /** Put the media on the left at `lg` and above. */
  flip?: boolean
  id?: string
  /** Give the media more of the row, for a browser frame rather than a phone. */
  wide?: boolean
}) {
  return (
    <Section surface={surface} id={id}>
      <div
        className={cn(
          'grid items-center gap-10 lg:gap-16',
          wide ? 'lg:grid-cols-[0.85fr_1.15fr]' : 'lg:grid-cols-2',
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
 * A short aside inside a feature section, for the sentence that qualifies the
 * claim above it — "this is matching, not engineering", "profit here is an
 * estimate, not your books". Set apart rather than buried, because those are
 * the sentences a careful buyer is looking for.
 */
export function Aside({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'border-l-2 border-brand-700 pl-4 text-sm leading-relaxed text-navy-300',
        className,
      )}
    >
      {children}
    </p>
  )
}
