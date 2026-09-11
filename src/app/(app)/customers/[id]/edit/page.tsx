import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { roleCan } from '@/lib/rbac'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { EditCustomerForm } from './form'

export const metadata: Metadata = { title: 'Edit customer' }
export const dynamic = 'force-dynamic'

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requirePermission('customer:write')
  const { id } = await params

  const customer = await session.db.customer.findUnique({ where: { id } })
  if (!customer) notFound()

  return (
    <>
      <PageHeader
        title="Edit Customer"
        subtitle={customer.companyName ?? `${customer.firstName} ${customer.lastName}`}
        backHref={`/customers/${customer.id}`}
      />
      <PageBody>
        <EditCustomerForm
          customer={{
            id: customer.id,
            firstName: customer.firstName,
            lastName: customer.lastName,
            companyName: customer.companyName ?? '',
            phone: customer.phone ?? '',
            altPhone: customer.altPhone ?? '',
            email: customer.email ?? '',
            notesSummary: customer.notesSummary ?? '',
            isArchived: customer.archivedAt !== null,
          }}
          canArchive={roleCan(session.role, 'customer:archive')}
        />
      </PageBody>
    </>
  )
}
