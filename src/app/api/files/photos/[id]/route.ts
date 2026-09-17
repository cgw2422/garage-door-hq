import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { resolveReadablePhoto } from '@/server/media/photos'
import { currentPresentation, presentablePhoto } from '@/server/presentations/service'
import { storage } from '@/server/storage'
import { readLocalObject } from '@/server/storage/local'

/**
 * The only way to read a photo.
 *
 * Authorization happens here — identity, then a scoped lookup — before any URL
 * to the bytes exists. For R2 we redirect to a short-lived presigned GET; for
 * the local driver we stream the file. Either way there is no durable,
 * guessable link to a customer's garage.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  /*
   * Two ways to be allowed to see a photograph of somebody's garage.
   *
   * Normally: signed in, and the photo is this organization's. During a
   * presentation the technician's session is suspended, so the second way
   * exists — and it is deliberately narrower than the first. A presentation
   * may serve only the photos hanging off the findings of the estimate it is
   * presenting, so the customer holding the phone cannot turn this route into
   * a gallery of the company's other jobs.
   */
  const presentation = await currentPresentation()
  if (presentation) {
    const photo = await presentablePhoto(presentation, id)
    if (!photo) return new NextResponse('Not found', { status: 404 })
    return serve(photo)
  }

  const session = await getSession()
  if (!session) return new NextResponse('Unauthorized', { status: 401 })

  const photo = await resolveReadablePhoto(session, id)
  if (!photo) return new NextResponse('Not found', { status: 404 })
  return serve(photo)
}

/** Hand back the bytes, however this deployment stores them. */
async function serve(photo: { storageKey: string; contentType: string | null }) {
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
