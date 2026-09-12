'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import { Logo } from '@/components/ui/logo'
import {
  BoxIcon,
  BriefcaseIcon,
  CalendarIcon,
  ChartIcon,
  SearchIcon,
  SettingsIcon,
  SpringIcon,
  UsersIcon,
} from '@/components/ui/icons'

/**
 * Desktop navigation for owners and office staff. Same destinations as the
 * mobile tab bar plus the screens that only make sense at a desk - it is the
 * mobile product adapted upward, not a separate admin console.
 */
const LINKS = [
  { href: '/search', label: 'Search', icon: SearchIcon },
  { href: '/today', label: 'Today', icon: CalendarIcon },
  { href: '/jobs', label: 'Jobs', icon: BriefcaseIcon },
  { href: '/customers', label: 'Customers', icon: UsersIcon },
  { href: '/inventory', label: 'Inventory', icon: BoxIcon },
  { href: '/tools/spring-calculator', label: 'Spring Calculator', icon: SpringIcon },
  { href: '/money', label: 'Money', icon: ChartIcon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
] as const

export function SideNav({ organizationName }: { organizationName: string }) {
  const pathname = usePathname()

  return (
    <aside className="hidden w-64 shrink-0 border-r border-navy-800 bg-navy-900 md:flex md:flex-col">
      <div className="border-b border-navy-800 px-5 py-5">
        <Logo tone="dark" />
        <p className="mt-2.5 truncate text-xs font-medium text-navy-300">{organizationName}</p>
      </div>
      <nav aria-label="Primary" className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-0.5">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
            const Icon = link.icon
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-[--radius-control] px-3 py-2.5 text-sm font-semibold transition-colors',
                    active
                      ? 'bg-brand-500 text-white'
                      : 'text-navy-200 hover:bg-navy-800 hover:text-white',
                  )}
                >
                  <Icon className="h-[1.125rem] w-[1.125rem]" />
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
