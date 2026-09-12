'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'
import { failure, parseForm, type FormState } from '@/lib/form'
import { clientAddress, enforceRateLimit } from '@/lib/rate-limit'
import { completePasswordReset } from '@/server/auth/password-reset'

const schema = z
  .object({
    token: z.string().min(20).max(200),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
      .max(200),
    confirm: z.string().max(200),
  })
  .refine((value) => value.password === value.confirm, {
    message: 'Those two passwords do not match',
    path: ['confirm'],
  })

/**
 * Set the new password.
 *
 * The token is the only credential here, so guessing is rate limited by
 * address and the token is consumed atomically inside the service.
 */
export async function completeResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseForm(schema, formData)
  if (!parsed.ok) return parsed.state

  const address = await clientAddress()
  try {
    await enforceRateLimit('passwordResetConfirm', `ip:${address}`)
  } catch (error) {
    return failure(error, formData)
  }

  try {
    await completePasswordReset({
      token: parsed.data.token,
      password: parsed.data.password,
      ipAddress: address,
    })
  } catch (error) {
    return failure(error, formData)
  }

  // Deliberately not signed in. Every session was just invalidated, and making
  // the person sign in with the new password proves it took.
  redirect('/login?reset=1')
}
