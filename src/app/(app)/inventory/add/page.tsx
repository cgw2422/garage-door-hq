import type { Metadata } from 'next'
import { requirePermission } from '@/lib/session'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Alert } from '@/components/ui/alert'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AddStockedItemForm } from './form'

export const metadata: Metadata = { title: 'Stock an item' }
export const dynamic = 'force-dynamic'

export default async function AddStockedItemPage({
  searchParams,
}: {
  searchParams: Promise<{ itemId?: string; location?: string }>
}) {
  const session = await requirePermission('inventory:adjust')
  const params = await searchParams

  const [catalog, locations] = await Promise.all([
    session.db.priceBookItem.findMany({
      where: { isActive: true, archivedAt: null, trackInventory: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, sku: true },
    }),
    session.db.inventoryLocation.findMany({
      where: { isActive: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
  ])

  return (
    <>
      <PageHeader title="Stock an Item" backHref="/inventory" />
      <PageBody>
        {catalog.length === 0 ? (
          <Card>
            <Alert tone="warning" title="Nothing to stock yet">
              Only price book items set to track inventory can be stocked. Add one first.
            </Alert>
            <ButtonLink href="/settings/price-book/new" className="mt-3" fullWidth>
              Add a price book item
            </ButtonLink>
          </Card>
        ) : (
          <AddStockedItemForm
            catalog={catalog}
            locations={locations}
            defaultItemId={params.itemId}
            defaultLocationId={params.location ?? session.defaultLocationId ?? undefined}
          />
        )}
      </PageBody>
    </>
  )
}
