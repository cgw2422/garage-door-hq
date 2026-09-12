'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { advanceJobStatus } from '@/server/jobs/service'
import { failure, type FormState } from '@/lib/form'
import { sendReviewRequestForJob } from '@/server/communications/review-requests'

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

/**
 * Ask this customer for a review now.
 *
 * Manual send from the job screen, for a technician who forgot the checkbox or
 * a company that turned reviews on afterwards. Still refuses to ask twice, to
 * ask before the job is done, or to ask while money is owed.
 */
export async function sendReviewRequestAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('job:write')
  const jobId = String(formData.get('jobId') ?? '')

  try {
    const result = await sendReviewRequestForJob(session, jobId)
    revalidatePath(`/jobs/${jobId}`)
    return result.sent
      ? { values: { review: 'sent' } }
      : { error: result.reason ?? 'That review request could not be sent.' }
  } catch (error) {
    return failure(error, formData, 'reviews.manual_send')
  }
}
