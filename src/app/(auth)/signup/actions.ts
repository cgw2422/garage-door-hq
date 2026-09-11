'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { signIn } from '@/lib/auth'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'
import { failure, parseForm, type FormState } from '@/lib/form'
import { clientAddress, enforceRateLimit } from '@/lib/rate-limit'
import { registerOwner } from '@/server/organizations/onboarding'

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
  try {
    await enforceRateLimit('signup', `ip:${await clientAddress()}`)
  } catch (error) {
    return failure(error, formData)
  }

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

  const suffix = parsed.data.referralCode
    ? `?ref=${encodeURIComponent(parsed.data.referralCode)}`
    : ''
  redirect(`/onboarding/company${suffix}`)
}
