import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { roleCan } from '@/lib/rbac'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { EditPropertyForm } from './form'

export const metadata: Metadata = { title: 'Edit property' }
export const dynamic = 'force-dynamic'

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requirePermission('customer:write')
  const { id } = await params

  const property = await session.db.property.findUnique({ where: { id } })
  if (!property) notFound()

  return (
    <>
      <PageHeader
        title="Edit Property"
        subtitle={property.nickname ?? property.line1}
        backHref={`/properties/${property.id}`}
      />
      <PageBody>
        <EditPropertyForm
          property={{
            id: property.id,
            customerId: property.customerId,
            nickname: property.nickname ?? '',
            line1: property.line1,
            line2: property.line2 ?? '',
            city: property.city,
            state: property.state,
            postalCode: property.postalCode,
            kind: property.kind,
            accessInstructions: property.accessInstructions ?? '',
            gateInfo: property.gateInfo ?? '',
            isArchived: property.archivedAt !== null,
          }}
          canArchive={roleCan(session.role, 'customer:archive')}
        />
      </PageBody>
    </>
  )
}
