import type { AppSession } from '@/lib/session'
import {
  ALLOWED_IMAGE_TYPES,
  buildStorageKey,
  storage,
} from '@/server/storage'
import { ContentTypeError, assertImageBytes } from '@/server/storage/sniff'

/**
 * Company logo upload.
 *
 * Same two-phase presigned flow as a photo, but the result lives on the
 * organization rather than in the Photo table, because a logo is settings, not
 * a record of work. It is still a private object: the app serves it, and the
 * PDF renderer embeds the bytes rather than linking to them.
 */

const MAX_LOGO_BYTES = 2 * 1024 * 1024

export class LogoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LogoError'
  }
}

export async function beginLogoUpload(
  session: AppSession,
  input: { contentType: string; byteSize: number },
) {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(input.contentType)) {
    throw new LogoError('Use a PNG, JPEG or WebP image.')
  }
  if (input.byteSize <= 0 || input.byteSize > MAX_LOGO_BYTES) {
    throw new LogoError(`Logos must be under ${MAX_LOGO_BYTES / 1024 / 1024} MB.`)
  }

  const key = buildStorageKey({
    organizationId: session.organizationId,
    folder: 'logos',
    contentType: input.contentType,
  })

  const upload = await storage().presignUpload({
    key,
    contentType: input.contentType,
    byteSize: input.byteSize,
  })

  return { key, upload }
}

/**
 * Verify the object, then point the organization at it.
 *
 * The previous logo is removed only after the new one is confirmed, so a failed
 * upload never leaves a company with no logo on its invoices.
 */
export async function completeLogoUpload(session: AppSession, key: string) {
  const driver = storage()

  const object = await driver.head(key)
  if (!object) throw new LogoError('The upload did not arrive. Try again.')
  if (object.byteSize > MAX_LOGO_BYTES) {
    await driver.delete(key).catch(() => undefined)
    throw new LogoError('That image is too large.')
  }

  const headBytes = await driver.readHead(key, 64)
  if (!headBytes) throw new LogoError('The upload could not be read back.')

  try {
    assertImageBytes(headBytes, object.contentType ?? 'application/octet-stream')
  } catch (error) {
    await driver.delete(key).catch(() => undefined)
    if (error instanceof ContentTypeError) throw new LogoError(error.message)
    throw error
  }

  const organization = await session.db.organization.findUniqueOrThrow({
    where: { id: session.organizationId },
    select: { logoStorageKey: true },
  })

  await session.db.organization.update({
    where: { id: session.organizationId },
    data: { logoStorageKey: key },
  })

  if (organization.logoStorageKey && organization.logoStorageKey !== key) {
    await driver.delete(organization.logoStorageKey).catch((error) => {
      console.warn('[storage] could not remove replaced logo', error)
    })
  }

  return key
}

export async function removeLogo(session: AppSession) {
  const organization = await session.db.organization.findUniqueOrThrow({
    where: { id: session.organizationId },
    select: { logoStorageKey: true },
  })
  if (!organization.logoStorageKey) return

  await session.db.organization.update({
    where: { id: session.organizationId },
    data: { logoStorageKey: null },
  })
  await storage()
    .delete(organization.logoStorageKey)
    .catch((error) => console.warn('[storage] could not remove logo', error))
}
