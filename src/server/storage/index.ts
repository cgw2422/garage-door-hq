import { randomUUID } from 'node:crypto'
import { appBaseUrlUnchecked } from '@/lib/app-url'
import { createLocalDriver } from './local'
import { createR2Driver, readR2ConfigFromEnv } from './r2'
import type { StorageDriver } from './types'

export * from './types'

let cached: StorageDriver | null = null

/**
 * R2 when it is configured, a local folder otherwise.
 *
 * The driver is chosen from the environment rather than from NODE_ENV so a
 * staging deployment with R2 credentials behaves exactly like production.
 */
export function storage(): StorageDriver {
  if (cached) return cached

  const explicit = process.env.STORAGE_DRIVER
  const r2Config = readR2ConfigFromEnv()

  if (explicit === 'local') {
    cached = createLocalDriver(appBaseUrlUnchecked())
  } else if (r2Config) {
    cached = createR2Driver(r2Config)
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[storage] No R2 credentials configured; falling back to local disk. ' +
          'Container filesystems are ephemeral — set R2_* before taking real photos.',
      )
    }
    cached = createLocalDriver(appBaseUrlUnchecked())
  }

  return cached
}

/** Test seam: drop the memoized driver so env changes take effect. */
export function resetStorage() {
  cached = null
}

export function storageDriverName(): string {
  return storage().name
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
}

/**
 * Keys are namespaced by organization. That is not the access control - the
 * read route is - but it keeps a bucket listing legible and makes a per-tenant
 * lifecycle rule or export possible later.
 */
export function buildStorageKey(params: {
  organizationId: string
  folder: 'photos' | 'voice-notes' | 'signatures' | 'logos'
  contentType: string
}): string {
  const extension = EXTENSIONS[params.contentType] ?? 'bin'
  const now = new Date()
  const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  return `org/${params.organizationId}/${params.folder}/${yyyymm}/${randomUUID()}.${extension}`
}
