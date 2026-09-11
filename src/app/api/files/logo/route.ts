import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { storage } from '@/server/storage'
import { readLocalObject } from '@/server/storage/local'

/** The company's own logo, readable only by its own signed-in members. */
export async function GET() {
  const session = await getSession()
  if (!session) return new NextResponse('Unauthorized', { status: 401 })

  const organization = await session.db.organization.findUniqueOrThrow({
    where: { id: session.organizationId },
    select: { logoStorageKey: true },
  })
  if (!organization.logoStorageKey) return new NextResponse('Not found', { status: 404 })

  const driver = storage()

  if (driver.name === 'local') {
    const object = await readLocalObject(organization.logoStorageKey).catch(() => null)
    if (!object) return new NextResponse('Not found', { status: 404 })
    return new NextResponse(new Uint8Array(object.body), {
      headers: { 'Content-Type': object.contentType, 'Cache-Control': 'private, max-age=300' },
    })
  }

  const url = await driver.presignDownload({
    key: organization.logoStorageKey,
    expiresInSeconds: 120,
  })
  return NextResponse.redirect(url, { status: 302 })
}
