'use server'

import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { userMessage } from '@/lib/errors'
import { clientAddress, enforceRateLimit } from '@/lib/rate-limit'
import { PRESENTATION_COOKIE } from '@/lib/presentation-cookie'
import { signEstimate } from '@/server/estimates/lifecycle'
import { getSession } from '@/lib/session'
import {
  currentPresentation,
  endPresentation,
  endPresentationForTechnician,
  markPresentationSigned,
} from '@/server/presentations/service'

/**
 * Everything a customer can do while holding the device, and the one thing the
 * technician can.
 *
 * None of these take the technician's session. They resolve the presentation
 * from its own cookie, which is the only credential this context has — the
 * session is suspended for the duration, including for these actions.
 */

const signSchema = z.object({
  optionId: z.string().uuid(),
  signerName: z.string().min(2, 'Enter your name').max(120),
  signatureDataUrl: z.string().min(32, 'Please sign before submitting'),
})

/**
 * The customer's approval.
 *
 * Exactly the same `signEstimate` the emailed link calls — same options, same
 * prices, same tax, same terms, same frozen version, same immutable signature.
 * The only difference recorded is which screen they approved on.
 *
 * The estimate id comes from the presentation, never from the form, so a
 * tampered payload can only ever sign the estimate that is on screen.
 */
export async function signInPresentationAction(
  input: z.infer<typeof signSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const presentation = await currentPresentation()
  if (!presentation) return { ok: false, error: 'This presentation has ended.' }

  try {
    const parsed = signSchema.parse(input)
    const requestHeaders = await headers()

    await signEstimate(presentation.context, {
      estimateId: presentation.estimateId,
      optionId: parsed.optionId,
      signerName: parsed.signerName,
      signatureDataUrl: parsed.signatureDataUrl,
      approvalMethod: 'IN_PERSON_DEVICE',
      ipAddress: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: requestHeaders.get('user-agent'),
    })

    await markPresentationSigned({
      presentationId: presentation.id,
      optionId: parsed.optionId,
    })

    return { ok: true }
  } catch (error) {
    return { ok: false, error: userMessage(error, 'presentation.sign') }
  }
}

/**
 * The technician takes their device back.
 *
 * Gated on their own password, because that is the only thing on this screen a
 * person holding someone else's phone cannot produce. Rate limited, so the
 * device cannot be left alone with someone patient.
 */
export async function endPresentationAction(
  password: string,
): Promise<{ ok: true; href: string } | { ok: false; error: string }> {
  const jar = await cookies()
  const token = jar.get(PRESENTATION_COOKIE)?.value
  if (!token) return { ok: false, error: 'This presentation has already ended.' }

  try {
    await enforceRateLimit('presentationExit', `presentation:${await clientAddress()}`)
  } catch (error) {
    return { ok: false, error: userMessage(error, 'presentation.exit') }
  }

  let href: string
  try {
    const result = await endPresentation({ token, password })
    href = result.jobId ? `/jobs/${result.jobId}` : `/estimates/${result.estimateId}`
  } catch (error) {
    return { ok: false, error: userMessage(error, 'presentation.exit') }
  }

  jar.delete(PRESENTATION_COOKIE)
  return { ok: true, href }
}

/**
 * Getting back in when the presentation cookie is gone but the lock is not.
 *
 * Reached from the "this presentation has ended" screen. Still takes the
 * technician's password — the cookie being absent is not evidence of anything,
 * and a device in the wrong hands with a cleared cookie must not become an
 * easier device to get into.
 */
export async function recoverPresentationAction(
  password: string,
): Promise<{ ok: true; href: string } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Sign in again on this device.' }

  try {
    await enforceRateLimit('presentationExit', `presentation:${await clientAddress()}`)
  } catch (error) {
    return { ok: false, error: userMessage(error, 'presentation.exit') }
  }

  let href = '/today'
  try {
    const result = await endPresentationForTechnician({
      technicianUserId: session.userId,
      password,
    })
    if (result) href = result.jobId ? `/jobs/${result.jobId}` : `/estimates/${result.estimateId}`
  } catch (error) {
    return { ok: false, error: userMessage(error, 'presentation.exit') }
  }

  const jar = await cookies()
  jar.delete(PRESENTATION_COOKIE)
  return { ok: true, href }
}
