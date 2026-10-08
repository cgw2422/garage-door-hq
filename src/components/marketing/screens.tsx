import Image from 'next/image'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Real product screens, framed.
 *
 * Every image on the public site is a capture of the running application, made
 * by `scripts/marketing-screens.mjs` against seeded demo data. Nothing here
 * draws a fake dashboard, and nothing here can: these take a name from the
 * manifest below, so a typo fails the build rather than rendering a gap.
 *
 * The frames read their colours from the surface they are on
 * (`--m-frame`, `--m-shadow`), so a phone on white gets a light bezel and a
 * soft shadow while the same component on navy gets a dark one. Without that,
 * every light section had a black phone floating on it.
 */

/**
 * The captures, with their real pixel dimensions.
 *
 * Printed by the capture script, pasted here. Next needs intrinsic dimensions
 * to reserve space before the image loads, which is most of the difference
 * between a page that settles and a page that jumps.
 */
export const SCREENS = {
  today: { width: 780, height: 1688 },
  'today-money': { width: 780, height: 1688 },
  schedule: { width: 780, height: 1688 },
  jobs: { width: 780, height: 1688 },
  job: { width: 780, height: 1688 },
  inspection: { width: 780, height: 1688 },
  'inspection-finding': { width: 780, height: 1688 },
  'inspection-to-estimate': { width: 780, height: 1688 },
  estimate: { width: 780, height: 1688 },
  'estimate-options': { width: 780, height: 1688 },
  'presentation-handover': { width: 780, height: 1688 },
  'presentation-customer': { width: 780, height: 1688 },
  'presentation-options': { width: 780, height: 1688 },
  'presentation-signature': { width: 780, height: 1688 },
  'spring-lookup-empty': { width: 780, height: 1688 },
  'spring-lookup': { width: 780, height: 1688 },
  'spring-lookup-matches': { width: 780, height: 1688 },
  'truck-inventory': { width: 780, height: 1688 },
  customers: { width: 780, height: 1688 },
  customer: { width: 780, height: 1688 },
  'door-passport': { width: 780, height: 1688 },
  'door-passport-history': { width: 780, height: 1688 },
  'door-passport-equipment': { width: 780, height: 1688 },
  invoices: { width: 780, height: 1688 },
  invoice: { width: 780, height: 1688 },
  money: { width: 780, height: 1688 },
  'desktop-today': { width: 2880, height: 1800 },
  'desktop-schedule': { width: 2880, height: 1800 },
  'desktop-jobs': { width: 2880, height: 1800 },
  'desktop-customers': { width: 2880, height: 1800 },
  'desktop-inventory': { width: 2880, height: 1800 },
  'desktop-money': { width: 2880, height: 1800 },
  'desktop-price-book': { width: 2880, height: 1800 },
  'desktop-invoices': { width: 2880, height: 1800 },
  'desktop-customer': { width: 2880, height: 1800 },
  'desktop-door-passport': { width: 2880, height: 1800 },
  'desktop-inspection': { width: 2880, height: 1800 },
  'desktop-estimate': { width: 2880, height: 1800 },
  'desktop-spring-lookup': { width: 2880, height: 1800 },
  'desktop-invoice': { width: 2880, height: 1800 },
} as const

export type ScreenName = keyof typeof SCREENS

function source(name: ScreenName) {
  return `/marketing/${name}.webp`
}

/** A phone, with a real screen in it. */
export function PhoneShot({
  name,
  alt,
  priority = false,
  className,
  width = 300,
  sizes = '(max-width: 640px) 70vw, 300px',
}: {
  name: ScreenName
  alt: string
  priority?: boolean
  className?: string
  /** Rendered width in CSS pixels. The frame scales with it. */
  width?: number
  sizes?: string
}) {
  const screen = SCREENS[name]
  return (
    <div
      className={cn(
        'relative shrink-0 rounded-[2.25rem] border border-[color:var(--m-frame)] bg-[color:var(--m-frame-body)] p-[0.4rem] shadow-[var(--m-shadow)]',
        className,
      )}
      style={{ width }}
    >
      <div className="overflow-hidden rounded-[1.9rem] bg-white">
        <Image
          src={source(name)}
          alt={alt}
          width={screen.width}
          height={screen.height}
          sizes={sizes}
          priority={priority}
          className="h-auto w-full"
        />
      </div>
    </div>
  )
}

/**
 * A desktop capture in a browser frame.
 *
 * The three dots are the whole chrome. A convincing address bar would invite
 * the reader to look for a URL, and the URL of a screenshot is never the point.
 */
export function BrowserShot({
  name,
  alt,
  priority = false,
  className,
  sizes = '(max-width: 1024px) 92vw, 960px',
  /** Show only the top of a tall capture, so detail stays readable. */
  crop,
}: {
  name: ScreenName
  alt: string
  priority?: boolean
  className?: string
  sizes?: string
  crop?: 'top'
}) {
  const screen = SCREENS[name]
  return (
    <figure
      className={cn(
        'overflow-hidden rounded-[--radius-card] border border-[color:var(--m-frame)] bg-[color:var(--m-frame-body)] shadow-[var(--m-shadow)]',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-[color:var(--m-frame)] px-4 py-3">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[color:var(--m-frame)]" />
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[color:var(--m-frame)]" />
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[color:var(--m-frame)]" />
      </div>
      <div className={cn(crop === 'top' && 'max-h-[30rem] overflow-hidden')}>
        <Image
          src={source(name)}
          alt={alt}
          width={screen.width}
          height={screen.height}
          sizes={sizes}
          priority={priority}
          className="h-auto w-full"
        />
      </div>
    </figure>
  )
}

/**
 * Two phones, one behind the other.
 *
 * The overlap is deliberately modest. An earlier version buried the rear
 * phone so completely that all you saw was half a cut-off word, which reads
 * as a rendering fault rather than as depth — the rear screen has to be
 * recognisable as a second screen or it should not be there.
 *
 * Stacks to a single phone below `sm`, where two overlapping phones would make
 * both unreadable. The second image is `hidden sm:block`, so it is correctly
 * never fetched on a phone.
 */
export function PhonePair({
  front,
  behind,
  priority = false,
  className,
  size = 'normal',
}: {
  front: { name: ScreenName; alt: string }
  behind: { name: ScreenName; alt: string }
  priority?: boolean
  className?: string
  size?: 'normal' | 'large'
}) {
  const frontWidth = size === 'large' ? 330 : 290
  const behindWidth = size === 'large' ? 282 : 248
  return (
    <div className={cn('relative flex justify-center', className)}>
      <PhoneShot
        {...behind}
        width={behindWidth}
        sizes={`${behindWidth}px`}
        className="hidden sm:block sm:translate-x-[20%] sm:translate-y-[7%] sm:rotate-[5deg] sm:opacity-95"
      />
      <PhoneShot
        {...front}
        priority={priority}
        width={frontWidth}
        sizes={`(max-width: 640px) 74vw, ${frontWidth}px`}
        className="relative z-10 sm:-translate-x-[8%] sm:-rotate-[3deg]"
      />
    </div>
  )
}

/**
 * One screen, given the whole width.
 *
 * The answer to "every section is a phone beside a paragraph": the sections
 * that carry the most weight get a desktop capture at full measure, where the
 * numbers on it are legible rather than suggestive.
 */
export function Showcase({
  name,
  alt,
  caption,
  priority = false,
  className,
  crop,
}: {
  name: ScreenName
  alt: string
  caption?: string
  priority?: boolean
  className?: string
  crop?: 'top'
}) {
  return (
    <figure className={cn('flex flex-col items-center gap-4', className)}>
      <BrowserShot
        name={name}
        alt={alt}
        priority={priority}
        crop={crop}
        sizes="(max-width: 1024px) 94vw, 1100px"
        className="w-full"
      />
      {caption ? (
        <figcaption className="max-w-xl text-center text-sm leading-relaxed text-[color:var(--m-muted)]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}

/**
 * Three or four phones in a row, as one picture.
 *
 * For a sequence — handover, choose, sign — where the point is that the screens
 * follow one another. Scrolls horizontally on a phone rather than shrinking to
 * four unreadable slivers, with the scroll hinted by the last one bleeding off
 * the edge.
 */
export function PhoneGallery({
  screens,
  className,
  width = 232,
}: {
  screens: readonly { name: ScreenName; alt: string; label?: string }[]
  className?: string
  width?: number
}) {
  return (
    <div
      className={cn(
        '-mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 sm:mx-0 sm:px-0 lg:justify-center',
        className,
      )}
    >
      {screens.map((screen, index) => (
        <figure key={screen.name} className="flex shrink-0 snap-center flex-col items-center gap-3">
          <PhoneShot
            name={screen.name}
            alt={screen.alt}
            width={width}
            sizes={`${width}px`}
            className={index % 2 === 1 ? 'lg:translate-y-6' : undefined}
          />
          {screen.label ? (
            <figcaption className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--m-faint)]">
              {screen.label}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  )
}

/**
 * A screenshot with a caption naming what the reader is looking at.
 *
 * The caption is the alt text's visible twin: both say what the screen shows,
 * so somebody reading with a screen reader and somebody skimming the page get
 * the same sentence.
 */
export function ScreenFigure({
  children,
  caption,
  className,
}: {
  children: ReactNode
  caption: string
  className?: string
}) {
  return (
    <figure className={cn('flex flex-col items-center gap-4', className)}>
      {children}
      <figcaption className="max-w-sm text-center text-sm leading-relaxed text-[color:var(--m-muted)]">
        {caption}
      </figcaption>
    </figure>
  )
}
