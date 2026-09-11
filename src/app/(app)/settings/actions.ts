'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { recordAudit } from '@/lib/audit'
import { failure, parseForm, type FormState } from '@/lib/form'
import { beginLogoUpload, completeLogoUpload, removeLogo } from '@/server/media/logo'
import { ALLOWED_IMAGE_TYPES } from '@/server/storage'

const companySchema = z.object({
  name: z.string().min(2).max(160),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(160).optional(),
  website: z.string().max(200).optional(),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(2).optional(),
  postalCode: z.string().max(16).optional(),
  timezone: z.string().max(64),
  currency: z.enum(['USD', 'CAD']),
  taxRatePercent: z.coerce.number().min(0).max(50),
  defaultPaymentTermsDays: z.coerce.number().int().min(0).max(180),
  estimateTermsText: z.string().max(4000).optional(),
  invoiceTermsText: z.string().max(4000).optional(),
  businessHoursJson: z.string().max(4000).optional(),
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
        addressLine2: parsed.data.addressLine2 ?? null,
        timezone: parsed.data.timezone,
        currency: parsed.data.currency,
        defaultTaxRateBps: Math.round(parsed.data.taxRatePercent * 100),
        defaultPaymentTermsDays: parsed.data.defaultPaymentTermsDays,
        // Terms are copied onto each new document, so editing them here never
        // rewrites an estimate or invoice that already exists.
        estimateTermsText: parsed.data.estimateTermsText ?? null,
        invoiceTermsText: parsed.data.invoiceTermsText ?? null,
        businessHours: parsed.data.businessHoursJson
          ? (JSON.parse(parsed.data.businessHoursJson) as object)
          : undefined,
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
  reviewRequestEnabled: z.string().optional(),
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
    await session.db.organization.update({
      where: { id: session.organizationId },
      data: { reviewRequestEnabled: parsed.data.reviewRequestEnabled === 'on' },
    })

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

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

const logoBeginSchema = z.object({
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
  byteSize: z.number().int().positive(),
})

export async function beginLogoUploadAction(
  input: z.infer<typeof logoBeginSchema>,
): Promise<
  | { ok: true; key: string; url: string; method: 'PUT'; headers: Record<string, string> }
  | { ok: false; error: string }
> {
  const session = await requirePermission('settings:manage')
  const parsed = logoBeginSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That file cannot be used as a logo.' }

  try {
    const { key, upload } = await beginLogoUpload(session, parsed.data)
    return { ok: true, key, url: upload.url, method: upload.method, headers: upload.headers }
  } catch (error) {
    return { ok: false, error: failure(error).error ?? 'Could not start the upload.' }
  }
}

export async function completeLogoUploadAction(input: {
  key: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission('settings:manage')

  try {
    await completeLogoUpload(session, input.key)
  } catch (error) {
    return { ok: false, error: failure(error).error ?? 'That upload did not finish.' }
  }

  revalidatePath('/settings')
  return { ok: true }
}

export async function removeLogoAction() {
  const session = await requirePermission('settings:manage')
  await removeLogo(session)
  revalidatePath('/settings')
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

const numberingSchema = z.object({
  entity: z.enum(['JOB', 'ESTIMATE', 'INVOICE', 'DOOR', 'CUSTOMER']),
  nextValue: z.coerce.number().int().min(1).max(9_999_999),
})

/**
 * The starting number for the next document of each kind.
 *
 * It only moves forward: lowering it would hand out a number an existing
 * document already carries and collide on the per-organization uniqueness
 * constraint.
 *
 * Custom prefixes ("GD-" instead of "INV-") are deliberately not editable yet.
 * Doing that consistently means storing the rendered number on each document
 * so a later prefix change cannot appear to renumber past invoices — a schema
 * change worth making on its own rather than halfway through this one. The
 * column exists and is unused.
 */
export async function saveNumberingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('settings:manage')
  const parsed = parseForm(numberingSchema, formData)
  if (!parsed.ok) return parsed.state

  const current = await session.db.numberSequence.findUnique({
    where: {
      organizationId_entity: {
        organizationId: session.organizationId,
        entity: parsed.data.entity,
      },
    },
  })

  if (current && parsed.data.nextValue < current.nextValue) {
    return {
      error: `The next number can only move forward. It is currently ${current.nextValue}.`,
    }
  }

  try {
    await session.db.numberSequence.update({
      where: {
        organizationId_entity: {
          organizationId: session.organizationId,
          entity: parsed.data.entity,
        },
      },
      data: { nextValue: parsed.data.nextValue },
    })
  } catch (error) {
    return failure(error, formData)
  }

  revalidatePath('/settings')
  return { values: { saved: 'yes' } }
}
