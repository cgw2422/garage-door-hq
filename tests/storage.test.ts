import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rm } from 'node:fs/promises'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import { beginPhotoUpload, completePhotoUpload, PhotoUploadError } from '@/server/media/photos'
import { storage, resetStorage, buildStorageKey, MAX_IMAGE_BYTES } from '@/server/storage'
import { decodeSignature, storeSignatureImage } from '@/server/media/signatures'
import { verifyLocalUpload, writeLocalObject } from '@/server/storage/local'

/**
 * Bytes that really do start like a PNG. The completion step sniffs the magic
 * number rather than trusting the declared type, so a buffer of ones is
 * correctly refused — only a real header gets through.
 */
function pngBytes(size: number) {
  const buffer = Buffer.alloc(size, 1)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer)
  return buffer
}
import { createTestCompany, createTestDoor, createTestJob } from './helpers'

/**
 * Photo capture is a two-phase upload: reserve a PENDING row, send the bytes to
 * a short-lived presigned URL, then confirm. Nothing is visible until the
 * object actually landed, and nothing can be attached to another tenant's job.
 */

let session: AppSession
let otherSession: AppSession
let jobId: string

beforeAll(async () => {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret-for-local-upload-signing'
  process.env.STORAGE_DRIVER = 'local'
  process.env.LOCAL_STORAGE_DIR = '.storage-test'
  resetStorage()

  const company = await createTestCompany()
  session = company.session
  const other = await createTestCompany()
  otherSession = other.session

  const { customer, property, door } = await createTestDoor(session)
  const job = await createTestJob(session, {
    customerId: customer.id,
    propertyId: property.id,
    doorId: door.id,
  })
  jobId = job.id
})

afterAll(async () => {
  await rm('.storage-test', { recursive: true, force: true })
  await prisma.$disconnect()
})

describe('photo upload lifecycle', () => {
  it('creates a PENDING row and a signed upload the browser can use', async () => {
    const { photoId, upload } = await beginPhotoUpload(session, {
      target: { jobId },
      kind: 'BEFORE',
      contentType: 'image/jpeg',
      byteSize: 1024,
    })

    const row = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } })
    expect(row.uploadStatus).toBe('PENDING')
    expect(row.organizationId).toBe(session.organizationId)
    // Keys are namespaced per tenant.
    expect(row.storageKey.startsWith(`org/${session.organizationId}/photos/`)).toBe(true)

    expect(upload.method).toBe('PUT')
    const token = upload.url.split('/').pop()!
    const claim = verifyLocalUpload(token)
    expect(claim?.key).toBe(row.storageKey)
    expect(claim?.byteSize).toBe(1024)
    expect(claim?.contentType).toBe('image/jpeg')
  })

  it('only becomes READY once the object exists', async () => {
    const { photoId } = await beginPhotoUpload(session, {
      target: { jobId },
      kind: 'AFTER',
      contentType: 'image/png',
      byteSize: 64,
    })

    await expect(completePhotoUpload(session, photoId)).rejects.toBeInstanceOf(PhotoUploadError)
    const failed = await prisma.photo.findUniqueOrThrow({ where: { id: photoId } })
    expect(failed.uploadStatus).toBe('FAILED')

    await writeLocalObject(failed.storageKey, pngBytes(64), 'image/png')
    const ready = await completePhotoUpload(session, photoId)
    expect(ready.uploadStatus).toBe('READY')
    expect(ready.uploadedAt).not.toBeNull()
    // The object store's own accounting wins over the client's claim.
    expect(ready.byteSize).toBe(64)
  })

  it('rejects a file type a camera would not produce', async () => {
    await expect(
      beginPhotoUpload(session, {
        target: { jobId },
        kind: 'OTHER',
        contentType: 'application/pdf',
        byteSize: 100,
      }),
    ).rejects.toThrow(/unsupported image type/i)
  })

  it('rejects an oversized photo before reserving anything', async () => {
    const before = await prisma.photo.count({ where: { organizationId: session.organizationId } })
    await expect(
      beginPhotoUpload(session, {
        target: { jobId },
        kind: 'OTHER',
        contentType: 'image/jpeg',
        byteSize: MAX_IMAGE_BYTES + 1,
      }),
    ).rejects.toThrow(/limit is/i)
    expect(await prisma.photo.count({ where: { organizationId: session.organizationId } })).toBe(
      before,
    )
  })

  it('refuses to attach a photo to another organization job', async () => {
    await expect(
      beginPhotoUpload(otherSession, {
        target: { jobId },
        kind: 'OTHER',
        contentType: 'image/jpeg',
        byteSize: 100,
      }),
    ).rejects.toThrow(/does not exist/i)
  })

  it('requires exactly one attachment target', async () => {
    await expect(
      beginPhotoUpload(session, {
        target: {},
        kind: 'OTHER',
        contentType: 'image/jpeg',
        byteSize: 100,
      }),
    ).rejects.toThrow(/exactly one record/i)
  })
})

describe('local upload tokens', () => {
  it('rejects a tampered token', async () => {
    const { upload } = await beginPhotoUpload(session, {
      target: { jobId },
      kind: 'OTHER',
      contentType: 'image/jpeg',
      byteSize: 10,
    })
    const token = upload.url.split('/').pop()!
    const [payload, signature] = token.split('.')
    expect(verifyLocalUpload(`${payload}.${signature!.slice(0, -2)}xx`)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const { signLocalUpload } = await import('@/server/storage/local')
    const expired = signLocalUpload({
      key: 'org/x/photos/expired.jpg',
      contentType: 'image/jpeg',
      byteSize: 10,
      expiresAt: Date.now() - 1000,
    })
    expect(verifyLocalUpload(expired)).toBeNull()
  })

  it('refuses a storage key that escapes the root', async () => {
    await expect(
      writeLocalObject('../../escape.txt', Buffer.from('x'), 'text/plain'),
    ).rejects.toThrow(/outside the root/i)
  })
})

describe('signatures', () => {
  it('decodes a PNG data URL and stores it under the tenant prefix', async () => {
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    expect(decodeSignature(dataUrl).byteLength).toBeGreaterThan(0)

    const key = await storeSignatureImage(session, dataUrl)
    expect(key.startsWith(`org/${session.organizationId}/signatures/`)).toBe(true)
    expect(await storage().head(key)).not.toBeNull()
  })

  it('rejects anything that is not a PNG data URL', () => {
    expect(() => decodeSignature('data:image/jpeg;base64,AAAA')).toThrow(/could not be read/i)
    expect(() => decodeSignature('<script>alert(1)</script>')).toThrow(/could not be read/i)
  })
})

describe('storage keys', () => {
  it('namespaces by organization and dates the folder', () => {
    const key = buildStorageKey({
      organizationId: 'org-123',
      folder: 'photos',
      contentType: 'image/jpeg',
    })
    expect(key).toMatch(/^org\/org-123\/photos\/\d{6}\/[0-9a-f-]+\.jpg$/)
  })
})
