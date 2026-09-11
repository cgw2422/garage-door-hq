import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { resolveReadablePhoto } from '@/server/media/photos'
import { storage } from '@/server/storage'
import { readLocalObject } from '@/server/storage/local'

/**
 * The only way to read a photo.
 *
 * Authorization happens here — session, then tenant-scoped lookup — before any
 * URL to the bytes exists. For R2 we redirect to a short-lived presigned GET;
 * for the local driver we stream the file. Either way there is no durable,
 * guessable link to a customer's garage.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params
  const photo = await resolveReadablePhoto(session, id)
  if (!photo) return new NextResponse('Not found', { status: 404 })

  const driver = storage()

  if (driver.name === 'local') {
    const object = await readLocalObject(photo.storageKey).catch(() => null)
    if (!object) return new NextResponse('Not found', { status: 404 })
    return new NextResponse(new Uint8Array(object.body), {
      headers: {
        'Content-Type': object.contentType,
        // Private: a shared cache must never hold another tenant's photo.
        'Cache-Control': 'private, max-age=300',
      },
    })
  }

  const url = await driver.presignDownload({ key: photo.storageKey, expiresInSeconds: 120 })
  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
