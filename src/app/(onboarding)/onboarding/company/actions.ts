'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireUser } from '@/lib/session'
import { failure, parseForm, type FormState } from '@/lib/form'
import { createCompany } from '@/server/organizations/onboarding'

const schema = z.object({
  name: z.string().min(2, 'Company name is required').max(160),
  phone: z.string().max(40).optional(),
  postalCode: z.string().max(16).optional(),
  timezone: z.string().max(64).optional(),
  referralCode: z.string().max(40).optional(),
  catalog: z.enum(['starter', 'blank']).optional(),
})

export async function saveCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const parsed = parseForm(schema, formData)
  if (!parsed.ok) return parsed.state

  try {
    const { catalog, ...company } = parsed.data
    await createCompany({
      ownerUserId: user.userId,
      ...company,
      includeStarterCatalog: catalog !== 'blank',
    })
  } catch (error) {
    return failure(error, formData)
  }

  redirect('/onboarding/size')
}
