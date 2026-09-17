import type { ReactNode } from 'react'
import Link from 'next/link'
import { requirePlatformStaff } from '@/lib/session'
import { Logo } from '@/components/ui/logo'

/**
 * Garage Door HQ's own admin.
 *
 * Guarded here and again in every page and action — a route group layout is a
 * convenience, not an access control.
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const user = await requirePlatformStaff()

  return (
    <div className="min-h-dvh bg-surface-sunken">
      <header className="border-b border-navy-800 bg-navy-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-3">
            <Logo tone="dark" />
            <span className="rounded-[--radius-chip] bg-brand-500 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-white">
              Platform
            </span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/admin" className="text-sm font-semibold text-navy-200 hover:text-white">
              Companies
            </Link>
            <Link
              href="/admin/affiliates"
              className="text-sm font-semibold text-navy-200 hover:text-white"
            >
              Affiliates
            </Link>
            <Link
              href="/admin/system"
              className="text-sm font-semibold text-navy-200 hover:text-white"
            >
              System
            </Link>
            <span className="hidden truncate text-sm text-navy-400 sm:inline">{user.email}</span>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-3 py-5">{children}</main>
    </div>
  )
}
