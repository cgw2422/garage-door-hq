'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { advanceJobStatus } from '@/server/jobs/service'

const schema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(['ON_MY_WAY', 'ARRIVED', 'IN_PROGRESS', 'WAITING', 'CANCELLED']),
})

export async function advanceStatusAction(
  input: z.infer<typeof schema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission('job:write')
  const parsed = schema.parse(input)

  try {
    await advanceJobStatus(session, parsed.jobId, parsed.status)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not update the job.' }
  }

  revalidatePath(`/jobs/${parsed.jobId}`)
  return { ok: true }
}
