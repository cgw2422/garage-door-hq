import type { Metadata } from 'next'
import type { PriceBookCategory } from '@prisma/client'
import { requireSession } from '@/lib/session'
import { formatCents } from '@/lib/money'
import { formatDate } from '@/server/jobs/queries'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { ButtonLink } from '@/components/ui/button'
import { Card, Divider, EmptyState, ListRow, SectionHeading } from '@/components/ui/card'
import { Chip, stockTone } from '@/components/ui/status'
import { BoxIcon, PlusIcon } from '@/components/ui/icons'
import { InventorySearch, InventoryTabs, type InventoryTab } from './tabs'

export const metadata: Metadata = { title: 'Inventory' }
export const dynamic = 'force-dynamic'

const CATEGORY_LABELS: Partial<Record<PriceBookCategory, string>> = {
  SPRINGS: 'Springs',
  ROLLERS: 'Rollers',
  CABLES: 'Cables',
  DRUMS: 'Drums',
  BEARINGS: 'Bearings',
  HINGES: 'Hinges',
  SHAFTS: 'Shafts',
  OPENERS: 'Openers',
  REMOTES: 'Remotes',
  KEYPADS: 'Keypads',
  PHOTO_EYES: 'Photo Eyes',
  WALL_CONTROLS: 'Wall Controls',
  WEATHER_SEAL: 'Weather Seal',
  PANELS: 'Panels',
  HARDWARE: 'Hardware',
  MISCELLANEOUS: 'Other Parts',
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; location?: string; q?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams
  const tab: InventoryTab = ['usage', 'restock'].includes(params.tab ?? '')
    ? (params.tab as InventoryTab)
    : 'stock'

  const locations = await session.db.inventoryLocation.findMany({
    where: { isActive: true },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  })

  // Solo mode: never ask which truck. Default to the technician's own.
  const activeLocationId =
    params.location ?? session.defaultLocationId ?? locations[0]?.id ?? null

  const activeLocation = locations.find((l) => l.id === activeLocationId) ?? null

  if (!activeLocation) {
    return (
      <>
        <PageHeader title="Inventory" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<BoxIcon />}
              title="No inventory location yet"
              body="Add your truck and the parts you carry, and every job will draw from it."
              action={
                <ButtonLink href="/settings/inventory/locations/new" size="sm">
                  Add a location
                </ButtonLink>
              }
            />
          </Card>
        </PageBody>
      </>
    )
  }

  const [levels, recentTxns] = await Promise.all([
    session.db.stockLevel.findMany({
      where: { locationId: activeLocation.id },
      include: { priceBookItem: { include: { springSpec: true } } },
    }),
    tab === 'usage'
      ? session.db.inventoryTransaction.findMany({
          where: {
            OR: [{ fromLocationId: activeLocation.id }, { toLocationId: activeLocation.id }],
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { priceBookItem: { select: { name: true } }, job: { select: { number: true } } },
        })
      : Promise.resolve([]),
  ])

  const query = (params.q ?? '').trim().toLowerCase()
  const visible = levels
    .filter((level) => level.priceBookItem.isActive)
    .filter((level) =>
      query
        ? [level.priceBookItem.name, level.priceBookItem.sku, level.binLocation]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(query))
        : true,
    )

  const byCategory = new Map<PriceBookCategory, typeof visible>()
  for (const level of visible) {
    const key = level.priceBookItem.category
    const bucket = byCategory.get(key) ?? []
    bucket.push(level)
    byCategory.set(key, bucket)
  }

  const lowStock = visible.filter(
    (level) => level.minQuantity.greaterThan(0) && level.quantity.lessThanOrEqualTo(level.minQuantity),
  )

  const totalValueCents = visible.reduce(
    (sum, level) => sum + Number(level.quantity.toString()) * level.priceBookItem.costCents,
    0,
  )

  return (
    <>
      <PageHeader
        title={activeLocation.name}
        subtitle={`${visible.length} parts · ${formatCents(totalValueCents, { currency: session.currency, showCents: false })} at cost`}
        action={
          <ButtonLink
            href={`/inventory/add?location=${activeLocation.id}`}
            size="sm"
            icon={<PlusIcon />}
          >
            Add
          </ButtonLink>
        }
      />
      <PageBody>
        <InventoryTabs value={tab} locationId={activeLocation.id} />

        {tab === 'stock' ? (
          <InventorySearch
            initialQuery={params.q ?? ''}
            locationId={activeLocation.id}
          />
        ) : null}

        {tab === 'stock' ? (
          visible.length === 0 ? (
            <Card>
              <EmptyState
                icon={<BoxIcon />}
                title="Nothing stocked here yet"
                body="Add the parts you carry and jobs will deduct from this location automatically."
              />
            </Card>
          ) : (
            [...byCategory.entries()].map(([category, rows]) => (
              <div key={category}>
                <SectionHeading>{CATEGORY_LABELS[category] ?? category}</SectionHeading>
                <Card padded={false}>
                  {rows
                    .sort((a, b) => a.priceBookItem.name.localeCompare(b.priceBookItem.name))
                    .map((level, index) => {
                      const quantity = Number(level.quantity.toString())
                      const minQuantity = Number(level.minQuantity.toString())
                      return (
                        <div key={level.id}>
                          {index > 0 ? <Divider className="ml-4" /> : null}
                          <ListRow
                            href={`/inventory/items/${level.priceBookItemId}`}
                            title={level.priceBookItem.name}
                            subtitle={
                              level.priceBookItem.sku
                                ? `SKU ${level.priceBookItem.sku}${level.binLocation ? ` · Bin ${level.binLocation}` : ''}`
                                : level.binLocation
                                  ? `Bin ${level.binLocation}`
                                  : undefined
                            }
                            trailing={
                              <Chip tone={stockTone(quantity, minQuantity)}>
                                <span className="num">{quantity}</span>
                              </Chip>
                            }
                          />
                        </div>
                      )
                    })}
                </Card>
              </div>
            ))
          )
        ) : null}

        {tab === 'restock' ? (
          <Card padded={false}>
            {lowStock.length === 0 ? (
              <EmptyState
                title="Nothing needs restocking"
                body="Parts drop into this list once they hit their minimum."
              />
            ) : (
              lowStock.map((level, index) => {
                const quantity = Number(level.quantity.toString())
                const minQuantity = Number(level.minQuantity.toString())
                return (
                  <div key={level.id}>
                    {index > 0 ? <Divider className="ml-4" /> : null}
                    <ListRow
                      href={`/inventory/items/${level.priceBookItemId}`}
                      title={level.priceBookItem.name}
                      subtitle={`Minimum ${minQuantity} · short by ${Math.max(minQuantity - quantity, 0)}`}
                      trailing={
                        <Chip tone={stockTone(quantity, minQuantity)}>
                          <span className="num">{quantity} left</span>
                        </Chip>
                      }
                    />
                  </div>
                )
              })
            )}
          </Card>
        ) : null}

        {tab === 'usage' ? (
          <Card padded={false}>
            {recentTxns.length === 0 ? (
              <EmptyState title="No movement yet" body="Receipts, transfers and job usage show up here." />
            ) : (
              recentTxns.map((txn, index) => {
                const outbound = txn.fromLocationId === activeLocation.id
                return (
                  <div key={txn.id}>
                    {index > 0 ? <Divider className="ml-4" /> : null}
                    <ListRow
                      title={txn.priceBookItem.name}
                      subtitle={`${txn.kind.toLowerCase()}${txn.job ? ` · Job #${txn.job.number}` : ''} · ${formatDate(txn.createdAt, session.timezone)}`}
                      trailing={
                        <span
                          className={`num text-[0.9375rem] font-bold ${outbound ? 'text-danger-600' : 'text-success-600'}`}
                        >
                          {outbound ? '−' : '+'}
                          {Number(txn.quantity.toString())}
                        </span>
                      }
                    />
                  </div>
                )
              })
            )}
          </Card>
        ) : null}

        {locations.length > 1 ? (
          <div>
            <SectionHeading>Other Locations</SectionHeading>
            <Card padded={false}>
              {locations
                .filter((location) => location.id !== activeLocation.id)
                .map((location, index) => (
                  <div key={location.id}>
                    {index > 0 ? <Divider className="ml-4" /> : null}
                    <ListRow
                      href={`/inventory?location=${location.id}&tab=${tab}`}
                      title={location.name}
                      subtitle={location.kind.toLowerCase()}
                    />
                  </div>
                ))}
            </Card>
          </div>
        ) : null}
      </PageBody>
    </>
  )
}
