'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { failure } from '@/lib/form'
import { enforceRateLimit } from '@/lib/rate-limit'
import { advanceJobStatus } from '@/server/jobs/service'
import { assignJob, rescheduleJob } from '@/server/schedule/service'

type Result = { ok: true } | { ok: false; error: string }

const rescheduleSchema = z.object({
  jobId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(15).max(720).optional(),
})

export async function rescheduleJobAction(
  input: z.infer<typeof rescheduleSchema>,
): Promise<Result> {
  const session = await requirePermission('job:write')
  const parsed = rescheduleSchema.parse(input)

  try {
    await enforceRateLimit('sensitiveMutation', `user:${session.userId}`)
    await rescheduleJob(session, parsed)
  } catch (error) {
    return { ok: false, error: failure(error).error ?? 'Could not reschedule that job.' }
  }

  revalidatePath('/schedule')
  revalidatePath('/today')
  return { ok: true }
}

const assignSchema = z.object({
  jobId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
})

export async function assignJobAction(input: z.infer<typeof assignSchema>): Promise<Result> {
  // Assigning someone else's work is an office/owner action, not a technician's.
  const session = await requirePermission('schedule:assign')
  const parsed = assignSchema.parse(input)

  try {
    await assignJob(session, parsed.jobId, parsed.userId)
  } catch (error) {
    return { ok: false, error: failure(error).error ?? 'Could not assign that job.' }
  }

  revalidatePath('/schedule')
  return { ok: true }
}

const statusSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(['ON_MY_WAY', 'ARRIVED', 'IN_PROGRESS', 'WAITING', 'CANCELLED']),
})

export async function setJobStatusAction(input: z.infer<typeof statusSchema>): Promise<Result> {
  const session = await requirePermission('job:write')
  const parsed = statusSchema.parse(input)

  try {
    await advanceJobStatus(session, parsed.jobId, parsed.status)
  } catch (error) {
    return { ok: false, error: failure(error).error ?? 'Could not update that job.' }
  }

  revalidatePath('/schedule')
  return { ok: true }
}
