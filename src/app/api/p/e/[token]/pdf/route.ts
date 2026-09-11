import { NextResponse } from 'next/server'
import { clientAddress, consumeRateLimit } from '@/lib/rate-limit'
import { resolvePortalToken } from '@/server/portal/service'
import { buildEstimateDocument } from '@/server/documents/build'
import { renderEstimatePdf } from '@/server/documents/pdf/documents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * PDF for a customer link.
 *
 * The document is chosen by the link, never by a parameter, so a valid token
 * for one document cannot be used to render another.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const address = await clientAddress()
  const allowed = await consumeRateLimit('portalToken', `portal:${address}`)
  if (!allowed.ok) return new NextResponse('Too many requests', { status: 429 })

  const { token } = await params
  const link = await resolvePortalToken(token, { countView: false })
  if (!link || link.target !== 'ESTIMATE' || !link.estimateId) {
    return new NextResponse('Not found', { status: 404 })
  }

  const doc = await buildEstimateDocument({
    organizationId: link.organizationId,
    estimateId: link.estimateId,
  })
  if (!doc) return new NextResponse('Not found', { status: 404 })

  const pdf = await renderEstimatePdf(doc)

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${doc.number}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
