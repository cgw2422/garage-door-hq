'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireUser } from '@/lib/session'
import { failure, parseForm, type FormState } from '@/lib/form'
import { createCompany } from '@/server/organizations/onboarding'
import { REFERRAL_COOKIE, normalizeReferralCode } from '@/lib/attribution'

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

  // First touch wins: the cookie set when they first landed on a partner link
  // beats anything in the form, so a code cannot be swapped at the last step.
  const cookieCode = normalizeReferralCode((await cookies()).get(REFERRAL_COOKIE)?.value)

  try {
    const { catalog, referralCode, ...company } = parsed.data
    await createCompany({
      ownerUserId: user.userId,
      ...company,
      referralCode: cookieCode ?? normalizeReferralCode(referralCode),
      includeStarterCatalog: catalog !== 'blank',
    })
  } catch (error) {
    return failure(error, formData)
  }

  redirect('/onboarding/size')
}
