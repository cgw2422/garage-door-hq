'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'
import { failure, parseForm, type FormState } from '@/lib/form'
import { clientAddress, enforceRateLimit } from '@/lib/rate-limit'
import { signOut } from '@/lib/auth'
import { requireUser } from '@/lib/session'
import { changePassword } from '@/server/auth/change-password'

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(200),
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
 * Change your own password.
 *
 * Gated on the session first, then on knowing the current password — the
 * session alone is not enough, because the situation this exists for includes
 * a device somebody walked away from.
 */
export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser()

  const parsed = parseForm(schema, formData)
  if (!parsed.ok) return parsed.state

  const address = await clientAddress()
  try {
    // Scoped to the account rather than the address: two people behind one
    // office NAT should not be able to lock each other out of this.
    await enforceRateLimit('passwordChange', `user:${user.userId}`)
  } catch (error) {
    return failure(error, formData)
  }

  try {
    await changePassword({
      userId: user.userId,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.password,
      ipAddress: address,
    })
  } catch (error) {
    return failure(error, formData)
  }

  // Every session was just invalidated, this one included. Signing in again is
  // both the only option and the proof it took. `reset=1` is the existing
  // notice — "Your password has been changed. Sign in with the new one." — which
  // is already the right sentence for this, so it does not need a second one.
  redirect('/login?reset=1')
}

/**
 * Sign out, from anywhere.
 *
 * The only other one lives under `(app)/more`, which platform staff cannot
 * reach — `requireSession` sends them to `/admin` — so a platform
 * administrator had no way to end their own session short of clearing cookies.
 */
export async function signOutAction() {
  await signOut({ redirectTo: '/login' })
}
