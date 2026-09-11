import type { Metadata } from 'next'
import Link from 'next/link'
import type { SubscriptionStatus } from '@prisma/client'
import { requirePlatformStaff } from '@/lib/session'
import { formatCents } from '@/lib/money'
import { platformMetrics, searchCompanies } from '@/server/platform/service'
import { Card, Divider, EmptyState, ListRow, SectionHeading } from '@/components/ui/card'
import { StatTile } from '@/components/ui/stat'
import { Chip, type Tone } from '@/components/ui/status'
import { CompanySearch } from './search'

export const metadata: Metadata = { title: 'Platform Admin' }
export const dynamic = 'force-dynamic'

const STATUSES: SubscriptionStatus[] = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'COMPLIMENTARY',
  'CANCELLED',
  'EXPIRED',
]

export const STATUS_TONE: Record<SubscriptionStatus, Tone> = {
  TRIALING: 'brand',
  ACTIVE: 'success',
  PAST_DUE: 'danger',
  CANCELLED: 'neutral',
  COMPLIMENTARY: 'warning',
  EXPIRED: 'neutral',
}

export default async function PlatformAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  await requirePlatformStaff()
  const params = await searchParams

  const status = STATUSES.includes(params.status as SubscriptionStatus)
    ? (params.status as SubscriptionStatus)
    : null

  const [metrics, companies] = await Promise.all([
    platformMetrics(),
    searchCompanies(params.q, status),
  ])

  return (
    <div className="space-y-4">
      <div>
        <SectionHeading>Platform</SectionHeading>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile
            value={formatCents(metrics.monthlyRecurringCents, { showCents: false })}
            label="MRR"
            tone="success"
          />
          <StatTile value={metrics.activeSubscriptions} label="Active" tone="success" />
          <StatTile value={metrics.trialing} label="Trialing" tone="brand" />
          <StatTile value={metrics.pastDue} label="Past due" tone="danger" />
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile value={metrics.totalCompanies} label="Companies" />
          <StatTile value={metrics.totalUsers} label="Users" />
          <StatTile value={metrics.totalJobs} label="Jobs" />
          <StatTile value={metrics.totalDoors} label="Doors" />
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile value={metrics.totalCustomers} label="Customers" />
          <StatTile value={metrics.totalInvoices} label="Invoices" />
          <StatTile value={metrics.complimentary} label="Complimentary" tone="warning" />
          <StatTile
            value={formatCents(metrics.paymentVolumeCents, { showCents: false })}
            label="Payments recorded"
          />
        </div>
      </div>

      <CompanySearch query={params.q ?? ''} status={status} statuses={STATUSES} />

      <div>
        <SectionHeading>Companies ({companies.length})</SectionHeading>
        <Card padded={false}>
          {companies.length === 0 ? (
            <EmptyState title="No companies match" />
          ) : (
            companies.map((company, index) => (
              <div key={company.id}>
                {index > 0 ? <Divider className="ml-4" /> : null}
                <ListRow
                  href={`/admin/companies/${company.id}`}
                  title={company.name}
                  subtitle={[
                    `${company._count.memberships} user${company._count.memberships === 1 ? '' : 's'}`,
                    `${company._count.jobs} jobs`,
                    `${company._count.customers} customers`,
                    company.referral ? `via ${company.referral.affiliate.code}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={
                    company.subscription ? (
                      <Chip tone={STATUS_TONE[company.subscription.status]}>
                        {company.subscription.status.replace('_', ' ').toLowerCase()}
                      </Chip>
                    ) : (
                      <Chip tone="neutral">no subscription</Chip>
                    )
                  }
                />
              </div>
            ))
          )}
        </Card>
      </div>

      <p className="text-center text-xs leading-relaxed text-ink-subtle">
        Impersonation is deliberately not built.{' '}
        <Link href="/today" className="font-semibold text-brand-600">
          Back to the app
        </Link>
      </p>
    </div>
  )
}
