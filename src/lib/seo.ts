import type { Metadata } from 'next'
import { appBaseUrlUnchecked } from './app-url'

/**
 * Metadata for a public page.
 *
 * One helper rather than a hand-written `metadata` export per page, because
 * the parts that are easy to forget — the canonical URL, the Open Graph
 * fields, the fact that `title` must not be run through the app's `%s ·
 * Garage Door HQ` template twice — are the parts that only show up when
 * somebody shares a link.
 *
 * `appBaseUrlUnchecked` is deliberate: a missing `APP_URL` on a public page
 * should degrade to relative URLs, not throw and take the page down. The
 * checked form is for links that get mailed to customers.
 */
export function pageMetadata({
  path,
  title,
  description,
  noIndex = false,
}: {
  /** Absolute path, leading slash, no trailing slash except for the root. */
  path: string
  /** Used verbatim as the tab title — the app's template is bypassed. */
  title: string
  description: string
  noIndex?: boolean
}): Metadata {
  const base = appBaseUrlUnchecked()
  const url = `${base}${path === '/' ? '' : path}`

  return {
    // `absolute` stops the root layout's template appending a second
    // "· Garage Door HQ" to a title that already ends with one.
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: 'Garage Door HQ',
      title,
      description,
      url,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  }
}
