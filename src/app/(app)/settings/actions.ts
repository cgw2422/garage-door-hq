'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { recordAudit } from '@/lib/audit'
import { failure, parseForm, type FormState } from '@/lib/form'

const companySchema = z.object({
  name: z.string().min(2).max(160),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(160).optional(),
  website: z.string().max(200).optional(),
  addressLine1: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(2).optional(),
  postalCode: z.string().max(16).optional(),
  timezone: z.string().max(64),
  taxRatePercent: z.coerce.number().min(0).max(50),
  defaultPaymentTermsDays: z.coerce.number().int().min(0).max(180),
})

export async function saveCompanyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission('settings:manage')
  const parsed = parseForm(companySchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await session.db.organization.update({
      where: { id: session.organizationId },
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        website: parsed.data.website ?? null,
        addressLine1: parsed.data.addressLine1 ?? null,
        city: parsed.data.city ?? null,
        state: parsed.data.state?.toUpperCase() ?? null,
        postalCode: parsed.data.postalCode ?? null,
        timezone: parsed.data.timezone,
        defaultTaxRateBps: Math.round(parsed.data.taxRatePercent * 100),
        defaultPaymentTermsDays: parsed.data.defaultPaymentTermsDays,
      },
    })
  } catch (error) {
    return failure(error, formData)
  }

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'organization.settings_updated',
    entityType: 'Organization',
    entityId: session.organizationId,
  })

  revalidatePath('/settings')
  return {}
}

const laborSchema = z.object({
  laborCostEnabled: z.string().optional(),
  laborCostPerHour: z.coerce.number().min(0).max(10000).optional(),
})

/**
 * Internal labor cost is opt-in and off by default. A solo operator is never
 * pushed into inventing an hourly rate for themselves.
 */
export async function saveLaborCostAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('settings:manage')
  const parsed = parseForm(laborSchema, formData)
  if (!parsed.ok) return parsed.state

  const enabled = parsed.data.laborCostEnabled === 'on'
  if (enabled && !parsed.data.laborCostPerHour) {
    return { error: 'Enter an hourly cost, or leave labor cost switched off.' }
  }

  try {
    await session.db.organization.update({
      where: { id: session.organizationId },
      data: {
        laborCostEnabled: enabled,
        laborCostPerHourCents: enabled
          ? Math.round((parsed.data.laborCostPerHour ?? 0) * 100)
          : null,
      },
    })
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath('/settings')
  return {}
}

const reviewSchema = z.object({
  provider: z.enum(['GOOGLE', 'FACEBOOK', 'YELP', 'BBB', 'ANGI', 'OTHER']),
  url: z.string().url('Enter the full link, starting with https://').max(500),
  label: z.string().max(80).optional(),
})

/**
 * Review destinations are stored per provider. Only Google is offered in the UI
 * today; nothing in the model or this action assumes it.
 */
export async function saveReviewDestinationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('settings:manage')
  const parsed = parseForm(reviewSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await session.db.reviewDestination.upsert({
      where: {
        organizationId_provider: {
          organizationId: session.organizationId,
          provider: parsed.data.provider,
        },
      },
      create: {
        organizationId: session.organizationId,
        provider: parsed.data.provider,
        url: parsed.data.url,
        label: parsed.data.label ?? null,
        isPrimary: true,
        isActive: true,
      },
      update: {
        url: parsed.data.url,
        label: parsed.data.label ?? null,
        isActive: true,
      },
    })
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath('/settings')
  return {}
}
