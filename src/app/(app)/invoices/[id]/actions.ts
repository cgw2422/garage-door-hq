'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { failure, parseForm, type FormState } from '@/lib/form'
import { markInvoiceSent, recordPayment } from '@/server/invoices/service'

const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  method: z.enum(['CARD', 'ACH', 'CASH', 'CHECK', 'OTHER']),
  amountDollars: z.coerce.number().positive('Enter an amount greater than zero'),
  feeDollars: z.coerce.number().min(0).optional(),
  reference: z.string().max(120).optional(),
  memo: z.string().max(300).optional(),
})

export async function recordPaymentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('payment:record')
  const parsed = parseForm(paymentSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await recordPayment(session, {
      invoiceId: parsed.data.invoiceId,
      method: parsed.data.method,
      amountCents: Math.round(parsed.data.amountDollars * 100),
      feeCents: Math.round((parsed.data.feeDollars ?? 0) * 100),
      reference: parsed.data.reference ?? null,
      memo: parsed.data.memo ?? null,
    })
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath(`/invoices/${parsed.data.invoiceId}`)
  return {}
}

export async function sendInvoiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission('invoice:write')
  const invoiceId = String(formData.get('invoiceId') ?? '')

  try {
    await markInvoiceSent(session, invoiceId)
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath(`/invoices/${invoiceId}`)
  return {}
}
