import { NextResponse } from 'next/server'
import { storage } from '@/server/storage'
import { verifyLocalUpload, writeLocalObject } from '@/server/storage/local'

/**
 * Receiver for the local development storage driver's "presigned" PUT.
 *
 * The token is an HMAC over the key, content type, size and expiry, so this
 * endpoint accepts exactly the object that was authorized and nothing else —
 * the same guarantee R2's presigned PUT gives in production. Disabled entirely
 * when a real object store is configured.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (storage().name !== 'local') {
    return new NextResponse('Not found', { status: 404 })
  }

  const { token } = await params
  const claim = verifyLocalUpload(token)
  if (!claim) return new NextResponse('Upload link is invalid or expired', { status: 403 })

  const contentType = request.headers.get('content-type')
  if (contentType !== claim.contentType) {
    return new NextResponse('Content type does not match the authorized upload', { status: 400 })
  }

  const body = Buffer.from(await request.arrayBuffer())
  if (body.byteLength !== claim.byteSize) {
    return new NextResponse('Upload size does not match the authorized upload', { status: 400 })
  }

  await writeLocalObject(claim.key, body, claim.contentType)
  return new NextResponse(null, { status: 200 })
}
