import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { storage } from '@/server/storage'
import { readLocalObject } from '@/server/storage/local'

/** Same brokered-read rule as photos: authorize first, then hand back bytes. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params
  const signature = await session.db.signature.findUnique({ where: { id } })
  if (!signature) return new NextResponse('Not found', { status: 404 })

  const driver = storage()

  if (driver.name === 'local') {
    const object = await readLocalObject(signature.imageKey).catch(() => null)
    if (!object) return new NextResponse('Not found', { status: 404 })
    return new NextResponse(new Uint8Array(object.body), {
      headers: { 'Content-Type': object.contentType, 'Cache-Control': 'private, max-age=300' },
    })
  }

  const url = await driver.presignDownload({ key: signature.imageKey, expiresInSeconds: 120 })
  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
