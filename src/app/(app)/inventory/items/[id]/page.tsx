import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { formatCents } from '@/lib/money'
import { formatDate } from '@/server/jobs/queries'
import { formatSpringSize, formatWind } from '@/lib/measure'
import { loadItemInventory, usageSince } from '@/server/inventory/management'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Alert } from '@/components/ui/alert'
import { ButtonLink } from '@/components/ui/button'
import { Card, Divider, EmptyState, SectionHeading } from '@/components/ui/card'
import { Chip, stockTone } from '@/components/ui/status'
import { DataGrid, DataPoint } from '@/components/ui/stat'
import { ItemStockPanel } from './stock-panel'

export const metadata: Metadata = { title: 'Inventory item' }
export const dynamic = 'force-dynamic'

export default async function InventoryItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ adjusted?: string; transferred?: string; stocked?: string }>
}) {
  const session = await requirePermission('inventory:read')
  const { id } = await params
  const flags = await searchParams

  const loaded = await loadItemInventory(session, id)
  if (!loaded) notFound()

  const { item, transactions } = loaded
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const used30 = await usageSince(session, { priceBookItemId: id, since: thirtyDaysAgo })

  const locations = await session.db.inventoryLocation.findMany({
    where: { isActive: true },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  })

  const totalOnHand = item.stockLevels.reduce(
    (sum, level) => sum + Number(level.quantity.toString()),
    0,
  )

  return (
    <>
      <PageHeader
        title={item.name}
        subtitle={item.sku ?? undefined}
        backHref="/inventory"
        action={
          <Chip tone={totalOnHand > 0 ? 'success' : 'danger'}>
            <span className="num">{totalOnHand}</span>
          </Chip>
        }
      />
      <PageBody>
        {flags.adjusted ? <Alert tone="success">Inventory adjusted.</Alert> : null}
        {flags.transferred ? <Alert tone="success">Stock transferred.</Alert> : null}
        {flags.stocked ? <Alert tone="success">Now tracked at that location.</Alert> : null}

        {!item.trackInventory ? (
          <Alert tone="warning" title="This item is not inventory tracked">
            Turn tracking on in the price book if it should come off the truck when used.
          </Alert>
        ) : null}

        <Card>
          <DataGrid>
            <DataPoint label="Sell price" value={formatCents(item.priceCents, { currency: session.currency })} />
            <DataPoint label="Your cost" value={formatCents(item.costCents, { currency: session.currency })} />
            <DataPoint label="Used in 30 days" value={<span className="num">{used30}</span>} />
            <DataPoint label="Supplier" value={item.supplier ?? '—'} />
          </DataGrid>

          {item.springSpec ? (
            <>
              <Divider className="my-3" />
              <p className="num text-sm text-ink">
                {formatSpringSize(
                  item.springSpec.wireSizeInches,
                  item.springSpec.insideDiameterInches,
                  item.springSpec.lengthInches,
                )}{' '}
                · {formatWind(item.springSpec.wind)}
                {item.springSpec.cycleRating
                  ? ` · ${item.springSpec.cycleRating.toLocaleString('en-US')} cycles`
                  : ''}
              </p>
            </>
          ) : null}
        </Card>

        <div>
          <SectionHeading>Stock by location</SectionHeading>
          {item.stockLevels.length === 0 ? (
            <Card>
              <EmptyState
                title="Not stocked anywhere yet"
                body="Add it to a truck or the warehouse to start tracking it."
                action={
                  <ButtonLink href={`/inventory/add?itemId=${item.id}`} size="sm">
                    Stock this item
                  </ButtonLink>
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {item.stockLevels.map((level) => (
                <ItemStockPanel
                  key={level.id}
                  priceBookItemId={item.id}
                  locationId={level.locationId}
                  locationName={level.location.name}
                  quantity={Number(level.quantity.toString())}
                  minQuantity={Number(level.minQuantity.toString())}
                  binLocation={level.binLocation}
                  tone={stockTone(
                    Number(level.quantity.toString()),
                    Number(level.minQuantity.toString()),
                  )}
                  otherLocations={locations.filter(
                    (location) => location.id !== level.locationId,
                  )}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionHeading>Transaction History</SectionHeading>
          <Card padded={false}>
            {transactions.length === 0 ? (
              <EmptyState title="No movement yet" />
            ) : (
              transactions.map((txn, index) => {
                const quantity = Number(txn.quantity.toString())
                const inbound = Boolean(txn.toLocationId)
                const outbound = Boolean(txn.fromLocationId)
                const isTransfer = inbound && outbound

                return (
                  <div key={txn.id}>
                    {index > 0 ? <Divider className="ml-4" /> : null}
                    <div className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[0.9375rem] font-medium text-ink">
                          {txn.reason ?? txn.kind.toLowerCase()}
                        </p>
                        <p className="text-sm text-ink-muted">
                          {isTransfer
                            ? `${txn.fromLocation?.name} → ${txn.toLocation?.name}`
                            : inbound
                              ? `into ${txn.toLocation?.name}`
                              : `out of ${txn.fromLocation?.name}`}
                        </p>
                        <p className="num text-xs text-ink-subtle">
                          {formatDate(txn.createdAt, session.timezone)}
                          {txn.actor ? ` · ${txn.actor.firstName}` : ''}
                          {txn.job ? ` · Job #${txn.job.number}` : ''}
                        </p>
                      </div>
                      <span
                        className={`num shrink-0 text-[0.9375rem] font-bold ${
                          isTransfer
                            ? 'text-ink'
                            : inbound
                              ? 'text-success-600'
                              : 'text-danger-600'
                        }`}
                      >
                        {isTransfer ? '' : inbound ? '+' : '−'}
                        {quantity}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </Card>
          <p className="mt-2 px-1 text-xs leading-relaxed text-ink-subtle">
            Every quantity here came from a transaction. Nothing in the app writes a count
            directly, so this history always adds up to what is on the shelf.
          </p>
        </div>
      </PageBody>
    </>
  )
}
