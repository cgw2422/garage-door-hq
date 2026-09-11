'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { failure } from '@/lib/form'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from '@/server/storage'
import { beginPhotoUpload, completePhotoUpload, deletePhoto } from '@/server/media/photos'

const targetSchema = z.object({
  jobId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  doorId: z.string().uuid().optional(),
  openerId: z.string().uuid().optional(),
  inspectionItemId: z.string().uuid().optional(),
  estimateId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
})

const beginSchema = z.object({
  target: targetSchema,
  kind: z.enum(['BEFORE', 'AFTER', 'DAMAGE', 'EQUIPMENT', 'SERIAL_TAG', 'INSPECTION', 'OTHER']),
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
  byteSize: z.number().int().positive().max(MAX_IMAGE_BYTES),
  caption: z.string().max(300).optional(),
})

export type BeginUploadResult =
  | {
      ok: true
      photoId: string
      url: string
      method: 'PUT'
      headers: Record<string, string>
    }
  | { ok: false; error: string }

/**
 * Step one of a photo capture: authorize it, reserve the row, hand back a
 * short-lived upload URL. The bytes go straight from the phone to storage.
 */
export async function beginPhotoUploadAction(
  input: z.infer<typeof beginSchema>,
): Promise<BeginUploadResult> {
  const session = await requirePermission('job:write')

  const parsed = beginSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That file cannot be uploaded.' }
  }

  try {
    const { photoId, upload } = await beginPhotoUpload(session, {
      target: parsed.data.target,
      kind: parsed.data.kind,
      contentType: parsed.data.contentType,
      byteSize: parsed.data.byteSize,
      caption: parsed.data.caption ?? null,
    })
    return {
      ok: true,
      photoId,
      url: upload.url,
      method: upload.method,
      headers: upload.headers,
    }
  } catch (error) {
    return { ok: false, error: failure(error).error ?? 'Could not start the upload.' }
  }
}

const completeSchema = z.object({
  photoId: z.string().uuid(),
  revalidate: z.string().max(300).optional(),
})

/** Step two: confirm the object landed, then the photo becomes visible. */
export async function completePhotoUploadAction(
  input: z.infer<typeof completeSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission('job:write')
  const parsed = completeSchema.parse(input)

  try {
    await completePhotoUpload(session, parsed.photoId)
    if (parsed.revalidate) revalidatePath(parsed.revalidate)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: failure(error).error ?? 'That upload did not finish.' }
  }
}

export async function deletePhotoAction(input: { photoId: string; revalidate?: string }) {
  const session = await requirePermission('job:write')
  await deletePhoto(session, input.photoId)
  if (input.revalidate) revalidatePath(input.revalidate)
}
