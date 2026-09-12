'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireActiveSubscription } from '@/lib/session'
import { failure, parseForm, type FormState } from '@/lib/form'
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

function refresh(estimateId: string) {
  revalidatePath(`/estimates/${estimateId}`)
}

const addPackageSchema = z.object({
  estimateId: z.string().uuid(),
  packageId: z.string().uuid(),
  tier: z.enum(['GOOD', 'BETTER', 'BEST', 'STANDARD']).optional(),
})

export async function addPackageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireActiveSubscription('estimate:write')
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
  const session = await requireActiveSubscription('estimate:write')
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
  const session = await requireActiveSubscription('estimate:write')
  await removeEstimateItem(session, input.itemId)
  refresh(input.estimateId)
}

export async function removeOptionAction(input: { estimateId: string; optionId: string }) {
  const session = await requireActiveSubscription('estimate:write')
  await removeEstimateOption(session, input.optionId)
  refresh(input.estimateId)
}

export async function setRecommendedAction(input: { estimateId: string; optionId: string }) {
  const session = await requireActiveSubscription('estimate:write')
  await setRecommendedOption(session, input.optionId)
  refresh(input.estimateId)
}

export async function setQuantityAction(input: {
  estimateId: string
  itemId: string
  quantity: number
}) {
  const session = await requireActiveSubscription('estimate:write')
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
  const session = await requireActiveSubscription('estimate:write')
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
  const session = await requireActiveSubscription('estimate:write')
  const estimateId = String(formData.get('estimateId') ?? '')

  try {
    await sendEstimate(session, estimateId)
  } catch (error) {
    return failure(error, formData)
  }
  redirect(`/estimates/${estimateId}/sign`)
}
