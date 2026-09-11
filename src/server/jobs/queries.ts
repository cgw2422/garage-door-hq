import type { AppSession } from '@/lib/session'

/** Start and end of "today" in the organization's timezone, as UTC instants. */
export function dayBounds(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [year, month, day] = formatter.format(date).split('-').map(Number)

  // Derive the zone's UTC offset for that calendar day, then anchor midnight.
  const probe = new Date(Date.UTC(year!, month! - 1, day!, 12, 0, 0))
  const offsetMinutes = zoneOffsetMinutes(probe, timezone)

  const start = new Date(Date.UTC(year!, month! - 1, day!, 0, 0, 0) - offsetMinutes * 60_000)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

export function zoneOffsetMinutes(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  )
  return (asUtc - at.getTime()) / 60_000
}

export function formatTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function formatDate(date: Date, timezone: string, opts?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...opts,
  }).format(date)
}

/** The calendar date in a timezone, as YYYY-MM-DD. */
export function zonedDateString(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Interpret a wall-clock date and time as an instant in the given timezone.
 *
 * Everything scheduled in this product is a wall-clock time someone said out
 * loud ("ten-thirty"), so it has to be anchored to the company's zone rather
 * than the server's or the browser's.
 */
export function zonedToUtc(dateString: string, timeString: string, timezone: string): Date | null {
  const naive = new Date(`${dateString}T${timeString}:00Z`)
  if (Number.isNaN(naive.getTime())) return null
  return new Date(naive.getTime() - zoneOffsetMinutes(naive, timezone) * 60_000)
}

/** Shift a YYYY-MM-DD string by whole days without touching timezones. */
export function shiftDateString(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Monday-based week start for a YYYY-MM-DD string. */
export function startOfWeekString(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  const weekday = (date.getUTCDay() + 6) % 7
  return shiftDateString(dateString, -weekday)
}

export function formatDateString(
  dateString: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...opts,
  }).format(new Date(Date.UTC(year!, month! - 1, day!)))
}

export function greeting(now: Date, timezone: string) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(
      now,
    ),
  )
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Everything the Today dashboard needs, in one place.
 *
 * Solo mode: when the organization has a single member, the dashboard is
 * implicitly "my day" and never asks which technician. With a team, an owner
 * sees the whole board while a technician still sees their own.
 */
export async function loadToday(session: AppSession, now = new Date()) {
  const { db, timezone } = session
  const { start, end } = dayBounds(now, timezone)

  const scopeToMe = session.isSoloOperator || session.role === 'TECHNICIAN'
  const assignedFilter = scopeToMe ? { assignedToId: session.userId } : {}

  const [jobs, completedToday, openInvoices] = await Promise.all([
    db.job.findMany({
      where: {
        ...assignedFilter,
        archivedAt: null,
        scheduledStart: { gte: start, lt: end },
        status: { not: 'CANCELLED' },
      },
      orderBy: { scheduledStart: 'asc' },
      include: {
        customer: true,
        property: true,
        jobType: true,
        door: { select: { id: true, number: true, nickname: true } },
      },
    }),
    db.job.findMany({
      where: {
        ...assignedFilter,
        archivedAt: null,
        status: 'COMPLETED',
        completedAt: { gte: start, lt: end },
      },
      select: { id: true, revenueCents: true },
    }),
    db.invoice.aggregate({
      where: { archivedAt: null, status: { in: ['SENT', 'PARTIAL', 'PAST_DUE'] } },
      _sum: { balanceCents: true },
      _count: true,
    }),
  ])

  const revenueCents = completedToday.reduce((sum, job) => sum + job.revenueCents, 0)
  const completedCount = completedToday.length
  const remaining = jobs.filter((job) => job.status !== 'COMPLETED')
  const nextJob = remaining[0] ?? null

  return {
    now,
    timezone,
    revenueCents,
    completedCount,
    remainingCount: remaining.length,
    averageTicketCents: completedCount > 0 ? Math.round(revenueCents / completedCount) : 0,
    jobs,
    nextJob,
    outstandingCents: openInvoices._sum.balanceCents ?? 0,
    outstandingCount: openInvoices._count,
  }
}

/** Deep link that opens whichever map app the device prefers. */
export function directionsHref(parts: {
  line1: string
  city: string
  state: string
  postalCode: string
}) {
  const query = encodeURIComponent(
    `${parts.line1}, ${parts.city}, ${parts.state} ${parts.postalCode}`,
  )
  return `https://maps.google.com/?q=${query}`
}
