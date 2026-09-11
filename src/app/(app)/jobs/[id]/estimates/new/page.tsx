import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { ensureDraftEstimate, addCatalogItemToEstimate } from '@/server/estimates/builder'

export const dynamic = 'force-dynamic'

/**
 * There is no "new estimate" form — an estimate is a container that gets filled
 * in. This opens (or reuses) the job's draft and drops the technician straight
 * into the builder, optionally seeding the line the Spring Calculator sent.
 */
export default async function NewEstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ itemId?: string; qty?: string }>
}) {
  const session = await requirePermission('estimate:write')
  const { id } = await params
  const { itemId, qty } = await searchParams

  const job = await session.db.job.findUnique({ where: { id }, select: { id: true } })
  if (!job) notFound()

  const estimate = await ensureDraftEstimate(session, job.id)

  if (itemId) {
    const quantity = Number(qty ?? '1')
    await addCatalogItemToEstimate(session, {
      estimateId: estimate.id,
      priceBookItemId: itemId,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    })
  }

  redirect(`/estimates/${estimate.id}`)
}
