import type { ReactNode } from 'react'
import { MarketingFooter, MarketingHeader } from '@/components/marketing/chrome'

/**
 * The public site.
 *
 * Dark navy, which is the marketing half of the brand — the application behind
 * the login is light, because that is what reads in a driveway at noon. The
 * contrast is deliberate: the product screenshots on these pages are light
 * rectangles on a dark field, which is what makes them the thing you look at.
 *
 * No authentication anywhere in this group. `/` redirects a signed-in person
 * to their own landing page, but the rest of the site is readable by anyone,
 * including somebody already paying who wants to re-read the pricing page.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-navy-950 text-white">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[--radius-control] focus:bg-brand-500 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <MarketingHeader />
      <main id="content">{children}</main>
      <MarketingFooter />
    </div>
  )
}
