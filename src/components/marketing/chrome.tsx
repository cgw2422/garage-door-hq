import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { ButtonLink } from '@/components/ui/button'
import { currentOffer, currentPriceLabel, trialLabel } from '@/lib/pricing'
import { cn } from '@/lib/cn'

/**
 * The header and footer every public page wears.
 *
 * The navigation is four links. Security, Contact, Privacy and Terms are real
 * pages that matter to somebody deciding whether to trust this with their
 * business, but nobody arrives looking for them, so they live in the footer
 * where a person goes when they are looking.
 *
 * The mobile menu is a `<details>` element: it opens, closes, is keyboard
 * operable and survives a failed hydration, and it ships no JavaScript. On a
 * marketing page whose job is to load fast on a phone in a driveway, a menu is
 * not worth a client component.
 */

const NAV = [
  { href: '/features', label: 'Product' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/faq', label: 'FAQ' },
] as const

const FOOTER = [
  {
    heading: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/how-it-works', label: 'How It Works' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/faq', label: 'FAQ' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '/security', label: 'Security' },
      { href: '/contact', label: 'Contact' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
  {
    heading: 'Get started',
    links: [
      { href: '/signup', label: 'Start Free Trial' },
      { href: '/login', label: 'Sign In' },
    ],
  },
] as const

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-navy-800/80 bg-navy-950/90 backdrop-blur supports-[backdrop-filter]:bg-navy-950/75">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3.5 sm:px-8">
        <Link href="/" aria-label="Garage Door HQ home" className="shrink-0">
          <Logo tone="dark" />
        </Link>

        <nav aria-label="Main" className="ml-4 hidden lg:block">
          <ul className="flex items-center gap-7">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-sm font-semibold text-navy-200 transition-colors hover:text-white"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="hidden text-sm font-semibold text-navy-200 transition-colors hover:text-white sm:block"
          >
            Sign In
          </Link>
          <ButtonLink href="/signup" size="sm" className="hidden sm:inline-flex">
            Start Free Trial
          </ButtonLink>

          <details className="relative lg:hidden [&_svg]:open:rotate-90">
            <summary
              className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-[--radius-control] text-navy-100 marker:hidden hover:bg-navy-800"
              aria-label="Menu"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6 transition-transform">
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </summary>
            <div className="absolute right-0 top-[calc(100%+0.75rem)] w-60 rounded-[--radius-card] border border-navy-700 bg-navy-900 p-2 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]">
              <ul>
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-[--radius-control] px-3 py-2.5 text-sm font-semibold text-navy-100 hover:bg-navy-800"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
                <li className="my-2 border-t border-navy-800" />
                <li>
                  <Link
                    href="/login"
                    className="block rounded-[--radius-control] px-3 py-2.5 text-sm font-semibold text-navy-100 hover:bg-navy-800"
                  >
                    Sign In
                  </Link>
                </li>
                <li className="p-1">
                  <ButtonLink href="/signup" size="sm" fullWidth>
                    Start Free Trial
                  </ButtonLink>
                </li>
              </ul>
            </div>
          </details>
        </div>
      </div>
    </header>
  )
}

export function MarketingFooter() {
  const offer = currentOffer()
  return (
    <footer className="border-t border-navy-800 bg-navy-950 text-white">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo tone="dark" showTagline />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-navy-300">
              Software for garage door companies. Built for the guy in the truck, not adapted
              from generic field-service software.
            </p>
          </div>

          {FOOTER.map((column) => (
            <div key={column.heading}>
              <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-navy-400">
                {column.heading}
              </h2>
              <ul className="mt-3.5 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-navy-200 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-navy-800 pt-6 text-sm text-navy-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Garage Door HQ. All rights reserved.</p>
          <p>
            {offer.isFounding ? 'Founding Members · ' : ''}
            {currentPriceLabel()} · {trialLabel()} · Everything included
          </p>
        </div>
      </div>
    </footer>
  )
}

/**
 * The offer, written the way it is written everywhere on the site.
 *
 * The struck-through prices establish what the offer is off; the founding
 * price is the only number set large. All three come from `@/lib/pricing`, so
 * this component has no opinion about what any of them are — including whether
 * there is an offer at all, in which case the strikethroughs simply do not
 * render.
 */
export function PriceBlock({
  size = 'lg',
  className,
  align = 'start',
}: {
  size?: 'md' | 'lg'
  className?: string
  align?: 'start' | 'center'
}) {
  const offer = currentOffer()
  const centered = align === 'center'

  return (
    <div className={cn(centered && 'text-center', className)}>
      {offer.isFounding ? (
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-brand-300">
          Founding Member Offer
        </p>
      ) : null}

      {offer.strikethroughCents.length > 0 ? (
        <p
          className={cn(
            'mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-navy-400',
            centered && 'justify-center',
          )}
        >
          {offer.strikethroughCents.map((price) => (
            <s key={price.interval} className="num text-base font-semibold sm:text-lg">
              {formatStruck(price.cents, price.interval)}
            </s>
          ))}
        </p>
      ) : null}

      <p
        className={cn(
          'num mt-1 font-bold leading-none text-white',
          size === 'lg' ? 'text-5xl sm:text-6xl' : 'text-4xl sm:text-5xl',
        )}
      >
        {priceNumber(offer.priceCents)}
        <span className="text-xl font-semibold text-navy-200 sm:text-2xl">
          /{offer.interval}
        </span>
      </p>

      <p className="mt-3 text-sm font-semibold text-brand-300 sm:text-base">
        {trialLabel()} · Everything included · Unlimited users
      </p>
    </div>
  )
}

function priceNumber(cents: number): string {
  const dollars = cents / 100
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`
}

function formatStruck(cents: number, interval: 'month' | 'year'): string {
  return `${priceNumber(cents)}/${interval}`
}
