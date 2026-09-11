import type { Metadata } from 'next'
import { requirePermission } from '@/lib/session'
import { roleCan } from '@/lib/rbac'
import {
  loadSchedule,
  loadUpcoming,
  type ScheduledJob,
} from '@/server/schedule/service'
import {
  shiftDateString,
  startOfWeekString,
  zonedDateString,
} from '@/server/jobs/queries'
import { PageHeader } from '@/components/app/page-header'
import { ScheduleView } from './schedule-view'

export const metadata: Metadata = { title: 'Schedule' }
export const dynamic = 'force-dynamic'

export type ScheduleMode = 'day' | 'week' | 'upcoming'

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; tech?: string }>
}) {
  const session = await requirePermission('schedule:read')
  const params = await searchParams

  const today = zonedDateString(new Date(), session.timezone)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : today
  const view: ScheduleMode =
    params.view === 'week' ? 'week' : params.view === 'upcoming' ? 'upcoming' : 'day'

  const canAssign = roleCan(session.role, 'schedule:assign')
  const technicianId = canAssign ? (params.tech ?? null) : session.userId

  let jobs: ScheduledJob[]
  let rangeStart = date
  let rangeEnd = date

  if (view === 'week') {
    rangeStart = startOfWeekString(date)
    rangeEnd = shiftDateString(rangeStart, 6)
    jobs = await loadSchedule(session, { fromDate: rangeStart, toDate: rangeEnd, technicianId })
  } else if (view === 'upcoming') {
    rangeEnd = shiftDateString(date, 14)
    jobs = await loadUpcoming(session, date)
  } else {
    jobs = await loadSchedule(session, { fromDate: date, toDate: date, technicianId })
  }

  const technicians = canAssign
    ? await session.db.membership.findMany({
        where: { isActive: true, role: { in: ['OWNER', 'ADMIN', 'TECHNICIAN'] } },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      })
    : []

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle={session.isSoloOperator ? undefined : `${jobs.length} jobs`}
      />
      <ScheduleView
        view={view}
        date={date}
        today={today}
        weekStart={startOfWeekString(date)}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        timezone={session.timezone}
        canAssign={canAssign}
        isSolo={session.isSoloOperator}
        selectedTechnicianId={canAssign ? (params.tech ?? null) : null}
        technicians={technicians.map((membership) => ({
          id: membership.user.id,
          name: `${membership.user.firstName} ${membership.user.lastName}`.trim(),
        }))}
        jobs={jobs.map((job) => ({
          ...job,
          scheduledStart: job.scheduledStart?.toISOString() ?? null,
          scheduledEnd: job.scheduledEnd?.toISOString() ?? null,
        }))}
      />
    </>
  )
}
