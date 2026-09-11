import type { Metadata } from 'next'
import { requirePermission } from '@/lib/session'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { BLANK_ITEM, ItemForm } from '../item-form'

export const metadata: Metadata = { title: 'New price book item' }
export const dynamic = 'force-dynamic'

export default async function NewPriceBookItemPage() {
  await requirePermission('pricebook:write')
  return (
    <>
      <PageHeader title="New Item" backHref="/settings/price-book" />
      <PageBody>
        <ItemForm mode="create" defaults={BLANK_ITEM} />
      </PageBody>
    </>
  )
}
