import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Alert } from '@/components/ui/alert'
import { Card, CardHeader } from '@/components/ui/card'
import { Chip } from '@/components/ui/status'
import { SubmitButton } from '@/components/ui/submit-button'
import { PackageForm } from '../../package-form'
import { archivePackageAction, restorePackageAction } from '../../actions'

export const metadata: Metadata = { title: 'Edit package' }
export const dynamic = 'force-dynamic'

export default async function EditPackagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string }>
}) {
  const session = await requirePermission('pricebook:write')
  const { id } = await params
  const flags = await searchParams

  const [pkg, catalog] = await Promise.all([
    session.db.priceBookPackage.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            priceBookItem: { select: { id: true, name: true, sku: true, priceCents: true } },
          },
        },
      },
    }),
    session.db.priceBookItem.findMany({
      where: { isActive: true, archivedAt: null },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, sku: true, priceCents: true },
    }),
  ])
  if (!pkg) notFound()

  return (
    <>
      <PageHeader
        title={pkg.name}
        backHref="/settings/price-book?tab=packages"
        action={!pkg.isActive ? <Chip tone="neutral">Archived</Chip> : null}
      />
      <PageBody>
        {flags.created ? <Alert tone="success">Package created.</Alert> : null}

        <PackageForm
          mode="edit"
          defaults={{
            id: pkg.id,
            name: pkg.name,
            description: pkg.description ?? '',
            defaultTier: pkg.defaultTier ?? 'STANDARD',
            isRecommendedDefault: pkg.isRecommendedDefault,
            price: pkg.priceCents !== null ? (pkg.priceCents / 100).toFixed(2) : '',
            lines: pkg.items.map((line) => ({
              priceBookItemId: line.priceBookItem.id,
              name: line.priceBookItem.name,
              sku: line.priceBookItem.sku,
              priceCents: line.priceBookItem.priceCents,
              quantity: Number(line.quantity.toString()),
            })),
          }}
          catalog={catalog}
          currency={session.currency}
        />

        <Card>
          <CardHeader title="Manage" />
          {pkg.isActive ? (
            <form action={archivePackageAction}>
              <input type="hidden" name="packageId" value={pkg.id} />
              <SubmitButton
                variant="secondary"
                fullWidth
                className="text-danger-600"
                pendingLabel="Archiving…"
              >
                Archive this package
              </SubmitButton>
            </form>
          ) : (
            <form action={restorePackageAction}>
              <input type="hidden" name="packageId" value={pkg.id} />
              <SubmitButton variant="secondary" fullWidth pendingLabel="Restoring…">
                Restore this package
              </SubmitButton>
            </form>
          )}
          <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
            Archiving hides the package from the estimate builder. Estimates already built from
            it keep their lines and prices.
          </p>
        </Card>
      </PageBody>
    </>
  )
}
