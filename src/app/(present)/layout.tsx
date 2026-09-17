import type { ReactNode } from 'react'

/**
 * Customer Presentation Mode has no application chrome, and — unlike every
 * other authenticated area — no `requireSession()` either.
 *
 * That absence is deliberate. This screen is reached through its own
 * short-lived token, in its own cookie, and knows nothing about the
 * technician's session. While it is open that session is suspended everywhere
 * else, so there is no authenticated application behind this page to leak
 * through it.
 */
export default function PresentLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-surface-sunken">{children}</div>
}
