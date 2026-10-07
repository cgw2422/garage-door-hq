import type { MetadataRoute } from 'next'
import { appBaseUrlUnchecked } from '@/lib/app-url'
import { environment } from '@/lib/environment'

/**
 * robots.txt.
 *
 * Staging disallows everything. A staging deployment indexed alongside
 * production splits the search result, invites somebody to sign up on the
 * wrong one, and is the kind of mistake nobody notices for a month.
 *
 * On production, the signed-in application, the API, the customer portal and
 * Presentation Mode are all disallowed. None of them is useful to a search
 * engine and the last two are reached through single-use links.
 */
export default function robots(): MetadataRoute.Robots {
  const base = appBaseUrlUnchecked()

  if (!environment().isProduction) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin',
          '/account',
          '/today',
          '/jobs',
          '/customers',
          '/properties',
          '/doors',
          '/estimates',
          '/invoices',
          '/inventory',
          '/schedule',
          '/money',
          '/more',
          '/search',
          '/settings',
          '/tools',
          '/photos',
          '/onboarding',
          '/present',
          '/p/',
          '/reset',
          '/invite',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
