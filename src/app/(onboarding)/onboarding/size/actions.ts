'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireSession } from '@/lib/session'
import { failure, parseForm, type FormState } from '@/lib/form'
import { applyCompanySize } from '@/server/organizations/onboarding'

const schema = z.object({
  companySize: z.enum(['SOLO', 'SMALL_2_5', 'LARGE_6_PLUS']),
})

export async function saveCompanySize(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession()
  const parsed = parseForm(schema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await applyCompanySize({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      companySize: parsed.data.companySize,
    })
  } catch (error) {
    return failure(error, formData)
  }

  redirect('/onboarding/ready')
}
