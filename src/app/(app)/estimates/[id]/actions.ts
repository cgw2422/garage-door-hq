'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireActiveSubscription } from '@/lib/session'
import { failure, parseForm, type FormState, guarded } from '@/lib/form'
import {
  addCatalogItemToEstimate,
  addPackageToEstimate,
  removeEstimateItem,
  removeEstimateOption,
  setEstimateTaxRate,
  setRecommendedOption,
  updateEstimateItemQuantity,
} from '@/server/estimates/builder'
import { sendEstimate } from '@/server/estimates/lifecycle'

/**
 * The estimate, and the inspection that recommended into it.
 *
 * Taking a line off here has to turn the "Added" state back off on every
 * recommendation that sells it, and those live on the inspection screen.
 */
function refresh(estimateId: string, jobId?: string | null) {
  revalidatePath(`/estimates/${estimateId}`)
  if (jobId) revalidatePath(`/jobs/${jobId}/inspection`)
}

const addPackageSchema = z.object({
  estimateId: z.string().uuid(),
  packageId: z.string().uuid(),
  tier: z.enum(['GOOD', 'BETTER', 'BEST', 'STANDARD']).optional(),
})

export async function addPackageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await guarded(() => requireActiveSubscription('estimate:write'))
  if (!gate.ok) return gate.state
  const session = gate.value
  const parsed = parseForm(addPackageSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await addPackageToEstimate(session, parsed.data)
  } catch (error) {
    return failure(error, formData)
  }
  refresh(parsed.data.estimateId)
  return {}
}

const addItemSchema = z.object({
  estimateId: z.string().uuid(),
  priceBookItemId: z.string().uuid(),
  optionId: z.string().uuid().optional(),
  quantity: z.coerce.number().positive().max(9999).default(1),
})

export async function addItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await guarded(() => requireActiveSubscription('estimate:write'))
  if (!gate.ok) return gate.state
  const session = gate.value
  const parsed = parseForm(addItemSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await addCatalogItemToEstimate(session, parsed.data)
  } catch (error) {
    return failure(error, formData)
  }
  refresh(parsed.data.estimateId)
  return {}
}

export async function removeItemAction(input: { estimateId: string; itemId: string }) {
  const gate = await guarded(() => requireActiveSubscription('estimate:write'))
  if (!gate.ok) return gate.state
  const session = gate.value
  const { jobId } = await removeEstimateItem(session, input.itemId)
  refresh(input.estimateId, jobId)
}

export async function removeOptionAction(input: { estimateId: string; optionId: string }) {
  const gate = await guarded(() => requireActiveSubscription('estimate:write'))
  if (!gate.ok) return gate.state
  const session = gate.value
  const { jobId } = await removeEstimateOption(session, input.optionId)
  refresh(input.estimateId, jobId)
}

export async function setRecommendedAction(input: { estimateId: string; optionId: string }) {
  const gate = await guarded(() => requireActiveSubscription('estimate:write'))
  if (!gate.ok) return gate.state
  const session = gate.value
  await setRecommendedOption(session, input.optionId)
  refresh(input.estimateId)
}

export async function setQuantityAction(input: {
  estimateId: string
  itemId: string
  quantity: number
}) {
  const gate = await guarded(() => requireActiveSubscription('estimate:write'))
  if (!gate.ok) return gate.state
  const session = gate.value
  await updateEstimateItemQuantity(session, { itemId: input.itemId, quantity: input.quantity })
  refresh(input.estimateId)
}

const taxSchema = z.object({
  estimateId: z.string().uuid(),
  /** Entered as a percentage; stored as basis points. */
  taxRatePercent: z.coerce.number().min(0).max(50),
  taxJurisdiction: z.string().max(120).optional(),
})

export async function setTaxRateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await guarded(() => requireActiveSubscription('estimate:write'))
  if (!gate.ok) return gate.state
  const session = gate.value
  const parsed = parseForm(taxSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await setEstimateTaxRate(session, {
      estimateId: parsed.data.estimateId,
      taxRateBps: Math.round(parsed.data.taxRatePercent * 100),
      jurisdiction: parsed.data.taxJurisdiction ?? null,
    })
  } catch (error) {
    return failure(error, formData)
  }
  refresh(parsed.data.estimateId)
  return {}
}

export async function presentEstimateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await guarded(() => requireActiveSubscription('estimate:write'))
  if (!gate.ok) return gate.state
  const session = gate.value
  const estimateId = String(formData.get('estimateId') ?? '')

  try {
    await sendEstimate(session, estimateId)
  } catch (error) {
    return failure(error, formData)
  }
  redirect(`/estimates/${estimateId}/sign`)
}
