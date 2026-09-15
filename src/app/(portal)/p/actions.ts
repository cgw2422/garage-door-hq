'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { failure, parseForm, type FormState } from '@/lib/form'
import { appBaseUrl } from '@/lib/app-url'
import { clientAddress, enforceRateLimit } from '@/lib/rate-limit'
import { resolvePortalToken } from '@/server/portal/service'
import { selectEstimateOption, signEstimate } from '@/server/estimates/lifecycle'
import { createInvoiceCheckout, payableInvoice } from '@/server/billing/customer-payments'

/**
 * Customer actions on a secure link.
 *
 * The token is re-resolved on every call — never trusted from a hidden field
 * beyond being the lookup key — and the document id comes from the link, not
 * from the form. A customer cannot post a different estimate's id.
 */

const selectSchema = z.object({
  token: z.string().min(20).max(200),
  optionId: z.string().uuid(),
})

export async function portalSelectOptionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseForm(selectSchema, formData)
  if (!parsed.ok) return parsed.state

  const address = await clientAddress()
  try {
    await enforceRateLimit('portalToken', `portal:${address}`)
  } catch (error) {
    return failure(error, formData)
  }

  const link = await resolvePortalToken(parsed.data.token, { countView: false })
  if (!link?.estimateId) return { error: 'This link is no longer valid.' }

  try {
    await selectEstimateOption(link.context, {
      estimateId: link.estimateId,
      optionId: parsed.data.optionId,
    })
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath(`/p/e/${parsed.data.token}`)
  return {}
}

const signSchema = z.object({
  token: z.string().min(20).max(200),
  optionId: z.string().uuid(),
  signerName: z.string().min(2, 'Enter your name').max(120),
  signatureDataUrl: z.string().min(32, 'Please sign before submitting'),
})

export async function portalSignAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseForm(signSchema, formData)
  if (!parsed.ok) return parsed.state

  const address = await clientAddress()
  try {
    await enforceRateLimit('portalToken', `portal:${address}`)
  } catch (error) {
    return failure(error, formData)
  }

  const link = await resolvePortalToken(parsed.data.token, { countView: false })
  if (!link?.estimateId) return { error: 'This link is no longer valid.' }

  try {
    const requestHeaders = await headers()
    await signEstimate(link.context, {
      approvalMethod: 'REMOTE_LINK',
      estimateId: link.estimateId,
      optionId: parsed.data.optionId,
      signerName: parsed.data.signerName,
      signatureDataUrl: parsed.data.signatureDataUrl,
      ipAddress: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: requestHeaders.get('user-agent'),
    })
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath(`/p/e/${parsed.data.token}`)
  return { values: { signed: 'yes' } }
}

const paySchema = z.object({
  token: z.string().min(20).max(200),
})

/**
 * Start a card payment for an invoice on a secure link.
 *
 * The invoice comes from the token, never from the form. The charge is created
 * on the garage door company's own Stripe account, so the money settles with
 * them — see docs/PAYMENT-MODEL.md.
 *
 * Nothing about the invoice changes here. It is marked paid by the webhook
 * that confirms the payment, and by nothing else.
 */
export async function portalStartPaymentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseForm(paySchema, formData)
  if (!parsed.ok) return parsed.state

  const address = await clientAddress()
  try {
    await enforceRateLimit('portalToken', `portal:${address}`)
  } catch (error) {
    return failure(error, formData)
  }

  const link = await resolvePortalToken(parsed.data.token, { countView: false })
  if (!link?.invoiceId) return { error: 'This link is no longer valid.' }

  const invoice = await payableInvoice(link.invoiceId)
  if (!invoice) {
    return {
      error: 'This invoice cannot be paid online right now. Please contact the company directly.',
    }
  }

  const origin = appOrigin()
  let url: string
  try {
    const checkout = await createInvoiceCheckout({
      invoice,
      successUrl: `${origin}/p/i/${parsed.data.token}?paid=1`,
      cancelUrl: `${origin}/p/i/${parsed.data.token}`,
    })
    url = checkout.url
  } catch (error) {
    return failure(error, formData, 'portal.payment')
  }

  redirect(url)
}

function appOrigin(): string {
  return appBaseUrl()
}
