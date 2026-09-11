'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { failure, parseForm, type FormState } from '@/lib/form'
import { selectEstimateOption, signEstimate } from '@/server/estimates/lifecycle'

const selectSchema = z.object({
  estimateId: z.string().uuid(),
  optionId: z.string().uuid(),
})

export async function selectOptionAction(input: z.infer<typeof selectSchema>) {
  const session = await requirePermission('estimate:write')
  const parsed = selectSchema.parse(input)
  await selectEstimateOption(session, parsed)
  revalidatePath(`/estimates/${parsed.estimateId}/sign`)
}

const signSchema = z.object({
  estimateId: z.string().uuid(),
  optionId: z.string().uuid(),
  signerName: z.string().min(2, 'Enter the name of the person signing').max(120),
  signatureDataUrl: z.string().min(32, 'Please sign before submitting'),
})

export async function signEstimateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('estimate:write')
  const parsed = parseForm(signSchema, formData)
  if (!parsed.ok) return parsed.state

  let jobId: string | null = null
  try {
    const requestHeaders = await headers()
    const result = await signEstimate(session, {
      ...parsed.data,
      ipAddress:
        requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: requestHeaders.get('user-agent'),
    })
    jobId = result.estimate.jobId
  } catch (error) {
    return failure(error, formData)
  }

  redirect(jobId ? `/jobs/${jobId}` : `/estimates/${parsed.data.estimateId}`)
}
