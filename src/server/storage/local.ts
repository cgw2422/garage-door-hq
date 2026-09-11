import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { PresignedUpload, StorageDriver } from './types'
import { StorageError } from './types'

/**
 * Development driver: the same two-phase flow as R2, backed by a folder.
 *
 * It exists so the upload path can be exercised end to end without cloud
 * credentials, and so the application code has exactly one flow rather than a
 * "skip the upload in dev" branch. It signs its upload URLs with the same
 * expiry discipline as a real presign, and reads still go through the
 * authorized route.
 *
 * Not for production: a container filesystem is ephemeral, and this driver
 * neither replicates nor backs anything up.
 */
const ROOT = resolve(process.env.LOCAL_STORAGE_DIR ?? '.storage')

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new StorageError('AUTH_SECRET is required to sign local upload URLs')
  return secret
}

export interface LocalUploadClaim {
  key: string
  contentType: string
  byteSize: number
  expiresAt: number
}

export function signLocalUpload(claim: LocalUploadClaim): string {
  const payload = Buffer.from(JSON.stringify(claim)).toString('base64url')
  const signature = createHmac('sha256', signingSecret()).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

/** Returns the claim only if the signature is valid and unexpired. */
export function verifyLocalUpload(token: string): LocalUploadClaim | null {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null

  const expected = createHmac('sha256', signingSecret()).update(payload).digest('base64url')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const claim = JSON.parse(Buffer.from(payload, 'base64url').toString()) as LocalUploadClaim
    if (claim.expiresAt < Date.now()) return null
    return claim
  } catch {
    return null
  }
}

/** Rejects any key that tries to escape the storage root. */
function pathForKey(key: string): string {
  const full = resolve(join(ROOT, key))
  if (full !== ROOT && !full.startsWith(`${ROOT}/`)) {
    throw new StorageError(`Refusing to resolve storage key outside the root: ${key}`)
  }
  return full
}

export async function writeLocalObject(key: string, body: Buffer, contentType: string) {
  const path = pathForKey(key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body)
  await writeFile(`${path}.meta`, JSON.stringify({ contentType, byteSize: body.byteLength }))
}

export async function readLocalObject(key: string) {
  const path = pathForKey(key)
  const [body, meta] = await Promise.all([
    readFile(path),
    readFile(`${path}.meta`, 'utf8').catch(() => null),
  ])
  const parsed = meta ? (JSON.parse(meta) as { contentType?: string }) : null
  return { body, contentType: parsed?.contentType ?? 'application/octet-stream' }
}

export function createLocalDriver(baseUrl: string): StorageDriver {
  return {
    name: 'local',

    async presignUpload({ key, contentType, byteSize, expiresInSeconds = 300 }): Promise<PresignedUpload> {
      const token = signLocalUpload({
        key,
        contentType,
        byteSize,
        expiresAt: Date.now() + expiresInSeconds * 1000,
      })
      return {
        url: `${baseUrl}/api/files/upload/${token}`,
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        expiresInSeconds,
      }
    },

    async presignDownload() {
      // There is no direct read URL in development: the authorized route reads
      // the file itself. Anything calling this has skipped the access check.
      throw new StorageError(
        'Local storage has no direct download URL. Read photos through /api/files/photos/[id].',
      )
    },

    async put({ key, body, contentType }) {
      await writeLocalObject(key, body, contentType)
    },

    async head(key) {
      try {
        const path = pathForKey(key)
        const info = await stat(path)
        const meta = await readFile(`${path}.meta`, 'utf8').catch(() => null)
        const parsed = meta ? (JSON.parse(meta) as { contentType?: string }) : null
        return { byteSize: info.size, contentType: parsed?.contentType ?? null }
      } catch {
        return null
      }
    },

    async delete(key) {
      const path = pathForKey(key)
      await unlink(path).catch(() => undefined)
      await unlink(`${path}.meta`).catch(() => undefined)
    },
  }
}
