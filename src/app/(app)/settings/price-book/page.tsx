import type { Metadata } from 'next'
import type { PriceBookCategory } from '@prisma/client'
import { requirePermission } from '@/lib/session'
import { formatCents } from '@/lib/money'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Alert } from '@/components/ui/alert'
import { Card, Divider, ListRow, SectionHeading } from '@/components/ui/card'
import { Chip } from '@/components/ui/status'

export const metadata: Metadata = { title: 'Price Book' }
export const dynamic = 'force-dynamic'

const LABELS: Partial<Record<PriceBookCategory, string>> = {
  SPRINGS: 'Springs',
  ROLLERS: 'Rollers',
  CABLES: 'Cables',
  DRUMS: 'Drums',
  BEARINGS: 'Bearings',
  SHAFTS: 'Shafts',
  HINGES: 'Hinges',
  OPENERS: 'Openers',
  REMOTES: 'Remotes',
  KEYPADS: 'Keypads',
  PHOTO_EYES: 'Photo Eyes',
  WALL_CONTROLS: 'Wall Controls',
  WEATHER_SEAL: 'Weather Seal',
  LABOR: 'Labor',
  SERVICE_CALL: 'Service Calls',
  MISCELLANEOUS: 'Other',
}

export default async function PriceBookPage() {
  const session = await requirePermission('pricebook:write')

  const [items, packages] = await Promise.all([
    session.db.priceBookItem.findMany({
      where: { archivedAt: null },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),
    session.db.priceBookPackage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { items: { include: { priceBookItem: { select: { name: true, priceCents: true } } } } },
    }),
  ])

  const byCategory = new Map<PriceBookCategory, typeof items>()
  for (const item of items) {
    const bucket = byCategory.get(item.category) ?? []
    bucket.push(item)
    byCategory.set(item.category, bucket)
  }

  return (
    <>
      <PageHeader
        title="Price Book"
        subtitle={`${items.length} items · ${packages.length} packages`}
        backHref="/settings"
      />
      <PageBody>
        <Alert tone="warning" title="These are suggested prices">
          Your account started with a garage-door starter catalog so estimates worked on day one.
          Editing prices in the app is not built yet — Phase 1b — so treat these as placeholders
          and adjust before quoting real work.
        </Alert>

        <div>
          <SectionHeading>Packages</SectionHeading>
          <Card padded={false}>
            {packages.map((pkg, index) => {
              const total =
                pkg.priceCents ??
                pkg.items.reduce(
                  (sum, line) =>
                    sum + Math.round(Number(line.quantity.toString()) * line.priceBookItem.priceCents),
                  0,
                )
              return (
                <div key={pkg.id}>
                  {index > 0 ? <Divider className="ml-4" /> : null}
                  <ListRow
                    title={pkg.name}
                    subtitle={pkg.items.map((line) => line.priceBookItem.name).join(' · ')}
                    trailing={
                      <div className="flex flex-col items-end gap-1">
                        <span className="num text-[0.9375rem] font-bold text-ink">
                          {formatCents(total, { currency: session.currency, showCents: false })}
                        </span>
                        {pkg.defaultTier && pkg.defaultTier !== 'STANDARD' ? (
                          <Chip tone="brand">{pkg.defaultTier.toLowerCase()}</Chip>
                        ) : null}
                      </div>
                    }
                  />
                </div>
              )
            })}
          </Card>
        </div>

        {[...byCategory.entries()].map(([category, categoryItems]) => (
          <div key={category}>
            <SectionHeading>{LABELS[category] ?? category}</SectionHeading>
            <Card padded={false}>
              {categoryItems.map((item, index) => (
                <div key={item.id}>
                  {index > 0 ? <Divider className="ml-4" /> : null}
                  <ListRow
                    title={item.name}
                    subtitle={[item.sku, item.trackInventory ? 'tracked' : null]
                      .filter(Boolean)
                      .join(' · ')}
                    trailing={
                      <span className="num text-[0.9375rem] font-bold text-ink">
                        {formatCents(item.priceCents, { currency: session.currency, showCents: false })}
                      </span>
                    }
                  />
                </div>
              ))}
            </Card>
          </div>
        ))}
      </PageBody>
    </>
  )
}
