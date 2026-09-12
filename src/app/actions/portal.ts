'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { failure } from '@/lib/form'
import { enforceRateLimit } from '@/lib/rate-limit'
import { issuePortalLink, revokePortalLink } from '@/server/portal/service'
import { sendEstimateEmail, sendInvoiceEmail } from '@/server/communications/dispatch'

const issueSchema = z.object({
  target: z.enum(['ESTIMATE', 'INVOICE']),
  documentId: z.string().uuid(),
})

export async function issuePortalLinkAction(
  input: z.infer<typeof issueSchema>,
): Promise<{ ok: true; url: string; expiresAt: string } | { ok: false; error: string }> {
  const session = await requirePermission('portal:issue')
  const parsed = issueSchema.parse(input)

  try {
    await enforceRateLimit('sensitiveMutation', `user:${session.userId}`)
    const link = await issuePortalLink(session, {
      target: parsed.target,
      ...(parsed.target === 'ESTIMATE'
        ? { estimateId: parsed.documentId }
        : { invoiceId: parsed.documentId }),
    })

    revalidatePath(
      parsed.target === 'ESTIMATE'
        ? `/estimates/${parsed.documentId}`
        : `/invoices/${parsed.documentId}`,
    )
    return { ok: true, url: link.url, expiresAt: link.expiresAt.toISOString() }
  } catch (error) {
    return { ok: false, error: failure(error).error ?? 'Could not create that link.' }
  }
}

export async function revokePortalLinkAction(input: {
  linkId: string
  revalidate?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission('portal:issue')

  try {
    await revokePortalLink(session, input.linkId)
  } catch (error) {
    return { ok: false, error: failure(error).error ?? 'Could not revoke that link.' }
  }

  if (input.revalidate) revalidatePath(input.revalidate)
  return { ok: true }
}

const sendSchema = z.object({
  target: z.enum(['ESTIMATE', 'INVOICE']),
  documentId: z.string().uuid(),
  /** Overrides the customer's stored address for this send only. */
  toAddress: z.string().email().max(160).optional(),
})

export interface SendDocumentResult {
  ok: boolean
  /** The link, always returned, so a failed send still leaves something to copy. */
  url: string | null
  toAddress: string | null
  error: string | null
  retryable: boolean
}

/**
 * Issue a link and email it to the customer.
 *
 * One action rather than two, because sending a link the customer cannot open
 * is the one combination that must not happen. The link is created first; if
 * the email then fails, the link is still returned so it can be sent by hand
 * and nobody is told a message arrived that did not.
 */
export async function sendDocumentAction(
  input: z.infer<typeof sendSchema>,
): Promise<SendDocumentResult> {
  const session = await requirePermission('portal:issue')
  const parsed = sendSchema.parse(input)

  let url: string
  try {
    await enforceRateLimit('sensitiveMutation', `user:${session.userId}`)
    const link = await issuePortalLink(session, {
      target: parsed.target,
      ...(parsed.target === 'ESTIMATE'
        ? { estimateId: parsed.documentId }
        : { invoiceId: parsed.documentId }),
    })
    url = link.url
  } catch (error) {
    return {
      ok: false,
      url: null,
      toAddress: null,
      error: failure(error, undefined, 'portal.issue').error ?? 'Could not create that link.',
      retryable: true,
    }
  }

  const delivery =
    parsed.target === 'ESTIMATE'
      ? await sendEstimateEmail({
          organizationId: session.organizationId,
          estimateId: parsed.documentId,
          portalUrl: url,
          toAddress: parsed.toAddress ?? null,
        })
      : await sendInvoiceEmail({
          organizationId: session.organizationId,
          invoiceId: parsed.documentId,
          portalUrl: url,
          toAddress: parsed.toAddress ?? null,
        })

  revalidatePath(
    parsed.target === 'ESTIMATE'
      ? `/estimates/${parsed.documentId}`
      : `/invoices/${parsed.documentId}`,
  )

  return {
    ok: delivery.ok,
    url,
    toAddress: parsed.toAddress ?? null,
    error: delivery.error ?? null,
    retryable: delivery.retryable ?? true,
  }
}

/**
 * Try a failed send again.
 *
 * This issues a **new** link rather than re-sending the old one, and that is
 * forced rather than chosen: only the hash of a token is stored, so a link
 * that was issued earlier cannot be reconstructed. Re-issuing revokes the
 * previous link, which is the correct behaviour anyway when the previous one
 * demonstrably never reached anybody.
 */
export async function retryDocumentSendAction(
  input: z.infer<typeof sendSchema>,
): Promise<SendDocumentResult> {
  return sendDocumentAction(input)
}
