'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { JobStatus } from '@prisma/client'
import { cn } from '@/lib/cn'
import { formatJobNumber } from '@/lib/numbering'
import { Alert } from '@/components/ui/alert'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, EmptyState } from '@/components/ui/card'
import { Field, Input, SegmentedControl, Select } from '@/components/ui/field'
import { PageBody } from '@/components/app/page-header'
import { JOB_STATUS_META, JobStatusChip } from '@/components/ui/status'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '@/components/ui/icons'
import { assignJobAction, rescheduleJobAction } from './actions'

type View = 'day' | 'week' | 'upcoming'

interface ScheduleJob {
  id: string
  number: number
  status: JobStatus
  scheduledStart: string | null
  scheduledEnd: string | null
  customerName: string
  addressLine: string
  jobTypeName: string | null
  technicianId: string | null
  technicianName: string | null
  dateKey: string
}

function shift(dateString: string, days: number) {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function labelFor(dateString: string, opts?: Intl.DateTimeFormatOptions) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...opts,
  }).format(new Date(Date.UTC(year!, month! - 1, day!)))
}

/**
 * One schedule, three shapes.
 *
 * Mobile gets Today and Upcoming — a technician wants the next address, not a
 * grid. The week grid appears at tablet width and up, where there is room for
 * seven columns and a mouse to drag with.
 */
export function ScheduleView({
  view,
  date,
  today,
  weekStart,
  timezone,
  canAssign,
  isSolo,
  selectedTechnicianId,
  technicians,
  jobs,
}: {
  view: View
  date: string
  today: string
  weekStart: string
  rangeStart: string
  rangeEnd: string
  timezone: string
  canAssign: boolean
  isSolo: boolean
  selectedTechnicianId: string | null
  technicians: Array<{ id: string; name: string }>
  jobs: ScheduleJob[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ScheduleJob | null>(null)
  const [dragJobId, setDragJobId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  })

  function go(next: { view?: View; date?: string; tech?: string | null }) {
    const params = new URLSearchParams()
    params.set('view', next.view ?? view)
    params.set('date', next.date ?? date)
    const tech = next.tech === undefined ? selectedTechnicianId : next.tech
    if (tech) params.set('tech', tech)
    router.push(`/schedule?${params.toString()}`)
  }

  function moveToDay(jobId: string, targetDate: string) {
    const job = jobs.find((entry) => entry.id === jobId)
    if (!job || !job.scheduledStart) return
    if (job.dateKey === targetDate) return

    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(job.scheduledStart))

    setError(null)
    startTransition(async () => {
      const result = await rescheduleJobAction({ jobId, date: targetDate, time })
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  const days =
    view === 'week'
      ? Array.from({ length: 7 }, (_, index) => shift(weekStart, index))
      : view === 'upcoming'
        ? [...new Set(jobs.map((job) => job.dateKey))].filter(Boolean).sort()
        : [date]

  const byDay = new Map<string, ScheduleJob[]>()
  for (const job of jobs) {
    const bucket = byDay.get(job.dateKey) ?? []
    bucket.push(job)
    byDay.set(job.dateKey, bucket)
  }

  return (
    <PageBody className="max-w-6xl">
      <SegmentedControl<View>
        name="Schedule view"
        value={view}
        onChange={(next) => go({ view: next })}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'week', label: 'Week' },
        ]}
      />

      {view !== 'upcoming' ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={view === 'week' ? 'Previous week' : 'Previous day'}
            onClick={() => go({ date: shift(date, view === 'week' ? -7 : -1) })}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[--radius-control] border border-hairline-strong bg-surface text-ink active:bg-surface-sunken"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[0.9375rem] font-bold text-ink">
              {view === 'week'
                ? `${labelFor(weekStart)} – ${labelFor(shift(weekStart, 6))}`
                : labelFor(date, { weekday: 'long', year: undefined })}
            </p>
            {date !== today ? (
              <button
                type="button"
                onClick={() => go({ date: today })}
                className="text-xs font-semibold text-brand-600"
              >
                Back to today
              </button>
            ) : (
              <p className="text-xs text-ink-subtle">Today</p>
            )}
          </div>

          <button
            type="button"
            aria-label={view === 'week' ? 'Next week' : 'Next day'}
            onClick={() => go({ date: shift(date, view === 'week' ? 7 : 1) })}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[--radius-control] border border-hairline-strong bg-surface text-ink active:bg-surface-sunken"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
      ) : null}

      {/* Solo companies never see a technician filter — there is only them. */}
      {canAssign && !isSolo && technicians.length > 1 ? (
        <Select
          aria-label="Technician"
          value={selectedTechnicianId ?? ''}
          onChange={(event) => go({ tech: event.target.value || null })}
        >
          <option value="">Everyone</option>
          {technicians.map((technician) => (
            <option key={technician.id} value={technician.id}>
              {technician.name}
            </option>
          ))}
        </Select>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}

      <ButtonLink href={`/jobs/new?date=${date}`} variant="secondary" fullWidth icon={<PlusIcon />}>
        New job on {labelFor(date, { weekday: undefined, year: undefined })}
      </ButtonLink>

      {view === 'week' ? (
        <div className="hidden gap-2 md:grid md:grid-cols-7">
          {days.map((day) => (
            <div
              key={day}
              onDragOver={(event) => {
                if (!dragJobId) return
                event.preventDefault()
                setDropTarget(day)
              }}
              onDragLeave={() => setDropTarget((current) => (current === day ? null : current))}
              onDrop={(event) => {
                event.preventDefault()
                if (dragJobId) moveToDay(dragJobId, day)
                setDragJobId(null)
                setDropTarget(null)
              }}
              className={cn(
                'min-h-48 rounded-[--radius-card] border bg-surface p-2 transition-colors',
                dropTarget === day
                  ? 'border-brand-500 bg-brand-50'
                  : day === today
                    ? 'border-brand-200'
                    : 'border-hairline',
              )}
            >
              <p
                className={cn(
                  'mb-2 text-center text-[0.6875rem] font-bold uppercase tracking-wide',
                  day === today ? 'text-brand-600' : 'text-ink-subtle',
                )}
              >
                {labelFor(day)}
              </p>
              <div className="space-y-1.5">
                {(byDay.get(day) ?? []).map((job) => (
                  <WeekCard
                    key={job.id}
                    job={job}
                    time={job.scheduledStart ? timeFormatter.format(new Date(job.scheduledStart)) : '—'}
                    onDragStart={() => setDragJobId(job.id)}
                    onDragEnd={() => {
                      setDragJobId(null)
                      setDropTarget(null)
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* The week grid needs room; below tablet the same week reads as a list. */}
      <div className={cn('space-y-4', view === 'week' && 'md:hidden')}>
        {days.length === 0 || jobs.length === 0 ? (
          <Card>
            <EmptyState
              icon={<CalendarIcon />}
              title="Nothing scheduled"
              body={
                view === 'upcoming'
                  ? 'The next two weeks are clear.'
                  : 'No jobs booked for this day.'
              }
            />
          </Card>
        ) : (
          days
            .filter((day) => (byDay.get(day) ?? []).length > 0 || view === 'day')
            .map((day) => (
              <div key={day}>
                {view !== 'day' ? (
                  <p className="mb-2 px-1 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
                    {labelFor(day, { weekday: 'long' })}
                    {day === today ? ' · Today' : ''}
                  </p>
                ) : null}
                <Card padded={false}>
                  {(byDay.get(day) ?? []).length === 0 ? (
                    <EmptyState title="Nothing scheduled" />
                  ) : (
                    (byDay.get(day) ?? []).map((job, index) => (
                      <ListCard
                        key={job.id}
                        job={job}
                        isFirst={index === 0}
                        time={
                          job.scheduledStart
                            ? timeFormatter.format(new Date(job.scheduledStart))
                            : '—'
                        }
                        canAssign={canAssign}
                        isSolo={isSolo}
                        onEdit={() => setEditing(job)}
                      />
                    ))
                  )}
                </Card>
              </div>
            ))
        )}
      </div>

      {editing ? (
        <RescheduleSheet
          job={editing}
          timezone={timezone}
          canAssign={canAssign}
          technicians={technicians}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null)
            router.refresh()
          }}
          onError={setError}
        />
      ) : null}
    </PageBody>
  )
}

function WeekCard({
  job,
  time,
  onDragStart,
  onDragEnd,
}: {
  job: ScheduleJob
  time: string
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const meta = JOB_STATUS_META[job.status]
  return (
    <Link
      href={`/jobs/${job.id}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'block cursor-grab rounded-[--radius-control] border-l-4 bg-surface-sunken p-2 active:cursor-grabbing',
        {
          neutral: 'border-navy-400',
          brand: 'border-brand-500',
          success: 'border-success-500',
          warning: 'border-warning-500',
          danger: 'border-danger-500',
        }[meta.tone],
      )}
    >
      <p className="num text-xs font-bold text-ink">{time}</p>
      <p className="truncate text-xs font-semibold text-ink">{job.customerName}</p>
      <p className="truncate text-[0.6875rem] text-ink-muted">
        {job.jobTypeName ?? 'Service'}
      </p>
      {job.technicianName ? (
        <p className="truncate text-[0.6875rem] text-ink-subtle">{job.technicianName}</p>
      ) : null}
    </Link>
  )
}

function ListCard({
  job,
  time,
  isFirst,
  canAssign,
  isSolo,
  onEdit,
}: {
  job: ScheduleJob
  time: string
  isFirst: boolean
  canAssign: boolean
  isSolo: boolean
  onEdit: () => void
}) {
  return (
    <div className={cn('px-4 py-3', !isFirst && 'border-t border-hairline')}>
      <div className="flex items-start gap-3">
        <span className="num w-16 shrink-0 text-sm font-bold text-ink">{time}</span>
        <Link href={`/jobs/${job.id}`} className="min-w-0 flex-1">
          <p className="truncate text-[0.9375rem] font-semibold text-ink">{job.customerName}</p>
          <p className="truncate text-sm text-ink-muted">{job.addressLine}</p>
          <p className="truncate text-sm text-ink-muted">
            {job.jobTypeName ?? 'Service'}
            {!isSolo && job.technicianName ? ` · ${job.technicianName}` : ''}
          </p>
        </Link>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <JobStatusChip status={job.status} />
          <span className="num text-xs text-ink-subtle">{formatJobNumber(job.number)}</span>
        </div>
      </div>

      {job.status !== 'COMPLETED' && job.status !== 'CANCELLED' ? (
        <div className="mt-2 flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
            {canAssign ? 'Reschedule or assign' : 'Reschedule'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** Bottom sheet: the one place time-of-day and technician actually change. */
function RescheduleSheet({
  job,
  timezone,
  canAssign,
  technicians,
  onClose,
  onDone,
  onError,
}: {
  job: ScheduleJob
  timezone: string
  canAssign: boolean
  technicians: Array<{ id: string; name: string }>
  onClose: () => void
  onDone: () => void
  onError: (message: string) => void
}) {
  const [pending, startTransition] = useTransition()

  const start = job.scheduledStart ? new Date(job.scheduledStart) : new Date()
  const dateValue = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(start)
  const timeValue = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(start)

  const [date, setDate] = useState(dateValue)
  const [time, setTime] = useState(timeValue)
  const [technicianId, setTechnicianId] = useState(job.technicianId ?? '')

  function save() {
    startTransition(async () => {
      const moved = await rescheduleJobAction({ jobId: job.id, date, time })
      if (!moved.ok) {
        onError(moved.error)
        return
      }

      if (canAssign && (job.technicianId ?? '') !== technicianId) {
        const assigned = await assignJobAction({
          jobId: job.id,
          userId: technicianId || null,
        })
        if (!assigned.ok) {
          onError(assigned.error)
          return
        }
      }

      onDone()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-[--radius-card] bg-surface p-5 shadow-[--shadow-sheet] sm:rounded-[--radius-card]">
        <h2 className="text-lg font-bold text-ink">{job.customerName}</h2>
        <p className="text-sm text-ink-muted">{job.addressLine}</p>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
            <Field label="Time">
              <Input
                type="time"
                step={900}
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </Field>
          </div>

          {canAssign && technicians.length > 1 ? (
            <Field label="Technician">
              <Select
                value={technicianId}
                onChange={(event) => setTechnicianId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>

        <div className="safe-bottom mt-5 flex gap-2.5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" fullWidth onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
