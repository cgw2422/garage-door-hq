import type { Metadata } from 'next'
import { requirePermission } from '@/lib/session'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { NewCustomerForm } from './form'

export const metadata: Metadata = { title: 'New customer' }
export const dynamic = 'force-dynamic'

export default async function NewCustomerPage() {
  await requirePermission('customer:write')
  return (
    <>
      <PageHeader title="New Customer" backHref="/customers" />
      <PageBody>
        <NewCustomerForm />
      </PageBody>
    </>
  )
}
