import type { Metadata } from 'next'
import Link from 'next/link'
import { getAccessState, requireSession } from '@/lib/session'
import { directionsHref, formatTime, greeting, loadToday } from '@/server/jobs/queries'
import { formatCentsShort } from '@/lib/money'
import { formatJobNumber } from '@/lib/numbering'
import { lowStockForLocation } from '@/server/inventory/ledger'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { BillingBanner } from '@/components/app/billing-banner'
import { ButtonLink, CircleAction } from '@/components/ui/button'
import { Card, CardHeader, Divider, EmptyState, ListRow, SectionHeading } from '@/components/ui/card'
import { RevenueTile, StatRow, StatTile } from '@/components/ui/stat'
import { Chip, JobStatusChip } from '@/components/ui/status'
import {
  AlertIcon,
  CalendarIcon,
  CardIcon,
  ClockIcon,
  DocumentIcon,
  MessageIcon,
  NavigationIcon,
  PhoneIcon,
  PlusIcon,
  UsersIcon,
} from '@/components/ui/icons'

export const metadata: Metadata = { title: 'Today' }
export const dynamic = 'force-dynamic'

export default async function TodayPage() {
  const session = await requireSession()
  const access = await getAccessState()
  const today = await loadToday(session)
  const lowStock = session.defaultLocationId
    ? await lowStockForLocation(session.organizationId, session.defaultLocationId)
    : []

  const next = today.nextJob

  return (
    <>
      <PageHeader
        title={`${greeting(today.now, today.timezone)}, ${session.firstName}!`}
        subtitle="Let's get to work."
        action={
          <Link
            href="/more"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700"
            aria-label="Your account"
          >
            {session.firstName.charAt(0)}
            {session.lastName.charAt(0)}
          </Link>
        }
      />

      <PageBody>
        <BillingBanner access={access} />

        <RevenueTile
          label="Today's Revenue"
          value={formatCentsShort(today.revenueCents, session.currency)}
          footnote={
            today.completedCount === 0
              ? 'No jobs completed yet today'
              : `From ${today.completedCount} completed ${today.completedCount === 1 ? 'job' : 'jobs'}`
          }
        />

        <StatRow>
          <StatTile value={today.remainingCount} label="Jobs Remaining" />
          <StatTile value={today.completedCount} label="Jobs Completed" tone="success" />
          <StatTile
            value={formatCentsShort(today.averageTicketCents, session.currency)}
            label="Average Ticket"
          />
        </StatRow>

        {next ? (
          <div>
            <SectionHeading>Next Job</SectionHeading>
            <Card padded={false}>
              <div className="flex items-start justify-between gap-3 px-4 pt-4">
                <div className="min-w-0">
                  <p className="num text-2xl font-bold leading-none text-ink">
                    {next.scheduledStart ? formatTime(next.scheduledStart, today.timezone) : 'Unscheduled'}
                  </p>
                  <p className="mt-2 text-base font-semibold text-ink">
                    {next.customer.firstName} {next.customer.lastName}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {next.property.line1}, {next.property.city}
                  </p>
                  {next.jobType ? (
                    <p className="mt-1 text-sm font-medium text-ink-muted">{next.jobType.name}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <JobStatusChip status={next.status} />
                  <span className="text-xs font-medium text-ink-subtle">
                    {formatJobNumber(next)}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex px-2">
                {next.customer.phone ? (
                  <>
                    <CircleAction
                      icon={<PhoneIcon />}
                      label="Call"
                      href={`tel:${next.customer.phone}`}
                    />
                    <CircleAction
                      icon={<MessageIcon />}
                      label="Text"
                      href={`sms:${next.customer.phone}`}
                    />
                  </>
                ) : null}
                <CircleAction
                  icon={<NavigationIcon />}
                  label="Directions"
                  href={directionsHref(next.property)}
                />
              </div>

              <div className="px-4 pb-4 pt-1">
                <ButtonLink href={`/jobs/${next.id}`} size="lg" fullWidth>
                  {next.status === 'SCHEDULED' ? 'Start Job' : 'Open Job'}
                </ButtonLink>
              </div>
            </Card>
          </div>
        ) : null}

        <div>
          <SectionHeading
            action={
              <Link href="/jobs" className="text-[0.8125rem] font-semibold text-brand-600">
                View All
              </Link>
            }
          >
            Today&apos;s Schedule
          </SectionHeading>
          <Card padded={false}>
            {today.jobs.length === 0 ? (
              <EmptyState
                icon={<CalendarIcon />}
                title="Nothing scheduled today"
                body="When a job is booked for today it shows up here, in order."
                action={
                  <ButtonLink href="/jobs/new" size="sm" icon={<PlusIcon />}>
                    New Job
                  </ButtonLink>
                }
              />
            ) : (
              today.jobs.map((job, index) => (
                <div key={job.id}>
                  {index > 0 ? <Divider className="ml-4" /> : null}
                  <ListRow
                    href={`/jobs/${job.id}`}
                    leading={
                      <span className="num w-14 text-sm font-bold text-ink-muted">
                        {job.scheduledStart ? formatTime(job.scheduledStart, today.timezone) : '—'}
                      </span>
                    }
                    title={`${job.customer.firstName} ${job.customer.lastName}`}
                    subtitle={job.jobType?.name ?? job.reportedIssue ?? job.property.line1}
                    trailing={<JobStatusChip status={job.status} />}
                  />
                </div>
              ))
            )}
          </Card>
        </div>

        {lowStock.length > 0 ? (
          <Card>
            <CardHeader
              title="Restock Soon"
              action={
                <Link href="/inventory" className="text-[0.8125rem] font-semibold text-brand-600">
                  My Truck
                </Link>
              }
            />
            <ul className="space-y-2.5">
              {lowStock.slice(0, 3).map((row) => (
                <li key={row.priceBookItemId} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[0.9375rem] font-medium text-ink">
                    {row.name}
                  </span>
                  <Chip tone={row.quantity <= 0 ? 'danger' : 'warning'}>
                    {row.quantity} left
                  </Chip>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {today.outstandingCount > 0 ? (
          <Card>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-50 text-warning-600">
                <AlertIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] font-semibold text-ink">
                  {formatCentsShort(today.outstandingCents, session.currency)} outstanding
                </p>
                <p className="text-sm text-ink-muted">
                  {today.outstandingCount} unpaid {today.outstandingCount === 1 ? 'invoice' : 'invoices'}
                </p>
              </div>
              <ButtonLink href="/money" variant="secondary" size="sm">
                Review
              </ButtonLink>
            </div>
          </Card>
        ) : null}

        <div>
          <SectionHeading>Quick Actions</SectionHeading>
          <div className="grid grid-cols-2 gap-2.5">
            <QuickAction href="/jobs/new" icon={<PlusIcon />} label="New Job" />
            <QuickAction href="/customers/new" icon={<UsersIcon />} label="New Customer" />
            <QuickAction href="/estimates" icon={<DocumentIcon />} label="Estimates" />
            <QuickAction href="/invoices" icon={<CardIcon />} label="Take Payment" />
          </div>
        </div>

        <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-ink-subtle">
          <ClockIcon className="h-3.5 w-3.5" />
          Times shown in {session.timezone.replace('_', ' ')}
        </p>
      </PageBody>
    </>
  )
}

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[--spacing-tap] items-center gap-2.5 rounded-[--radius-card] border border-hairline bg-surface px-3.5 py-3 shadow-[--shadow-card] active:bg-surface-sunken"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 [&>svg]:h-4 [&>svg]:w-4">
        {icon}
      </span>
      <span className="text-[0.875rem] font-semibold text-ink">{label}</span>
    </Link>
  )
}
