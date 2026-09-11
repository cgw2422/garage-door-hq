import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { buildInvoiceDocument } from '@/server/documents/build'
import { renderInvoicePdf } from '@/server/documents/pdf/documents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params

  const exists = await session.db.invoice.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return new NextResponse('Not found', { status: 404 })

  const doc = await buildInvoiceDocument({
    organizationId: session.organizationId,
    invoiceId: id,
  })
  if (!doc) return new NextResponse('Not found', { status: 404 })

  const pdf = await renderInvoicePdf(doc)

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${doc.number}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
