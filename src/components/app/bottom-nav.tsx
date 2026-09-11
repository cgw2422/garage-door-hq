'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import { BoxIcon, BriefcaseIcon, CalendarIcon, DotsIcon, UsersIcon } from '@/components/ui/icons'

/**
 * Five destinations, fixed. The spec is explicit that navigation stays simple;
 * anything else lives behind More. Hidden on tablet and up, where the sidebar
 * takes over.
 */
const TABS = [
  { href: '/today', label: 'Today', icon: CalendarIcon },
  { href: '/jobs', label: 'Jobs', icon: BriefcaseIcon },
  { href: '/customers', label: 'Customers', icon: UsersIcon },
  { href: '/inventory', label: 'Inventory', icon: BoxIcon },
  { href: '/more', label: 'More', icon: DotsIcon },
] as const

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
          const Icon = tab.icon
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[--spacing-tap] flex-col items-center justify-center gap-1 pb-1 pt-2',
                  active ? 'text-brand-600' : 'text-ink-subtle',
                )}
              >
                <Icon className="h-[1.375rem] w-[1.375rem]" strokeWidth={active ? 2.1 : 1.75} />
                <span className={cn('text-[0.6875rem]', active ? 'font-bold' : 'font-medium')}>
                  {tab.label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
