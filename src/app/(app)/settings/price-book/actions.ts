'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { failure, parseForm, type FormState } from '@/lib/form'
import { parseDollarsToCents } from '@/lib/money'
import {
  archiveItem,
  archivePackage,
  createItem,
  createPackage,
  duplicateItem,
  restoreItem,
  restorePackage,
  updateItem,
  updatePackage,
} from '@/server/pricebook/service'

const CATEGORIES = [
  'SPRINGS', 'OPENERS', 'ROLLERS', 'CABLES', 'DRUMS', 'BEARINGS', 'HINGES', 'SHAFTS',
  'REMOTES', 'KEYPADS', 'PHOTO_EYES', 'WALL_CONTROLS', 'WEATHER_SEAL', 'PANELS', 'DOORS',
  'HARDWARE', 'LABOR', 'SERVICE_CALL', 'PACKAGE', 'MISCELLANEOUS',
] as const

/** Money is typed in dollars and stored in cents; one conversion, one place. */
const dollars = z
  .string()
  .transform((value) => parseDollarsToCents(value))
  .refine((cents): cents is number => cents !== null && cents >= 0, 'Enter a valid amount')

const itemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(160),
  category: z.enum(CATEGORIES),
  description: z.string().max(2000).optional(),
  sku: z.string().max(60).optional(),
  cost: dollars.optional().default('0'),
  price: dollars.optional().default('0'),
  unit: z.string().max(16).optional(),
  supplier: z.string().max(120).optional(),
  supplierPartNo: z.string().max(80).optional(),
  taxable: z.string().optional(),
  trackInventory: z.string().optional(),
})

function toInput(data: z.infer<typeof itemSchema>) {
  return {
    name: data.name,
    category: data.category,
    description: data.description,
    sku: data.sku,
    costCents: data.cost ?? 0,
    priceCents: data.price ?? 0,
    unit: data.unit,
    supplier: data.supplier,
    supplierPartNo: data.supplierPartNo,
    taxable: data.taxable === 'on',
    trackInventory: data.trackInventory === 'on',
  }
}

export async function createItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission('pricebook:write')
  const parsed = parseForm(itemSchema, formData)
  if (!parsed.ok) return parsed.state

  let itemId: string
  try {
    const item = await createItem(session, toInput(parsed.data))
    itemId = item.id
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath('/settings/price-book')
  redirect(`/settings/price-book/${itemId}?created=1`)
}

export async function updateItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission('pricebook:write')
  const itemId = String(formData.get('itemId') ?? '')
  const parsed = parseForm(itemSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await updateItem(session, itemId, toInput(parsed.data))
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath('/settings/price-book')
  revalidatePath(`/settings/price-book/${itemId}`)
  return { error: undefined, values: { saved: 'yes' } }
}

export async function archiveItemAction(formData: FormData) {
  const session = await requirePermission('pricebook:write')
  const itemId = String(formData.get('itemId') ?? '')
  await archiveItem(session, itemId)
  revalidatePath('/settings/price-book')
  redirect('/settings/price-book')
}

export async function restoreItemAction(formData: FormData) {
  const session = await requirePermission('pricebook:write')
  const itemId = String(formData.get('itemId') ?? '')
  await restoreItem(session, itemId)
  revalidatePath('/settings/price-book')
  revalidatePath(`/settings/price-book/${itemId}`)
}

export async function duplicateItemAction(formData: FormData) {
  const session = await requirePermission('pricebook:write')
  const itemId = String(formData.get('itemId') ?? '')
  const copy = await duplicateItem(session, itemId)
  revalidatePath('/settings/price-book')
  redirect(`/settings/price-book/${copy.id}?duplicated=1`)
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

const lineSchema = z.array(
  z.object({
    priceBookItemId: z.string().uuid(),
    quantity: z.number().positive().max(9999),
  }),
)

const packageSchema = z.object({
  name: z.string().min(1, 'Name is required').max(160),
  description: z.string().max(2000).optional(),
  defaultTier: z.enum(['GOOD', 'BETTER', 'BEST', 'STANDARD']).optional(),
  isRecommendedDefault: z.string().optional(),
  /** Blank means "sum the components". */
  price: z.string().optional(),
  linesJson: z.string(),
})

function toPackageInput(data: z.infer<typeof packageSchema>) {
  const lines = lineSchema.parse(JSON.parse(data.linesJson))
  const priceCents = data.price?.trim() ? parseDollarsToCents(data.price) : null

  return {
    name: data.name,
    description: data.description,
    defaultTier: data.defaultTier ?? null,
    isRecommendedDefault: data.isRecommendedDefault === 'on',
    priceCents,
    lines,
  }
}

export async function createPackageAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('pricebook:write')
  const parsed = parseForm(packageSchema, formData)
  if (!parsed.ok) return parsed.state

  let packageId: string
  try {
    const created = await createPackage(session, toPackageInput(parsed.data))
    packageId = created.id
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath('/settings/price-book')
  redirect(`/settings/price-book/packages/${packageId}?created=1`)
}

export async function updatePackageAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('pricebook:write')
  const packageId = String(formData.get('packageId') ?? '')
  const parsed = parseForm(packageSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await updatePackage(session, packageId, toPackageInput(parsed.data))
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath('/settings/price-book')
  revalidatePath(`/settings/price-book/packages/${packageId}`)
  return { values: { saved: 'yes' } }
}

export async function archivePackageAction(formData: FormData) {
  const session = await requirePermission('pricebook:write')
  const packageId = String(formData.get('packageId') ?? '')
  await archivePackage(session, packageId)
  revalidatePath('/settings/price-book')
  redirect('/settings/price-book?tab=packages')
}

export async function restorePackageAction(formData: FormData) {
  const session = await requirePermission('pricebook:write')
  const packageId = String(formData.get('packageId') ?? '')
  await restorePackage(session, packageId)
  revalidatePath('/settings/price-book')
}
