import type { ReactNode } from 'react'
import { requireSession } from '@/lib/session'
import { BottomNav } from '@/components/app/bottom-nav'
import { SideNav } from '@/components/app/side-nav'

/**
 * Every authenticated screen sits under this layout, and `requireSession()`
 * runs before any of them render. Authorization is not delegated to
 * middleware: the server component that loads the data is the thing that
 * checks who is asking.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession()

  return (
    <div className="flex min-h-dvh bg-surface-sunken">
      <SideNav organizationName={session.organizationName} />
      <div className="min-w-0 flex-1">{children}</div>
      <BottomNav />
    </div>
  )
}
