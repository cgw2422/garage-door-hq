import type { PhotoKind, Prisma } from '@prisma/client'
import type { AppSession } from '@/lib/session'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  StorageError,
  buildStorageKey,
  storage,
} from '@/server/storage'
import { ContentTypeError, assertImageBytes } from '@/server/storage/sniff'

/**
 * Two-phase photo capture.
 *
 * 1. `beginPhotoUpload` validates the type and size, creates a PENDING row and
 *    hands back a short-lived presigned PUT.
 * 2. The browser sends the bytes straight to storage — they never pass through
 *    the application server.
 * 3. `completePhotoUpload` confirms the object really landed, records its true
 *    size and flips the row to READY.
 *
 * A PENDING row is never rendered, so an abandoned upload shows as nothing
 * rather than as a broken image.
 */

/** Where a photo can be attached. Exactly one target is required. */
export interface PhotoTarget {
  jobId?: string
  customerId?: string
  propertyId?: string
  doorId?: string
  openerId?: string
  inspectionItemId?: string
  priceBookItemId?: string
  estimateId?: string
  invoiceId?: string
}

export class PhotoUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhotoUploadError'
  }
}

function assertSingleTarget(target: PhotoTarget) {
  const set = Object.values(target).filter(Boolean)
  if (set.length !== 1) {
    throw new PhotoUploadError('A photo must be attached to exactly one record.')
  }
}

export async function beginPhotoUpload(
  session: AppSession,
  params: {
    target: PhotoTarget
    kind: PhotoKind
    contentType: string
    byteSize: number
    caption?: string | null
  },
) {
  assertSingleTarget(params.target)

  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(params.contentType)) {
    throw new PhotoUploadError(`Unsupported image type: ${params.contentType}`)
  }
  if (!Number.isFinite(params.byteSize) || params.byteSize <= 0) {
    throw new PhotoUploadError('Photo size is missing or invalid.')
  }
  if (params.byteSize > MAX_IMAGE_BYTES) {
    throw new PhotoUploadError(
      `That photo is ${(params.byteSize / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
    )
  }

  // Resolving the target through the tenant-scoped client is what stops a photo
  // being attached to another company's job by guessing an id.
  await assertTargetBelongsToTenant(session, params.target)

  const key = buildStorageKey({
    organizationId: session.organizationId,
    folder: 'photos',
    contentType: params.contentType,
  })

  const photo = await session.db.photo.create({
    data: {
      organizationId: session.organizationId,
      kind: params.kind,
      storageKey: key,
      contentType: params.contentType,
      byteSize: params.byteSize,
      caption: params.caption ?? null,
      createdById: session.userId,
      uploadStatus: 'PENDING',
      ...params.target,
    },
  })

  const upload = await storage().presignUpload({
    key,
    contentType: params.contentType,
    byteSize: params.byteSize,
  })

  return { photoId: photo.id, upload }
}

export async function completePhotoUpload(session: AppSession, photoId: string) {
  const photo = await session.db.photo.findUnique({ where: { id: photoId } })
  if (!photo) throw new PhotoUploadError('Photo not found.')
  if (photo.uploadStatus === 'READY') return photo

  const driver = storage()
  const object = await driver.head(photo.storageKey)
  if (!object) {
    await session.db.photo.update({ where: { id: photoId }, data: { uploadStatus: 'FAILED' } })
    throw new PhotoUploadError('The upload did not arrive. Try taking the photo again.')
  }

  if (object.byteSize > MAX_IMAGE_BYTES) {
    await rejectUpload(session, photoId, photo.storageKey)
    throw new PhotoUploadError('That upload is larger than the limit.')
  }

  // The declared content type came from the browser. Check what actually
  // landed before this row becomes readable by anyone.
  const headBytes = await driver.readHead(photo.storageKey, 64)
  if (!headBytes) {
    await rejectUpload(session, photoId, photo.storageKey)
    throw new PhotoUploadError('The upload could not be read back.')
  }

  let sniffed: string
  try {
    sniffed = assertImageBytes(headBytes, photo.contentType ?? 'application/octet-stream')
  } catch (error) {
    await rejectUpload(session, photoId, photo.storageKey)
    if (error instanceof ContentTypeError) throw new PhotoUploadError(error.message)
    throw error
  }

  return session.db.photo.update({
    where: { id: photoId },
    data: {
      uploadStatus: 'READY',
      uploadedAt: new Date(),
      // Trust the object store's own accounting over the client's claim.
      byteSize: object.byteSize,
      contentType: sniffed,
    },
  })
}

/** Mark a failed upload and remove the object it left behind. */
async function rejectUpload(session: AppSession, photoId: string, storageKey: string) {
  await session.db.photo.update({ where: { id: photoId }, data: { uploadStatus: 'FAILED' } })
  try {
    await storage().delete(storageKey)
  } catch (error) {
    console.warn('[storage] could not remove rejected upload', storageKey, error)
  }
}

/**
 * Resolve a photo for reading. Returns null when it does not exist, belongs to
 * another organization, or has not finished uploading.
 */
export async function resolveReadablePhoto(session: AppSession, photoId: string) {
  const photo = await session.db.photo.findUnique({ where: { id: photoId } })
  if (!photo || photo.uploadStatus !== 'READY') return null
  return photo
}

export async function deletePhoto(session: AppSession, photoId: string) {
  const photo = await session.db.photo.findUnique({ where: { id: photoId } })
  if (!photo) return

  await session.db.photo.delete({ where: { id: photoId } })
  try {
    await storage().delete(photo.storageKey)
  } catch (error) {
    // The row is gone either way; a stranded object is a cleanup job, not a
    // reason to fail the technician's action.
    if (!(error instanceof StorageError)) throw error
    console.warn('[storage] failed to delete object', photo.storageKey, error)
  }
}

async function assertTargetBelongsToTenant(session: AppSession, target: PhotoTarget) {
  const db = session.db
  const checks: Array<Promise<unknown | null>> = []

  if (target.jobId) checks.push(db.job.findUnique({ where: { id: target.jobId }, select: { id: true } }))
  if (target.customerId) checks.push(db.customer.findUnique({ where: { id: target.customerId }, select: { id: true } }))
  if (target.propertyId) checks.push(db.property.findUnique({ where: { id: target.propertyId }, select: { id: true } }))
  if (target.doorId) checks.push(db.door.findUnique({ where: { id: target.doorId }, select: { id: true } }))
  if (target.openerId) checks.push(db.opener.findUnique({ where: { id: target.openerId }, select: { id: true } }))
  if (target.estimateId) checks.push(db.estimate.findUnique({ where: { id: target.estimateId }, select: { id: true } }))
  if (target.invoiceId) checks.push(db.invoice.findUnique({ where: { id: target.invoiceId }, select: { id: true } }))
  if (target.priceBookItemId) {
    checks.push(
      db.priceBookItem.findUnique({ where: { id: target.priceBookItemId }, select: { id: true } }),
    )
  }
  if (target.inspectionItemId) {
    // Inspection items have no tenant column of their own; they are reached
    // through their scoped inspection.
    checks.push(
      db.inspection.findFirst({
        where: { items: { some: { id: target.inspectionItemId } } },
        select: { id: true },
      }),
    )
  }

  const results = await Promise.all(checks)
  if (results.some((row) => row === null)) {
    throw new PhotoUploadError('That record does not exist.')
  }
}

export type PhotoWhere = Prisma.PhotoWhereInput
/** Every photo list in the UI filters on this, so PENDING rows stay invisible. */
export const READY_PHOTOS: PhotoWhere = { uploadStatus: 'READY' }
