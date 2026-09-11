'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { failure, parseForm, type FormState } from '@/lib/form'
import {
  archiveCustomer,
  archiveProperty,
  restoreCustomer,
  restoreProperty,
  updateCustomer,
  updateProperty,
} from '@/server/customers/service'
import { archiveDoor, updateDoor } from '@/server/doors/service'

/** Edits and archival for customers, properties and Door Passports. */

const customerSchema = z.object({
  customerId: z.string().uuid(),
  firstName: z.string().min(1, 'First name is required').max(80),
  lastName: z.string().min(1, 'Last name is required').max(80),
  companyName: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  altPhone: z.string().max(40).optional(),
  email: z.string().email('Enter a valid email').max(160).optional(),
  notesSummary: z.string().max(2000).optional(),
})

export async function updateCustomerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('customer:write')
  const parsed = parseForm(customerSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    const { customerId, ...rest } = parsed.data
    await updateCustomer(session, customerId, rest)
    revalidatePath(`/customers/${customerId}`)
  } catch (error) {
    return failure(error, formData)
  }

  redirect(`/customers/${parsed.data.customerId}`)
}

export async function archiveCustomerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('customer:archive')
  const customerId = String(formData.get('customerId') ?? '')

  try {
    await archiveCustomer(session, customerId)
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath('/customers')
  redirect('/customers')
}

export async function restoreCustomerAction(formData: FormData) {
  const session = await requirePermission('customer:archive')
  const customerId = String(formData.get('customerId') ?? '')
  await restoreCustomer(session, customerId)
  revalidatePath(`/customers/${customerId}`)
}

const propertySchema = z.object({
  propertyId: z.string().uuid(),
  nickname: z.string().max(80).optional(),
  line1: z.string().min(1, 'Street address is required').max(200),
  line2: z.string().max(120).optional(),
  city: z.string().min(1, 'City is required').max(120),
  state: z.string().min(2, 'State is required').max(2),
  postalCode: z.string().min(3, 'ZIP is required').max(16),
  kind: z.enum(['RESIDENTIAL', 'COMMERCIAL']).optional(),
  accessInstructions: z.string().max(500).optional(),
  gateInfo: z.string().max(200).optional(),
})

export async function updatePropertyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('customer:write')
  const parsed = parseForm(propertySchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    const { propertyId, ...rest } = parsed.data
    await updateProperty(session, propertyId, rest)
    revalidatePath(`/properties/${propertyId}`)
  } catch (error) {
    return failure(error, formData)
  }

  redirect(`/properties/${parsed.data.propertyId}`)
}

export async function archivePropertyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('customer:archive')
  const propertyId = String(formData.get('propertyId') ?? '')
  const customerId = String(formData.get('customerId') ?? '')

  try {
    await archiveProperty(session, propertyId)
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath(`/customers/${customerId}`)
  redirect(`/customers/${customerId}`)
}

export async function restorePropertyAction(formData: FormData) {
  const session = await requirePermission('customer:archive')
  const propertyId = String(formData.get('propertyId') ?? '')
  await restoreProperty(session, propertyId)
  revalidatePath(`/properties/${propertyId}`)
}

const optionalNumber = z.coerce.number().positive().optional()

const doorSchema = z.object({
  doorId: z.string().uuid(),
  nickname: z.string().max(80).optional(),
  positionLabel: z.string().max(80).optional(),
  widthInches: optionalNumber,
  heightInches: optionalNumber,
  panelCount: z.coerce.number().int().positive().max(12).optional(),
  manufacturer: z.string().max(80).optional(),
  model: z.string().max(120).optional(),
  serialNumber: z.string().max(120).optional(),
  material: z
    .enum(['STEEL', 'ALUMINUM', 'WOOD', 'WOOD_COMPOSITE', 'FIBERGLASS', 'VINYL', 'GLASS', 'ROLLING_STEEL', 'OTHER'])
    .optional(),
  color: z.string().max(60).optional(),
  insulated: z.enum(['yes', 'no', 'unknown']).optional(),
  trackType: z.string().max(80).optional(),
  trackRadiusInches: optionalNumber,
  headroomInches: optionalNumber,
  weightLbs: optionalNumber,
  installedAt: z.string().optional(),
  warrantyEndsAt: z.string().optional(),
  laborWarrantyEndsAt: z.string().optional(),
  notesSummary: z.string().max(2000).optional(),
})

function parseDate(value?: string): Date | null {
  if (!value) return null
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function updateDoorAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('door:write')
  const parsed = parseForm(doorSchema, formData)
  if (!parsed.ok) return parsed.state

  const data = parsed.data
  try {
    await updateDoor(session, data.doorId, {
      nickname: data.nickname,
      positionLabel: data.positionLabel,
      widthInches: data.widthInches,
      heightInches: data.heightInches,
      panelCount: data.panelCount,
      manufacturer: data.manufacturer,
      model: data.model,
      serialNumber: data.serialNumber,
      material: data.material,
      color: data.color,
      insulated: data.insulated === 'yes' ? true : data.insulated === 'no' ? false : null,
      trackType: data.trackType,
      trackRadiusInches: data.trackRadiusInches,
      headroomInches: data.headroomInches,
      weightLbs: data.weightLbs,
      installedAt: parseDate(data.installedAt),
      warrantyEndsAt: parseDate(data.warrantyEndsAt),
      laborWarrantyEndsAt: parseDate(data.laborWarrantyEndsAt),
      notesSummary: data.notesSummary,
    })
    revalidatePath(`/doors/${data.doorId}`)
  } catch (error) {
    return failure(error, formData)
  }

  redirect(`/doors/${data.doorId}`)
}

export async function archiveDoorAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('door:write')
  const doorId = String(formData.get('doorId') ?? '')
  const propertyId = String(formData.get('propertyId') ?? '')

  try {
    await archiveDoor(session, doorId)
  } catch (error) {
    return failure(error, formData)
  }

  redirect(`/properties/${propertyId}`)
}
