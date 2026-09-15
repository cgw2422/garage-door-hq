import type { ReactNode } from 'react'
import { requireSession } from '@/lib/session'

/**
 * Customer Presentation Mode.
 *
 * Deliberately outside the app shell: no bottom navigation, no side
 * navigation, no company chrome. The technician is about to hand this device
 * to a homeowner, and every control that leads back into the business is one
 * the customer can wander into while holding it.
 *
 * `requireSession()` still runs. The technician is signed in the whole time —
 * it is their phone — so this is not a public page and never becomes one. The
 * customer's own link is a separate, unauthenticated route with its own
 * token; this one is for the two of them standing in the driveway.
 */
export default async function PresentLayout({ children }: { children: ReactNode }) {
  await requireSession()

  return <div className="min-h-dvh bg-surface-sunken">{children}</div>
}
