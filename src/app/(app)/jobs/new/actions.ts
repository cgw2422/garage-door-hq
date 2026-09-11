'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { failure, parseForm, type FormState } from '@/lib/form'
import { createJob } from '@/server/jobs/service'

const schema = z.object({
  customerId: z.string().uuid(),
  propertyId: z.string().uuid(),
  doorId: z.string().uuid().optional(),
  jobTypeId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  reportedIssue: z.string().max(2000).optional(),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional(),
  durationMinutes: z.coerce.number().int().min(15).max(720).optional(),
})

export async function createJobAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission('job:write')
  const parsed = parseForm(schema, formData)
  if (!parsed.ok) return parsed.state

  const data = parsed.data
  let scheduledStart: Date | null = null
  let scheduledEnd: Date | null = null

  if (data.scheduledDate) {
    // The browser sends wall-clock date and time; the offset the technician is
    // standing in is the organization's, so it is resolved on the server.
    const local = `${data.scheduledDate}T${data.scheduledTime ?? '09:00'}:00`
    scheduledStart = zonedToUtc(local, session.timezone)
    if (scheduledStart) {
      scheduledEnd = new Date(scheduledStart.getTime() + (data.durationMinutes ?? 60) * 60_000)
    }
  }

  let jobId: string
  try {
    const job = await createJob(session, {
      customerId: data.customerId,
      propertyId: data.propertyId,
      doorId: data.doorId,
      jobTypeId: data.jobTypeId,
      assignedToId: data.assignedToId,
      reportedIssue: data.reportedIssue,
      scheduledStart,
      scheduledEnd,
    })
    jobId = job.id
  } catch (error) {
    return failure(error, formData)
  }

  redirect(`/jobs/${jobId}`)
}

/** Interpret a wall-clock string as an instant in the given timezone. */
function zonedToUtc(local: string, timeZone: string): Date | null {
  const naive = new Date(`${local}Z`)
  if (Number.isNaN(naive.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(naive)

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0')
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  )
  return new Date(naive.getTime() - (asUtc - naive.getTime()))
}
