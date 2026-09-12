import type { Metadata } from 'next'
import type { JobStatus } from '@prisma/client'
import { requireSession } from '@/lib/session'
import { formatDate, formatTime } from '@/server/jobs/queries'
import { formatJobNumber } from '@/lib/numbering'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { ButtonLink } from '@/components/ui/button'
import { Card, Divider, EmptyState, ListRow } from '@/components/ui/card'
import { JobStatusChip } from '@/components/ui/status'
import { BriefcaseIcon, PlusIcon } from '@/components/ui/icons'
import { JobFilterTabs, type JobFilter } from './filter-tabs'

export const metadata: Metadata = { title: 'Jobs' }
export const dynamic = 'force-dynamic'

const FILTERS: Record<JobFilter, JobStatus[] | undefined> = {
  active: ['SCHEDULED', 'ON_MY_WAY', 'ARRIVED', 'IN_PROGRESS', 'WAITING'],
  completed: ['COMPLETED'],
  all: undefined,
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams
  const filter: JobFilter =
    params.filter === 'completed' ? 'completed' : params.filter === 'all' ? 'all' : 'active'

  const statuses = FILTERS[filter]

  const jobs = await session.db.job.findMany({
    where: {
      archivedAt: null,
      ...(statuses ? { status: { in: statuses } } : {}),
    },
    orderBy: [{ scheduledStart: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    include: {
      customer: { select: { firstName: true, lastName: true, companyName: true } },
      property: { select: { line1: true, city: true } },
      jobType: { select: { name: true } },
    },
  })

  return (
    <>
      <PageHeader
        title="Jobs"
        action={
          <ButtonLink href="/jobs/new" size="sm" icon={<PlusIcon />}>
            New
          </ButtonLink>
        }
      />
      <PageBody>
        <JobFilterTabs value={filter} />

        <Card padded={false}>
          {jobs.length === 0 ? (
            <EmptyState
              icon={<BriefcaseIcon />}
              title="No jobs here"
              body={
                filter === 'active'
                  ? 'Scheduled and in-progress jobs will appear in this list.'
                  : 'Nothing matches this filter yet.'
              }
            />
          ) : (
            jobs.map((job, index) => (
              <div key={job.id}>
                {index > 0 ? <Divider className="ml-4" /> : null}
                <ListRow
                  href={`/jobs/${job.id}`}
                  title={
                    job.customer.companyName ??
                    `${job.customer.firstName} ${job.customer.lastName}`
                  }
                  subtitle={`${job.jobType?.name ?? 'Service'} · ${job.property.line1}, ${job.property.city}`}
                  trailing={
                    <div className="flex flex-col items-end gap-1.5">
                      <JobStatusChip status={job.status} />
                      <span className="num text-xs font-medium text-ink-subtle">
                        {job.scheduledStart
                          ? `${formatDate(job.scheduledStart, session.timezone, { year: undefined })} · ${formatTime(job.scheduledStart, session.timezone)}`
                          : formatJobNumber(job)}
                      </span>
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
