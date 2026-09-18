import type { ReactNode } from 'react'
import Link from 'next/link'
import { requireUser } from '@/lib/session'
import { Logo } from '@/components/ui/logo'

/**
 * Your account, whoever you are.
 *
 * Deliberately outside `(app)` and `(platform)`. `(app)` requires a company
 * membership and `(platform)` requires staff, and the one person who most
 * needed a password form today — the platform administrator — belongs to no
 * company and so can reach neither. Changing your own password is not a
 * company setting.
 *
 * Guarded here and again in the page and the action: a route group layout is a
 * convenience, not an access control.
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  await requireUser()

  return (
    <div className="min-h-dvh bg-surface-sunken">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-xl items-center px-4 py-3">
          <Link href="/">
            <Logo />
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl px-3 py-5">{children}</main>
    </div>
  )
}
