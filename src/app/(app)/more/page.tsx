import type { Metadata } from 'next'
import { requireSession } from '@/lib/session'
import { isPlatformStaff, roleCan } from '@/lib/rbac'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Card, Divider, ListRow, SectionHeading } from '@/components/ui/card'
import { SignOutButton } from './sign-out'

export const metadata: Metadata = { title: 'More' }
export const dynamic = 'force-dynamic'

export default async function MorePage() {
  const session = await requireSession()

  const tools = [
    { href: '/tools/spring-calculator', title: 'Spring Calculator', subtitle: 'Measure and match springs' },
    { href: '/schedule', title: 'Schedule', subtitle: 'Day and week view' },
    { href: '/estimates', title: 'Estimates', subtitle: 'Present, approve and sign' },
    { href: '/invoices', title: 'Invoices', subtitle: 'Sent, partial and paid' },
  ]

  const business = [
    ...(roleCan(session.role, 'reports:financial')
      ? [{ href: '/money', title: 'Money Dashboard', subtitle: 'Revenue, costs and profit' }]
      : []),
    ...(roleCan(session.role, 'pricebook:read')
      ? [{ href: '/settings/price-book', title: 'Price Book', subtitle: 'Parts, labor and packages' }]
      : []),
    ...(roleCan(session.role, 'team:manage')
      ? [{ href: '/settings/team', title: 'Team Members', subtitle: 'Invite and manage users' }]
      : []),
    ...(roleCan(session.role, 'settings:manage')
      ? [{ href: '/settings', title: 'Company Settings', subtitle: 'Branding, tax, hours' }]
      : []),
  ]

  return (
    <>
      <PageHeader title="More" subtitle={session.organizationName} />
      <PageBody>
        <Card padded={false}>
          <ListRow
            href="/settings/profile"
            leading={
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                {session.firstName.charAt(0)}
                {session.lastName.charAt(0)}
              </span>
            }
            title={session.fullName}
            subtitle={`${session.email} · ${session.role.toLowerCase()}`}
          />
        </Card>

        <div>
          <SectionHeading>Tools</SectionHeading>
          <Card padded={false}>
            {tools.map((item, index) => (
              <div key={item.href}>
                {index > 0 ? <Divider className="ml-4" /> : null}
                <ListRow href={item.href} title={item.title} subtitle={item.subtitle} />
              </div>
            ))}
          </Card>
        </div>

        {business.length > 0 ? (
          <div>
            <SectionHeading>Business</SectionHeading>
            <Card padded={false}>
              {business.map((item, index) => (
                <div key={item.href}>
                  {index > 0 ? <Divider className="ml-4" /> : null}
                  <ListRow href={item.href} title={item.title} subtitle={item.subtitle} />
                </div>
              ))}
            </Card>
          </div>
        ) : null}

        {isPlatformStaff(session.platformRole) ? (
          <div>
            <SectionHeading>Platform</SectionHeading>
            <Card padded={false}>
              <ListRow
                href="/admin"
                title="Platform Admin"
                subtitle="Accounts, subscriptions and MRR"
              />
            </Card>
          </div>
        ) : null}

        <SignOutButton />

        <p className="pt-2 text-center text-xs text-ink-subtle">
          Garage Door HQ · $39.99/month · Everything included
        </p>
      </PageBody>
    </>
  )
}
