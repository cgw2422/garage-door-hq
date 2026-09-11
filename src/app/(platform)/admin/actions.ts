'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePlatformStaff } from '@/lib/session'
import { failure, parseForm, type FormState } from '@/lib/form'
import { endComplimentary, extendTrial, grantComplimentary } from '@/server/platform/service'

const extendSchema = z.object({
  organizationId: z.string().uuid(),
  days: z.coerce.number().int().min(1).max(365),
})

export async function extendTrialAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePlatformStaff()
  const parsed = parseForm(extendSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await extendTrial(actor, parsed.data)
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath(`/admin/companies/${parsed.data.organizationId}`)
  return { values: { saved: 'yes' } }
}

const grantSchema = z.object({
  organizationId: z.string().uuid(),
  months: z.coerce.number().int().min(1).max(60),
  reason: z.string().min(3, 'Record why').max(300),
})

export async function grantComplimentaryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePlatformStaff()
  const parsed = parseForm(grantSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await grantComplimentary(actor, parsed.data)
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath(`/admin/companies/${parsed.data.organizationId}`)
  return { values: { saved: 'yes' } }
}

const endSchema = z.object({
  organizationId: z.string().uuid(),
  newStatus: z.enum(['TRIALING', 'ACTIVE', 'CANCELLED']),
})

export async function endComplimentaryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePlatformStaff()
  const parsed = parseForm(endSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await endComplimentary(actor, parsed.data)
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath(`/admin/companies/${parsed.data.organizationId}`)
  return { values: { saved: 'yes' } }
}
