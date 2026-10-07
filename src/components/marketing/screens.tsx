import Image from 'next/image'
import { cn } from '@/lib/cn'

/**
 * Real product screens, framed.
 *
 * Every image on the public site is a capture of the running application, made
 * by `scripts/marketing-screens.mjs` against seeded demo data. Nothing here
 * draws a fake dashboard, and nothing here is allowed to: these components take
 * a name from the manifest below and would fail the build on a typo rather
 * than silently render a broken image.
 *
 * The frames exist because an unframed screenshot on a coloured background
 * reads as a mistake. A phone bezel or a browser chrome says "this is a
 * picture of a thing" and lets the screenshot keep its own edges.
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
} as const

export type ScreenName = keyof typeof SCREENS

function source(name: ScreenName) {
  return `/marketing/${name}.webp`
}

/**
 * A phone, with a real screen in it.
 *
 * Sizes are given explicitly rather than left to the browser, because these
 * are the largest things on the page and `sizes` is what stops a phone
 * downloading a 780px-wide image to show it at 240.
 */
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
        'relative shrink-0 rounded-[2.25rem] border border-navy-700/80 bg-navy-900 p-[0.4rem] shadow-[0_30px_70px_-20px_rgba(0,0,0,0.75)]',
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
}: {
  name: ScreenName
  alt: string
  priority?: boolean
  className?: string
  sizes?: string
}) {
  const screen = SCREENS[name]
  return (
    <figure
      className={cn(
        'overflow-hidden rounded-[--radius-card] border border-navy-700/70 bg-navy-900 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)]',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-navy-800 px-4 py-3">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-navy-600" />
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-navy-600" />
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-navy-600" />
      </div>
      <Image
        src={source(name)}
        alt={alt}
        width={screen.width}
        height={screen.height}
        sizes={sizes}
        priority={priority}
        className="h-auto w-full"
      />
    </figure>
  )
}

/**
 * Two phones, one behind the other.
 *
 * The composition the homepage hero and several sections are built on: the
 * screen that carries the headline in front, and the screen that proves it is
 * part of a whole application behind. Stacks to a single phone below `sm`,
 * where two overlapping phones would make both unreadable.
 */
export function PhonePair({
  front,
  behind,
  priority = false,
  className,
}: {
  front: { name: ScreenName; alt: string }
  behind: { name: ScreenName; alt: string }
  priority?: boolean
  className?: string
}) {
  return (
    <div className={cn('relative flex justify-center', className)}>
      <PhoneShot
        {...behind}
        width={248}
        sizes="248px"
        className="hidden sm:block sm:translate-x-[38%] sm:translate-y-[9%] sm:rotate-[5deg] sm:opacity-95"
      />
      <PhoneShot
        {...front}
        priority={priority}
        width={290}
        sizes="(max-width: 640px) 74vw, 290px"
        className="relative z-10 sm:-translate-x-[18%] sm:-rotate-[3deg]"
      />
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
  children: React.ReactNode
  caption: string
  className?: string
}) {
  return (
    <figure className={cn('flex flex-col items-center gap-4', className)}>
      {children}
      <figcaption className="max-w-sm text-center text-sm leading-relaxed text-navy-300">
        {caption}
      </figcaption>
    </figure>
  )
}
