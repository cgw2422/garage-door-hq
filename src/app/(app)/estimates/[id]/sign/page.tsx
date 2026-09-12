import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { formatEstimateNumber } from '@/lib/numbering'
import { PageHeader } from '@/components/app/page-header'
import { PresentAndSign } from './present'

export const metadata: Metadata = { title: 'Present estimate' }
export const dynamic = 'force-dynamic'

export default async function SignEstimatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requirePermission('estimate:write')
  const { id } = await params

  const estimate = await session.db.estimate.findUnique({
    where: { id },
    include: {
      customer: true,
      options: {
        orderBy: { sortOrder: 'asc' },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  })
  if (!estimate) notFound()
  if (estimate.status === 'ACCEPTED') redirect(`/estimates/${estimate.id}`)

  const customerName =
    estimate.customer.companyName ??
    `${estimate.customer.firstName} ${estimate.customer.lastName}`

  return (
    <>
      <PageHeader
        title={estimate.title ?? 'Your Options'}
        subtitle={`${formatEstimateNumber(estimate)} · ${customerName}`}
        backHref={`/estimates/${estimate.id}`}
      />
      <PresentAndSign
        estimateId={estimate.id}
        customerName={customerName}
        currency={session.currency}
        selectedOptionId={estimate.selectedOptionId}
        termsText={estimate.termsText}
        options={estimate.options.map((option) => ({
          id: option.id,
          tier: option.tier,
          name: option.name,
          description: option.description,
          isRecommended: option.isRecommended,
          totalCents: option.totalCents,
          items: option.items.map((item) => ({
            id: item.id,
            name: item.name,
            quantity: Number(item.quantity.toString()),
            lineCents: Math.round(Number(item.quantity.toString()) * item.unitPriceCents),
          })),
        }))}
      />
    </>
  )
}
