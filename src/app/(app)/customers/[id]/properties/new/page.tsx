import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { NewPropertyForm } from './form'

export const metadata: Metadata = { title: 'New property' }
export const dynamic = 'force-dynamic'

export default async function NewPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requirePermission('customer:write')
  const { id } = await params

  const customer = await session.db.customer.findUnique({
    where: { id },
    select: { id: true, firstName: true, lastName: true, companyName: true },
  })
  if (!customer) notFound()

  return (
    <>
      <PageHeader
        title="New Property"
        subtitle={customer.companyName ?? `${customer.firstName} ${customer.lastName}`}
        backHref={`/customers/${customer.id}`}
      />
      <PageBody>
        <NewPropertyForm customerId={customer.id} />
      </PageBody>
    </>
  )
}
