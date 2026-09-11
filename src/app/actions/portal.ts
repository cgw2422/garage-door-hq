'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { failure } from '@/lib/form'
import { enforceRateLimit } from '@/lib/rate-limit'
import { issuePortalLink, revokePortalLink } from '@/server/portal/service'

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
