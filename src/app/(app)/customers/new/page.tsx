import type { Metadata } from 'next'
import { getAccessState, requirePermission } from '@/lib/session'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { RestrictedNotice } from '@/components/app/billing-banner'
import { NewCustomerForm } from './form'

export const metadata: Metadata = { title: 'New customer' }
export const dynamic = 'force-dynamic'

export default async function NewCustomerPage() {
  await requirePermission('customer:write')
  const access = await getAccessState()
  return (
    <>
      <PageHeader title="New Customer" backHref="/customers" />
      <PageBody>
        <RestrictedNotice access={access} />

        <NewCustomerForm />
      </PageBody>
    </>
  )
}
