import type { Metadata } from 'next'
import Link from 'next/link'
import type { PriceBookCategory } from '@prisma/client'
import { requirePermission } from '@/lib/session'
import { roleCan } from '@/lib/rbac'
import { formatCents } from '@/lib/money'
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  listItems,
  listPackages,
  packageTotalCents,
} from '@/server/pricebook/service'
import { hasSetOwnPrices } from '@/server/organizations/setup-checklist'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Alert } from '@/components/ui/alert'
import { ButtonLink } from '@/components/ui/button'
import { Card, Divider, EmptyState, ListRow, SectionHeading } from '@/components/ui/card'
import { Chip } from '@/components/ui/status'
import { BoxIcon, PlusIcon } from '@/components/ui/icons'
import { PriceBookFilters, PriceBookTabs } from './filters'

export const metadata: Metadata = { title: 'Price Book' }
export const dynamic = 'force-dynamic'

export default async function PriceBookPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string
    q?: string
    category?: string
    archived?: string
  }>
}) {
  const session = await requirePermission('pricebook:read')
  const params = await searchParams
  const tab = params.tab === 'packages' ? 'packages' : 'items'
  const canWrite = roleCan(session.role, 'pricebook:write')

  const category = CATEGORY_ORDER.includes(params.category as PriceBookCategory)
    ? (params.category as PriceBookCategory)
    : null
  const showArchived = params.archived === 'show'

  const [items, packages, ownPrices] = await Promise.all([
    listItems(session, { search: params.q, category, includeArchived: showArchived }),
    tab === 'packages' ? listPackages(session) : Promise.resolve([]),
    // The placeholder warning is true of a catalog nobody has touched, and
    // wrong — insulting, even — on a company's own considered prices.
    hasSetOwnPrices(session),
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
        subtitle={`${items.length} items`}
        backHref="/settings"
        action={
          canWrite ? (
            <ButtonLink
              href={
                tab === 'packages'
                  ? '/settings/price-book/packages/new'
                  : '/settings/price-book/new'
              }
              size="sm"
              icon={<PlusIcon />}
            >
              New
            </ButtonLink>
          ) : null
        }
      />
      <PageBody>
        {ownPrices ? null : (
          <Alert tone="info" title="Starter prices are examples, not recommendations">
            Your account began with a garage-door catalog so estimates worked on day one. The
            numbers are placeholders — they are not market rates and not advice. Set your own
            before quoting real work.
          </Alert>
        )}

        <PriceBookTabs value={tab} />

        {tab === 'items' ? (
          <>
            <PriceBookFilters
              query={params.q ?? ''}
              category={category}
              showArchived={showArchived}
            />

            {items.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<BoxIcon />}
                  title={params.q || category ? 'Nothing matches' : 'Your price book is empty'}
                  body={
                    params.q || category
                      ? 'Try a different search or clear the category filter.'
                      : 'Add the parts, labor and service calls you sell.'
                  }
                  action={
                    canWrite ? (
                      <ButtonLink href="/settings/price-book/new" size="sm" icon={<PlusIcon />}>
                        Add an item
                      </ButtonLink>
                    ) : null
                  }
                />
              </Card>
            ) : (
              CATEGORY_ORDER.filter((key) => byCategory.has(key)).map((key) => (
                <div key={key}>
                  <SectionHeading>{CATEGORY_LABELS[key]}</SectionHeading>
                  <Card padded={false}>
                    {byCategory.get(key)!.map((item, index) => (
                      <div key={item.id}>
                        {index > 0 ? <Divider className="ml-4" /> : null}
                        <ListRow
                          href={canWrite ? `/settings/price-book/${item.id}` : undefined}
                          title={item.name}
                          subtitle={[
                            item.sku,
                            item.trackInventory ? 'tracked' : null,
                            item.taxable ? null : 'no tax',
                            item.supplier,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          trailing={
                            <div className="flex flex-col items-end gap-1">
                              <span className="num text-[0.9375rem] font-bold text-ink">
                                {formatCents(item.priceCents, { currency: session.currency })}
                              </span>
                              {item.archivedAt ? (
                                <Chip tone="neutral">Archived</Chip>
                              ) : item.costCents > 0 ? (
                                <span className="num text-xs text-ink-subtle">
                                  cost {formatCents(item.costCents, { currency: session.currency })}
                                </span>
                              ) : null}
                            </div>
                          }
                        />
                      </div>
                    ))}
                  </Card>
                </div>
              ))
            )}
          </>
        ) : (
          <>
            {packages.length === 0 ? (
              <Card>
                <EmptyState
                  title="No packages yet"
                  body="A package is a reusable estimate option — springs plus labor, say. Dropping one onto an estimate copies its parts in as separate priced lines."
                  action={
                    canWrite ? (
                      <ButtonLink href="/settings/price-book/packages/new" size="sm">
                        Create a package
                      </ButtonLink>
                    ) : null
                  }
                />
              </Card>
            ) : (
              <Card padded={false}>
                {packages.map((pkg, index) => (
                  <div key={pkg.id}>
                    {index > 0 ? <Divider className="ml-4" /> : null}
                    <ListRow
                      href={canWrite ? `/settings/price-book/packages/${pkg.id}` : undefined}
                      title={pkg.name}
                      subtitle={pkg.items
                        .map(
                          (line) =>
                            `${Number(line.quantity.toString())} × ${line.priceBookItem.name}`,
                        )
                        .join(' · ')}
                      trailing={
                        <div className="flex flex-col items-end gap-1">
                          <span className="num text-[0.9375rem] font-bold text-ink">
                            {formatCents(packageTotalCents(pkg), { currency: session.currency })}
                          </span>
                          <div className="flex gap-1">
                            {pkg.defaultTier && pkg.defaultTier !== 'STANDARD' ? (
                              <Chip tone="brand">{pkg.defaultTier.toLowerCase()}</Chip>
                            ) : null}
                            {!pkg.isActive ? <Chip tone="neutral">Archived</Chip> : null}
                          </div>
                        </div>
                      }
                    />
                  </div>
                ))}
              </Card>
            )}
          </>
        )}

        {!canWrite ? (
          <p className="px-1 text-center text-xs text-ink-subtle">
            Only owners and admins can change prices.{' '}
            <Link href="/more" className="font-semibold text-brand-600">
              Back
            </Link>
          </p>
        ) : null}
      </PageBody>
    </>
  )
}
