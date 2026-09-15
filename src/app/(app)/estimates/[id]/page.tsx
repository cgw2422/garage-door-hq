import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { roleCan } from '@/lib/rbac'
import { formatBps, formatCents } from '@/lib/money'
import { formatEstimateNumber } from '@/lib/numbering'
import { PageHeader } from '@/components/app/page-header'
import { activeLinkFor } from '@/server/portal/service'
import { Chip } from '@/components/ui/status'
import { emailIsConfigured } from '@/server/email'
import { EstimateBuilder } from './builder'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const session = await requireSession()
  const { id } = await params
  const estimate = await session.db.estimate.findUnique({
    where: { id },
    select: { number: true, displayNumber: true },
  })
  return { title: estimate ? formatEstimateNumber(estimate) : 'Estimate' }
}

export default async function EstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params

  const estimate = await session.db.estimate.findUnique({
    where: { id },
    include: {
      customer: true,
      job: { select: { id: true, number: true } },
      options: {
        orderBy: { sortOrder: 'asc' },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      },
      signatures: { include: { estimateVersion: { select: { version: true } } } },
      versions: { orderBy: { version: 'desc' }, take: 1 },
    },
  })
  if (!estimate) notFound()

  const [packages, catalog, portalLink] = await Promise.all([
    session.db.priceBookPackage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, defaultTier: true },
    }),
    session.db.priceBookItem.findMany({
      where: { isActive: true, archivedAt: null },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, sku: true, priceCents: true, category: true },
    }),
    activeLinkFor(session, { estimateId: id }),
  ])

  const editable = estimate.status !== 'ACCEPTED' && estimate.status !== 'VOID'
  const signature = estimate.signatures[0] ?? null

  return (
    <>
      <PageHeader
        title={formatEstimateNumber(estimate)}
        subtitle={
          estimate.customer.companyName ??
          `${estimate.customer.firstName} ${estimate.customer.lastName}`
        }
        backHref={estimate.job ? `/jobs/${estimate.job.id}` : '/jobs'}
        action={
          <Chip
            tone={
              estimate.status === 'ACCEPTED'
                ? 'success'
                : estimate.status === 'DECLINED'
                  ? 'danger'
                  : estimate.status === 'DRAFT'
                    ? 'neutral'
                    : 'brand'
            }
          >
            {estimate.status.charAt(0) + estimate.status.slice(1).toLowerCase()}
          </Chip>
        }
      />
      <EstimateBuilder
        customerEmail={estimate.customer.email}
        customerName={
          estimate.customer.companyName ??
          `${estimate.customer.firstName} ${estimate.customer.lastName}`
        }
        emailConfigured={emailIsConfigured()}
        estimate={{
          id: estimate.id,
          number: estimate.number,
          kind: estimate.kind,
          status: estimate.status,
          title: estimate.title,
          taxRateBps: estimate.taxRateBps,
          taxRateLabel: formatBps(estimate.taxRateBps),
          taxRateOverridden: estimate.taxRateOverridden,
          selectedOptionId: estimate.selectedOptionId,
          jobId: estimate.jobId,
          editable,
        }}
        options={estimate.options.map((option) => ({
          id: option.id,
          tier: option.tier,
          name: option.name,
          description: option.description,
          isRecommended: option.isRecommended,
          subtotalCents: option.subtotalCents,
          taxCents: option.taxCents,
          totalCents: option.totalCents,
          items: option.items.map((item) => ({
            id: item.id,
            name: item.name,
            sku: item.sku,
            kind: item.kind,
            quantity: Number(item.quantity.toString()),
            unitPriceCents: item.unitPriceCents,
            lineCents: Math.round(Number(item.quantity.toString()) * item.unitPriceCents),
          })),
        }))}
        packages={packages}
        catalog={catalog.map((item) => ({
          id: item.id,
          label: `${item.name}${item.sku ? ` · ${item.sku}` : ''} — ${formatCents(item.priceCents, { currency: session.currency, showCents: false })}`,
          category: item.category,
        }))}
        currency={session.currency}
        canEditTax={roleCan(session.role, 'pricebook:write')}
        defaultTaxRateBps={session.defaultTaxRateBps}
        portalLink={
          portalLink
            ? {
                id: portalLink.id,
                expiresAt: portalLink.expiresAt.toISOString(),
                viewCount: portalLink.viewCount,
                lastViewedAt: portalLink.lastViewedAt?.toISOString() ?? null,
              }
            : null
        }
        signature={
          signature
            ? {
                signerName: signature.signerName,
                signedAt: signature.signedAt.toISOString(),
                version: signature.estimateVersion?.version ?? null,
                hash: signature.documentHash,
                id: signature.id,
              }
            : null
        }
      />
    </>
  )
}
