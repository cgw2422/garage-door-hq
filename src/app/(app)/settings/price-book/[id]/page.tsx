import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { formatCents } from '@/lib/money'
import { formatSpringSize, formatWind } from '@/lib/measure'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Alert } from '@/components/ui/alert'
import { Card, CardHeader, Divider } from '@/components/ui/card'
import { Chip } from '@/components/ui/status'
import { DataGrid, DataPoint } from '@/components/ui/stat'
import { PhotoCapture } from '@/components/app/photo-capture'
import { PhotoGrid } from '@/components/app/photo-grid'
import { ItemForm } from '../item-form'
import { ItemActions } from './item-actions'

export const metadata: Metadata = { title: 'Edit price book item' }
export const dynamic = 'force-dynamic'

export default async function EditPriceBookItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string; duplicated?: string }>
}) {
  const session = await requirePermission('pricebook:write')
  const { id } = await params
  const flags = await searchParams

  const item = await session.db.priceBookItem.findUnique({
    where: { id },
    include: {
      springSpec: true,
      photos: { where: { uploadStatus: 'READY' }, orderBy: { createdAt: 'desc' } },
      stockLevels: { include: { location: { select: { name: true } } } },
      _count: { select: { estimateItems: true, invoiceItems: true, packageItems: true } },
    },
  })
  if (!item) notFound()

  const onHand = item.stockLevels.reduce(
    (sum, level) => sum + Number(level.quantity.toString()),
    0,
  )

  return (
    <>
      <PageHeader
        title={item.name}
        subtitle={item.sku ?? undefined}
        backHref="/settings/price-book"
        action={item.archivedAt ? <Chip tone="neutral">Archived</Chip> : null}
      />
      <PageBody>
        {flags.created ? <Alert tone="success">Item added to your price book.</Alert> : null}
        {flags.duplicated ? (
          <Alert tone="success">
            Copied. Update the name, SKU and pricing, then save.
          </Alert>
        ) : null}

        {item.archivedAt ? (
          <Alert tone="warning" title="This item is archived">
            It stays on past estimates, invoices and inventory history, but cannot be added to
            new work until you restore it.
          </Alert>
        ) : null}

        <ItemForm
          mode="edit"
          defaults={{
            id: item.id,
            name: item.name,
            category: item.category,
            description: item.description ?? '',
            sku: item.sku ?? '',
            cost: (item.costCents / 100).toFixed(2),
            price: (item.priceCents / 100).toFixed(2),
            unit: item.unit,
            supplier: item.supplier ?? '',
            supplierPartNo: item.supplierPartNo ?? '',
            taxable: item.taxable,
            trackInventory: item.trackInventory,
          }}
        />

        {item.springSpec ? (
          <Card>
            <CardHeader title="Spring Specification" />
            <p className="mb-3 -mt-1 text-sm text-ink-muted">
              What the Spring Calculator matches on. Edit it in the database for now — changing
              these would silently change what this SKU matches.
            </p>
            <DataGrid>
              <DataPoint
                label="Size"
                value={formatSpringSize(
                  item.springSpec.wireSizeInches,
                  item.springSpec.insideDiameterInches,
                  item.springSpec.lengthInches,
                )}
              />
              <DataPoint label="Wind" value={formatWind(item.springSpec.wind)} />
              <DataPoint
                label="Cycles"
                value={item.springSpec.cycleRating?.toLocaleString('en-US') ?? '—'}
              />
              <DataPoint label="Colour" value={item.springSpec.colorCode ?? '—'} />
            </DataGrid>
          </Card>
        ) : null}

        <Card padded={false}>
          <div className="px-4 pt-4">
            <CardHeader title="Photo" />
          </div>
          {item.photos.length > 0 ? <PhotoGrid photos={item.photos} /> : null}
          <div className="p-4 pt-0">
            <PhotoCapture
              kind="EQUIPMENT"
              label={item.photos.length > 0 ? 'Replace photo' : 'Add a photo'}
              target={{ priceBookItemId: item.id }}
              revalidate={`/settings/price-book/${item.id}`}
              allowLibrary
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Where this is used" />
          <DataGrid cols={3}>
            <DataPoint label="Estimates" value={String(item._count.estimateItems)} />
            <DataPoint label="Invoices" value={String(item._count.invoiceItems)} />
            <DataPoint label="Packages" value={String(item._count.packageItems)} />
          </DataGrid>
          {item.trackInventory ? (
            <>
              <Divider className="my-3" />
              <p className="text-sm text-ink-muted">
                <span className="num font-semibold text-ink">{onHand}</span> on hand across{' '}
                {item.stockLevels.length} location{item.stockLevels.length === 1 ? '' : 's'}
                {item.stockLevels.length > 0
                  ? ` — ${item.stockLevels
                      .map(
                        (level) =>
                          `${level.location.name}: ${Number(level.quantity.toString())}`,
                      )
                      .join(', ')}`
                  : ''}
                .
              </p>
            </>
          ) : null}
          <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
            Changing the price here affects new estimates only. Documents already created keep
            the price they were built with, and signed estimates cannot change at all.
          </p>
        </Card>

        <ItemActions itemId={item.id} isArchived={item.archivedAt !== null} />

        <p className="px-1 text-center text-xs text-ink-subtle">
          Cost {formatCents(item.costCents, { currency: session.currency })} · Price{' '}
          {formatCents(item.priceCents, { currency: session.currency })}
        </p>
      </PageBody>
    </>
  )
}
