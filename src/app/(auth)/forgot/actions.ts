'use server'

import { z } from 'zod'
import { failure, parseForm, type FormState } from '@/lib/form'
import { clientAddress, consumeRateLimit } from '@/lib/rate-limit'
import { requestPasswordReset } from '@/server/auth/password-reset'

const schema = z.object({
  email: z.string().email('Enter the email address you sign in with').max(160),
})

/**
 * Ask for a reset link.
 *
 * Always reports the same thing. Whether the address exists, whether a message
 * went out, and whether the rate limit was hit are all invisible to the
 * requester — anything else turns this form into a way to test which email
 * addresses have accounts.
 */
export async function requestResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseForm(schema, formData)
  if (!parsed.ok) return parsed.state

  const address = await clientAddress()

  // Two budgets: one per address so a script cannot walk a list, one per
  // mailbox so a known address cannot be flooded from many addresses. Neither
  // changes what the requester is told.
  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit('passwordResetRequest', `ip:${address}`),
    consumeRateLimit('passwordResetRequest', `email:${parsed.data.email.toLowerCase()}`),
  ])

  if (byIp.ok && byEmail.ok) {
    try {
      await requestPasswordReset({ email: parsed.data.email, ipAddress: address })
    } catch (error) {
      // A provider outage must not become a signal either. Log it and answer
      // exactly as if everything worked.
      console.error('[auth] password reset request failed', error)
      void failure(error)
    }
  }

  return { values: { submitted: 'yes' } }
}
