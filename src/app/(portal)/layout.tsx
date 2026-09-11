import type { ReactNode } from 'react'

/**
 * The customer surface.
 *
 * Deliberately separate from the application shell: no navigation, nothing
 * that hints at other records, and no session. A customer sees one document.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface-sunken">
      <div className="mx-auto w-full max-w-2xl px-3 pb-28 pt-5">{children}</div>
    </div>
  )
}
