import type { SignatureKind } from '@prisma/client'
import type { AppSession } from '@/lib/session'
import { buildStorageKey, storage } from '@/server/storage'

/**
 * Captured signatures.
 *
 * The canvas produces a small PNG data URL. It is decoded and written from the
 * server rather than presigned, because it is the application's own artifact,
 * it is tiny, and the write must succeed or fail with the signing transaction.
 */

const MAX_SIGNATURE_BYTES = 512 * 1024
const DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/

export class SignatureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignatureError'
  }
}

export function decodeSignature(dataUrl: string): Buffer {
  const match = DATA_URL.exec(dataUrl.trim())
  if (!match?.[1]) throw new SignatureError('That signature could not be read. Try signing again.')

  const body = Buffer.from(match[1], 'base64')
  if (body.byteLength === 0) throw new SignatureError('The signature was empty.')
  if (body.byteLength > MAX_SIGNATURE_BYTES) throw new SignatureError('That signature is too large.')
  return body
}

/** Store the image and return the key to record alongside the signature row. */
export async function storeSignatureImage(
  session: AppSession,
  dataUrl: string,
): Promise<string> {
  const body = decodeSignature(dataUrl)
  const key = buildStorageKey({
    organizationId: session.organizationId,
    folder: 'signatures',
    contentType: 'image/png',
  })
  await storage().put({ key, body, contentType: 'image/png' })
  return key
}

export interface SignatureContext {
  kind: SignatureKind
  signerName: string
  ipAddress?: string | null
  userAgent?: string | null
}
