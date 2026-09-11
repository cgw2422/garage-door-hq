import type { Metadata } from 'next'
import { requireSession } from '@/lib/session'
import { formatCents, formatCentsShort } from '@/lib/money'
import { dayBounds } from '@/server/jobs/queries'
import { roleCan } from '@/lib/rbac'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Card, CardHeader, Divider, EmptyState, ListRow } from '@/components/ui/card'
import { RevenueTile, StatRow, StatTile } from '@/components/ui/stat'
import { InvoiceStatusChip } from '@/components/ui/status'
import { RangeTabs, type MoneyRange } from './range-tabs'
import { formatInvoiceNumber } from '@/lib/numbering'

export const metadata: Metadata = { title: 'Money' }
export const dynamic = 'force-dynamic'

const RANGES: readonly MoneyRange[] = ['today', 'week', 'month', 'year']

function parseRange(value: string | undefined): MoneyRange {
  return RANGES.find((range) => range === value) ?? 'today'
}

function rangeStart(range: MoneyRange, now: Date, timezone: string): Date {
  const { start } = dayBounds(now, timezone)
  const date = new Date(start)
  // 'today' needs no adjustment: the range already starts at local midnight.
  if (range === 'week') date.setUTCDate(date.getUTCDate() - 6)
  if (range === 'month') date.setUTCDate(date.getUTCDate() - 29)
  if (range === 'year') date.setUTCFullYear(date.getUTCFullYear() - 1)
  return date
}

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const session = await requireSession()

  // Financial reporting is owner/admin only, enforced here rather than by
  // hiding the nav link.
  if (!roleCan(session.role, 'reports:financial')) {
    return (
      <>
        <PageHeader title="Money" />
        <PageBody>
          <Card>
            <EmptyState
              title="Not available for your role"
              body="Company financials are visible to owners and admins."
            />
          </Card>
        </PageBody>
      </>
    )
  }

  const params = await searchParams
  const range = parseRange(params.range)

  const now = new Date()
  const start = rangeStart(range, now, session.timezone)

  const [completed, estimates, unpaid] = await Promise.all([
    session.db.job.findMany({
      where: { archivedAt: null, status: 'COMPLETED', completedAt: { gte: start } },
      select: {
        revenueCents: true,
        partsCostCents: true,
        laborCostCents: true,
        processingFeeCents: true,
        otherCostCents: true,
      },
    }),
    session.db.estimate.groupBy({
      by: ['status'],
      where: { archivedAt: null, createdAt: { gte: start } },
      _count: true,
    }),
    session.db.invoice.findMany({
      where: { archivedAt: null, status: { in: ['SENT', 'PARTIAL', 'PAST_DUE'] } },
      orderBy: { dueAt: 'asc' },
      take: 10,
      include: { customer: { select: { firstName: true, lastName: true, companyName: true } } },
    }),
  ])

  const revenueCents = completed.reduce((sum, job) => sum + job.revenueCents, 0)
  const partsCostCents = completed.reduce((sum, job) => sum + job.partsCostCents, 0)
  const feeCents = completed.reduce((sum, job) => sum + job.processingFeeCents, 0)
  const otherCostCents = completed.reduce(
    (sum, job) => sum + job.laborCostCents + job.otherCostCents,
    0,
  )
  const grossProfitCents = revenueCents - partsCostCents - feeCents - otherCostCents

  const accepted = estimates.find((row) => row.status === 'ACCEPTED')?._count ?? 0
  const presented = estimates
    .filter((row) => row.status !== 'DRAFT')
    .reduce((sum, row) => sum + row._count, 0)

  const label = { today: 'Today', week: 'This Week', month: 'This Month', year: 'This Year' }[range]

  return (
    <>
      <PageHeader title="Money" subtitle={session.organizationName} />
      <PageBody>
        <RangeTabs value={range} />

        <RevenueTile
          label={`${label} · Revenue`}
          value={formatCentsShort(revenueCents, session.currency)}
          footnote={`${completed.length} completed ${completed.length === 1 ? 'job' : 'jobs'}`}
        />

        <Card>
          <CardHeader title="Estimated Gross Profit" />
          <dl className="space-y-2.5">
            <Line label="Revenue" value={formatCents(revenueCents, { currency: session.currency })} />
            <Line
              label="Parts cost"
              value={`−${formatCents(partsCostCents, { currency: session.currency })}`}
              tone="danger"
            />
            <Line
              label="Processing fees"
              value={`−${formatCents(feeCents, { currency: session.currency })}`}
              tone="danger"
            />
            {otherCostCents > 0 ? (
              <Line
                label="Labor & other"
                value={`−${formatCents(otherCostCents, { currency: session.currency })}`}
                tone="danger"
              />
            ) : null}
            <Divider />
            <Line
              label="Estimated gross profit"
              value={formatCents(grossProfitCents, { currency: session.currency })}
              tone="success"
              strong
            />
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
            Estimated, not accounting. Costs are only as complete as the parts and fees recorded
            against each job.
          </p>
        </Card>

        <StatRow>
          <StatTile value={completed.length} label="Jobs Completed" />
          <StatTile
            value={formatCentsShort(
              completed.length > 0 ? Math.round(revenueCents / completed.length) : 0,
              session.currency,
            )}
            label="Average Ticket"
          />
          <StatTile
            value={presented > 0 ? `${accepted}/${presented}` : '—'}
            label="Estimates Won"
            tone="brand"
          />
        </StatRow>

        <Card padded={false}>
          <div className="px-4 pt-4">
            <CardHeader title="Outstanding Invoices" />
          </div>
          {unpaid.length === 0 ? (
            <EmptyState title="Nothing outstanding" body="Every invoice you have sent is paid." />
          ) : (
            unpaid.map((invoice, index) => (
              <div key={invoice.id}>
                {index > 0 ? <Divider className="ml-4" /> : null}
                <ListRow
                  href={`/invoices/${invoice.id}`}
                  title={
                    invoice.customer.companyName ??
                    `${invoice.customer.firstName} ${invoice.customer.lastName}`
                  }
                  subtitle={formatInvoiceNumber(invoice.number)}
                  trailing={
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="num text-[0.9375rem] font-bold text-ink">
                        {formatCents(invoice.balanceCents, { currency: session.currency })}
                      </span>
                      <InvoiceStatusChip status={invoice.status} />
                    </div>
                  }
                />
              </div>
            ))
          )}
        </Card>
      </PageBody>
    </>
  )
}

function Line({
  label,
  value,
  tone = 'ink',
  strong = false,
}: {
  label: string
  value: string
  tone?: 'ink' | 'danger' | 'success'
  strong?: boolean
}) {
  const toneClass = { ink: 'text-ink', danger: 'text-danger-600', success: 'text-success-600' }[tone]
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={`text-[0.9375rem] ${strong ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
        {label}
      </dt>
      <dd className={`num text-[0.9375rem] ${strong ? 'font-bold' : 'font-semibold'} ${toneClass}`}>
        {value}
      </dd>
    </div>
  )
}
