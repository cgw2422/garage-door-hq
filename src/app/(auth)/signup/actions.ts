'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { signIn } from '@/lib/auth'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'
import { failure, parseForm, type FormState } from '@/lib/form'
import { cookies } from 'next/headers'
import { clientAddress, enforceRateLimit } from '@/lib/rate-limit'
import { REFERRAL_COOKIE, normalizeReferralCode } from '@/lib/attribution'
import { registerOwner } from '@/server/organizations/onboarding'
import { AUTH_NOT_CONFIGURED, authSecretConfigured, warnIfAuthUnconfigured } from '@/lib/readiness'

const schema = z.object({
  firstName: z.string().min(1, 'First name is required').max(80),
  lastName: z.string().min(1, 'Last name is required').max(80),
  email: z.string().email('Enter a valid email address').max(160),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(200),
  referralCode: z.string().max(40).optional(),
})

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(schema, formData)
  if (!parsed.ok) return parsed.state

  // Unauthenticated and it creates rows, so it is limited by address. A real
  // person signs up once; a script would otherwise sign up all afternoon.
  // Checked before the account is created, not after: registering someone
  // and then failing to sign them in would leave them with an account they
  // cannot reach and no way to know why.
  if (!authSecretConfigured()) {
    warnIfAuthUnconfigured()
    return { error: AUTH_NOT_CONFIGURED, values: Object.fromEntries(formData) as Record<string, string> }
  }

  try {
    await enforceRateLimit('signup', `ip:${await clientAddress()}`)
  } catch (error) {
    return failure(error, formData)
  }

  // Attribution is recorded when the company is created, one step later. The
  // code is carried forward here so it survives even if the cookie is blocked.
  const cookieCode = normalizeReferralCode((await cookies()).get(REFERRAL_COOKIE)?.value)
  const referralCode = cookieCode ?? normalizeReferralCode(parsed.data.referralCode)

  try {
    await registerOwner(parsed.data)
  } catch (error) {
    return failure(error, formData)
  }

  // Sign in without redirecting so the referral code survives into onboarding.
  await signIn('credentials', {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  })

  const suffix = referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ''
  redirect(`/onboarding/company${suffix}`)
}
