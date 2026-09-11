import type { Metadata } from 'next'
import { requirePermission } from '@/lib/session'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { BLANK_PACKAGE, PackageForm } from '../../package-form'

export const metadata: Metadata = { title: 'New package' }
export const dynamic = 'force-dynamic'

export default async function NewPackagePage() {
  const session = await requirePermission('pricebook:write')

  const catalog = await session.db.priceBookItem.findMany({
    where: { isActive: true, archivedAt: null },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, sku: true, priceCents: true },
  })

  return (
    <>
      <PageHeader title="New Package" backHref="/settings/price-book?tab=packages" />
      <PageBody>
        <PackageForm
          mode="create"
          defaults={BLANK_PACKAGE}
          catalog={catalog}
          currency={session.currency}
        />
      </PageBody>
    </>
  )
}
