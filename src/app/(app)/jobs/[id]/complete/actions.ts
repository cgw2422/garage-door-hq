'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { failure, type FormState } from '@/lib/form'
import { completeJob } from '@/server/jobs/completion'

const schema = z.object({
  jobId: z.string().uuid(),
  partsJson: z.string(),
  workSummary: z.string().max(2000).optional(),
  signerName: z.string().max(120).optional(),
  signatureDataUrl: z.string().optional(),
  requestReview: z.string().optional(),
  /** "payment" collects now; "invoice" sends the invoice instead. */
  finish: z.enum(['payment', 'invoice']),
})

const partsSchema = z.array(
  z.object({ priceBookItemId: z.string().uuid(), quantity: z.number().positive().max(9999) }),
)

export async function completeJobAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('job:write')

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  let parts: z.infer<typeof partsSchema>
  try {
    parts = partsSchema.parse(JSON.parse(parsed.data.partsJson))
  } catch {
    return { error: 'The parts list could not be read. Reload and try again.' }
  }

  const signature =
    parsed.data.signatureDataUrl && parsed.data.signerName
      ? { signerName: parsed.data.signerName, dataUrl: parsed.data.signatureDataUrl }
      : null

  let invoiceId: string | null = null
  try {
    const requestHeaders = await headers()
    const result = await completeJob(session, {
      jobId: parsed.data.jobId,
      partsUsed: parts,
      workSummary: parsed.data.workSummary ?? null,
      createInvoice: true,
      sendInvoice: parsed.data.finish === 'invoice',
      requestReview: parsed.data.requestReview === 'on',
      signature,
      ipAddress: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: requestHeaders.get('user-agent'),
    })
    invoiceId = result.invoiceId
  } catch (error) {
    return failure(error, formData)
  }

  if (invoiceId) {
    redirect(
      parsed.data.finish === 'payment'
        ? `/invoices/${invoiceId}?collect=1`
        : `/invoices/${invoiceId}`,
    )
  }
  redirect(`/jobs/${parsed.data.jobId}`)
}
