import type { MetadataRoute } from 'next'
import { appBaseUrlUnchecked } from '@/lib/app-url'
import { PUBLIC_ROUTES } from '@/lib/public-routes'

/**
 * The sitemap.
 *
 * Only the public marketing pages. Everything behind the login is not
 * discoverable and should not be listed; the customer portal and Presentation
 * Mode in particular are reached through one-time links and are explicitly
 * noindex on their own pages.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appBaseUrlUnchecked()
  const lastModified = new Date()

  return PUBLIC_ROUTES.map((route) => ({
    url: `${base}${route.path === '/' ? '' : route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
