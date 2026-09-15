'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { userMessage } from '@/lib/errors'
import { signEstimate } from '@/server/estimates/lifecycle'

const signSchema = z.object({
  estimateId: z.string().uuid(),
  optionId: z.string().uuid(),
  signerName: z.string().min(2, 'Enter the name of the person signing').max(120),
  signatureDataUrl: z.string().min(32, 'Please sign before submitting'),
})

/**
 * The customer's approval, taken on the technician's device.
 *
 * Exactly the same `signEstimate` the private link calls — same options, same
 * prices, same tax, same terms, same frozen version, same immutable
 * signature. The only difference recorded is how they approved it, and that
 * is recorded rather than inferred.
 *
 * Answers rather than redirects, because a redirect here would land the
 * customer somewhere with navigation on it while they are still holding the
 * phone. The screen that follows is the one that says "hand it back".
 */
export async function signInPersonAction(
  input: z.infer<typeof signSchema>,
): Promise<{ ok: true; jobId: string | null } | { ok: false; error: string }> {
  const session = await requirePermission('estimate:write')

  try {
    const parsed = signSchema.parse(input)
    const requestHeaders = await headers()

    const result = await signEstimate(session, {
      ...parsed,
      approvalMethod: 'IN_PERSON_DEVICE',
      ipAddress: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: requestHeaders.get('user-agent'),
    })

    revalidatePath(`/estimates/${parsed.estimateId}`)
    if (result.estimate.jobId) revalidatePath(`/jobs/${result.estimate.jobId}`)

    return { ok: true, jobId: result.estimate.jobId }
  } catch (error) {
    return { ok: false, error: userMessage(error, 'estimate.sign.in-person') }
  }
}
