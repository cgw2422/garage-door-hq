'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireActiveSubscription } from '@/lib/session'
import { failure, parseForm, type FormState, guarded } from '@/lib/form'
import { enforceRateLimit } from '@/lib/rate-limit'
import {
  addStockedItem,
  adjustStock,
  setMinimum,
  transferStock,
} from '@/server/inventory/management'

const REASONS = [
  'RECEIVED',
  'RETURNED',
  'CORRECTION_UP',
  'CORRECTION_DOWN',
  'DAMAGED',
  'LOST',
  'USED_OFF_JOB',
] as const

const adjustSchema = z.object({
  locationId: z.string().uuid(),
  priceBookItemId: z.string().uuid(),
  quantity: z.coerce.number().positive('Enter how many').max(100000),
  reason: z.enum(REASONS),
  note: z.string().max(300).optional(),
  returnTo: z.string().max(200).optional(),
})

export async function adjustStockAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const gate = await guarded(() => requireActiveSubscription('inventory:adjust'), formData)
  if (!gate.ok) return gate.state
  const session = gate.value
  const parsed = parseForm(adjustSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await enforceRateLimit('sensitiveMutation', `user:${session.userId}`)
    await adjustStock(session, parsed.data)
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath('/inventory')
  revalidatePath(`/inventory/items/${parsed.data.priceBookItemId}`)
  redirect(parsed.data.returnTo ?? `/inventory/items/${parsed.data.priceBookItemId}?adjusted=1`)
}

const transferSchema = z.object({
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  priceBookItemId: z.string().uuid(),
  quantity: z.coerce.number().positive('Enter how many').max(100000),
  note: z.string().max(300).optional(),
})

export async function transferStockAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const gate = await guarded(() => requireActiveSubscription('inventory:transfer'), formData)
  if (!gate.ok) return gate.state
  const session = gate.value
  const parsed = parseForm(transferSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await enforceRateLimit('sensitiveMutation', `user:${session.userId}`)
    await transferStock(session, parsed.data)
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath('/inventory')
  redirect(`/inventory/items/${parsed.data.priceBookItemId}?transferred=1`)
}

const addSchema = z.object({
  priceBookItemId: z.string().uuid(),
  locationId: z.string().uuid(),
  minQuantity: z.coerce.number().min(0).max(100000).default(0),
  openingQuantity: z.coerce.number().min(0).max(100000).optional(),
  binLocation: z.string().max(40).optional(),
})

export async function addStockedItemAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const gate = await guarded(() => requireActiveSubscription('inventory:adjust'), formData)
  if (!gate.ok) return gate.state
  const session = gate.value
  const parsed = parseForm(addSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await addStockedItem(session, parsed.data)
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath('/inventory')
  redirect(`/inventory/items/${parsed.data.priceBookItemId}?stocked=1`)
}

const minimumSchema = z.object({
  locationId: z.string().uuid(),
  priceBookItemId: z.string().uuid(),
  minQuantity: z.coerce.number().min(0).max(100000),
  binLocation: z.string().max(40).optional(),
})

export async function setMinimumAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const gate = await guarded(() => requireActiveSubscription('inventory:adjust'), formData)
  if (!gate.ok) return gate.state
  const session = gate.value
  const parsed = parseForm(minimumSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await setMinimum(session, parsed.data)
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath(`/inventory/items/${parsed.data.priceBookItemId}`)
  return { values: { saved: 'yes' } }
}
