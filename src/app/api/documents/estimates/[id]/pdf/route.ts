import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { buildEstimateDocument } from '@/server/documents/build'
import { renderEstimatePdf } from '@/server/documents/pdf/documents'

/** react-pdf needs Node APIs; it cannot run on the edge. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params

  // Scoped read first: an estimate from another organization does not exist.
  const exists = await session.db.estimate.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return new NextResponse('Not found', { status: 404 })

  const doc = await buildEstimateDocument({
    organizationId: session.organizationId,
    estimateId: id,
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
