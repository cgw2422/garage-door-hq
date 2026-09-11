import type { JobStatus } from '@prisma/client'
import { recordAudit } from '@/lib/audit'
import type { AppSession } from '@/lib/session'
import { roleCan } from '@/lib/rbac'
import { dayBounds, shiftDateString, zonedToUtc } from '@/server/jobs/queries'

/**
 * Scheduling.
 *
 * Times are wall-clock times in the company's timezone, converted once at the
 * boundary. A technician who says "ten-thirty" means ten-thirty where the door
 * is, not where the server is.
 */

export class ScheduleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScheduleError'
  }
}

export interface ScheduledJob {
  id: string
  number: number
  status: JobStatus
  scheduledStart: Date | null
  scheduledEnd: Date | null
  customerName: string
  addressLine: string
  jobTypeName: string | null
  technicianId: string | null
  technicianName: string | null
  /** YYYY-MM-DD in the company's timezone; the grouping key for the grid. */
  dateKey: string
}

/**
 * Jobs in a date range.
 *
 * A technician sees their own board; owners, admins and office see everyone's.
 * The scope is decided here from the session role, never from a query
 * parameter — a technician cannot widen it by editing the URL.
 */
export async function loadSchedule(
  session: AppSession,
  input: { fromDate: string; toDate: string; technicianId?: string | null },
): Promise<ScheduledJob[]> {
  const { start } = dayBoundsFor(input.fromDate, session.timezone)
  const { end } = dayBoundsFor(input.toDate, session.timezone)

  const seesEveryone = roleCan(session.role, 'schedule:assign')
  const technicianFilter = seesEveryone
    ? input.technicianId
      ? { assignedToId: input.technicianId }
      : {}
    : { assignedToId: session.userId }

  const jobs = await session.db.job.findMany({
    where: {
      archivedAt: null,
      scheduledStart: { gte: start, lt: end },
      ...technicianFilter,
    },
    orderBy: { scheduledStart: 'asc' },
    include: {
      customer: { select: { firstName: true, lastName: true, companyName: true } },
      property: { select: { line1: true, city: true } },
      jobType: { select: { name: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: session.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  return jobs.map((job) => ({
    id: job.id,
    number: job.number,
    status: job.status,
    scheduledStart: job.scheduledStart,
    scheduledEnd: job.scheduledEnd,
    customerName:
      job.customer.companyName ?? `${job.customer.firstName} ${job.customer.lastName}`,
    addressLine: `${job.property.line1}, ${job.property.city}`,
    jobTypeName: job.jobType?.name ?? null,
    technicianId: job.assignedTo?.id ?? null,
    technicianName: job.assignedTo
      ? `${job.assignedTo.firstName} ${job.assignedTo.lastName}`
      : null,
    dateKey: job.scheduledStart ? dateFormatter.format(job.scheduledStart) : '',
  }))
}

function dayBoundsFor(dateString: string, timezone: string) {
  const [year, month, day] = dateString.split('-').map(Number)
  return dayBounds(new Date(Date.UTC(year!, month! - 1, day!, 12)), timezone)
}

/** Everything scheduled from a date onwards, for the mobile Upcoming list. */
export async function loadUpcoming(session: AppSession, fromDate: string, days = 14) {
  return loadSchedule(session, {
    fromDate,
    toDate: shiftDateString(fromDate, days),
  })
}

export async function rescheduleJob(
  session: AppSession,
  input: { jobId: string; date: string; time: string; durationMinutes?: number },
) {
  const job = await session.db.job.findUnique({
    where: { id: input.jobId },
    select: { id: true, status: true, scheduledStart: true, scheduledEnd: true },
  })
  if (!job) throw new ScheduleError('Job not found.')
  if (job.status === 'COMPLETED') {
    throw new ScheduleError('A completed job cannot be rescheduled.')
  }

  const start = zonedToUtc(input.date, input.time, session.timezone)
  if (!start) throw new ScheduleError('That date and time could not be read.')

  const duration =
    input.durationMinutes ??
    (job.scheduledStart && job.scheduledEnd
      ? Math.round((job.scheduledEnd.getTime() - job.scheduledStart.getTime()) / 60_000)
      : 60)

  const updated = await session.db.job.update({
    where: { id: input.jobId },
    data: {
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + duration * 60_000),
      // A draft that gets a time on the calendar becomes a real booking.
      ...(job.status === 'DRAFT' ? { status: 'SCHEDULED' as const } : {}),
    },
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'job.rescheduled',
    entityType: 'Job',
    entityId: input.jobId,
    before: { scheduledStart: job.scheduledStart?.toISOString() ?? null },
    after: { scheduledStart: updated.scheduledStart?.toISOString() ?? null },
  })

  return updated
}

export async function assignJob(session: AppSession, jobId: string, userId: string | null) {
  if (userId) {
    // Only an active member of this company can be given work.
    const membership = await session.db.membership.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    })
    if (!membership) throw new ScheduleError('That person is not on your team.')
  }

  const updated = await session.db.job.update({
    where: { id: jobId },
    data: { assignedToId: userId },
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'job.assigned',
    entityType: 'Job',
    entityId: jobId,
    after: { assignedToId: userId },
  })

  return updated
}
