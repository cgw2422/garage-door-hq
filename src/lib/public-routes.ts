/**
 * The public site's pages, in one list.
 *
 * The sitemap is generated from this rather than hand-maintained, so adding a
 * page and forgetting to list it is not possible — and the browser walkthrough
 * in `scripts/public-site-check.mjs` reads the same list, so a page that is
 * added but broken fails a check rather than sitting unvisited.
 */
export interface PublicRoute {
  path: string
  /** What the page is, for the check script's output. */
  label: string
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  priority: number
}

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { path: '/', label: 'Home', changeFrequency: 'weekly', priority: 1 },
  { path: '/features', label: 'Features', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/how-it-works', label: 'How It Works', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/pricing', label: 'Pricing', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/faq', label: 'FAQ', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/about', label: 'About', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/security', label: 'Security', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/contact', label: 'Contact', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/privacy', label: 'Privacy Policy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', label: 'Terms of Service', changeFrequency: 'yearly', priority: 0.3 },
] as const
