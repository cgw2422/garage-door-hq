import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { NewDoorForm } from './form'

export const metadata: Metadata = { title: 'New door' }
export const dynamic = 'force-dynamic'

export default async function NewDoorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('door:write')
  const { id } = await params

  const property = await session.db.property.findUnique({
    where: { id },
    select: {
      id: true,
      nickname: true,
      line1: true,
      city: true,
      kind: true,
      _count: { select: { doors: true } },
    },
  })
  if (!property) notFound()

  return (
    <>
      <PageHeader
        title="New Door Passport"
        subtitle={property.nickname ?? `${property.line1}, ${property.city}`}
        backHref={`/properties/${property.id}`}
      />
      <PageBody>
        <NewDoorForm
          propertyId={property.id}
          isCommercial={property.kind === 'COMMERCIAL'}
          existingDoorCount={property._count.doors}
        />
      </PageBody>
    </>
  )
}
