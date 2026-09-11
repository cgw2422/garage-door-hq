/**
 * Storage driver contract.
 *
 * Customer and job photos are private. Nothing in this product ever puts a
 * garage interior behind a guessable public URL: bytes go to the bucket through
 * a short-lived presigned PUT, and every read goes through an application route
 * that checks the session and the tenant before issuing a short-lived GET.
 */

export interface PresignedUpload {
  /** Where the browser PUTs the bytes. */
  url: string
  method: 'PUT'
  headers: Record<string, string>
  expiresInSeconds: number
}

export interface StorageDriver {
  readonly name: string
  /** Short-lived URL the browser uploads to directly. */
  presignUpload(params: {
    key: string
    contentType: string
    byteSize: number
    expiresInSeconds?: number
  }): Promise<PresignedUpload>
  /** Short-lived URL for reading, issued only after an authorization check. */
  presignDownload(params: { key: string; expiresInSeconds?: number; filename?: string }): Promise<string>
  /**
   * Write an object from the server. Used for small artifacts the application
   * produces itself — a captured signature — rather than files a browser
   * uploads, which always go through a presigned PUT.
   */
  put(params: { key: string; body: Buffer; contentType: string }): Promise<void>
  /** Confirms the object actually landed before a row is marked READY. */
  head(key: string): Promise<{ byteSize: number; contentType: string | null } | null>
  delete(key: string): Promise<void>
}

/** Image types a phone camera actually produces. */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
] as const

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024

export class StorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageError'
  }
}
