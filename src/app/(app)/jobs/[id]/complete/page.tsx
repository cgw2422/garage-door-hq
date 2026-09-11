import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { formatJobNumber } from '@/lib/numbering'
import { READY_PHOTOS } from '@/server/media/photos'
import { PageHeader } from '@/components/app/page-header'
import { CompleteJobForm } from './form'

export const metadata: Metadata = { title: 'Complete job' }
export const dynamic = 'force-dynamic'

export default async function CompleteJobPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('job:write')
  const { id } = await params

  const job = await session.db.job.findUnique({
    where: { id },
    include: {
      customer: { select: { firstName: true, lastName: true, companyName: true } },
      door: { select: { id: true, nickname: true, positionLabel: true, number: true } },
      photos: { where: { ...READY_PHOTOS, kind: 'AFTER' }, select: { id: true } },
      signatures: { where: { kind: 'JOB_COMPLETION' }, select: { id: true } },
      estimates: {
        where: { status: 'ACCEPTED' },
        orderBy: { acceptedAt: 'desc' },
        take: 1,
        include: {
          selectedOption: {
            include: {
              items: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  priceBookItem: {
                    select: { id: true, name: true, sku: true, trackInventory: true, springSpec: { select: { priceBookItemId: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!job) notFound()
  if (job.status === 'COMPLETED') redirect(`/jobs/${job.id}`)

  const accepted = job.estimates[0] ?? null
  const option = accepted?.selectedOption ?? null

  // Pre-fill what the customer bought. The technician confirms or corrects it —
  // what was quoted and what actually came off the truck are different facts.
  const suggestedParts = (option?.items ?? [])
    .filter((item) => item.priceBookItem?.trackInventory)
    .map((item) => ({
      priceBookItemId: item.priceBookItem!.id,
      name: item.priceBookItem!.name,
      sku: item.priceBookItem!.sku,
      quantity: Number(item.quantity.toString()),
      isSpring: Boolean(item.priceBookItem!.springSpec),
    }))

  const stock = await session.db.stockLevel.findMany({
    where: {
      locationId: session.defaultLocationId ?? undefined,
      priceBookItemId: { in: suggestedParts.map((part) => part.priceBookItemId) },
    },
    select: { priceBookItemId: true, quantity: true },
  })
  const onHand = new Map(
    stock.map((level) => [level.priceBookItemId, Number(level.quantity.toString())]),
  )

  const catalog = await session.db.priceBookItem.findMany({
    where: { isActive: true, archivedAt: null, trackInventory: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, sku: true },
  })

  const locationName = session.defaultLocationId
    ? ((
        await session.db.inventoryLocation.findUnique({
          where: { id: session.defaultLocationId },
          select: { name: true },
        })
      )?.name ?? 'your truck')
    : 'your truck'

  return (
    <>
      <PageHeader
        title="Complete Job"
        subtitle={`${formatJobNumber(job.number)} · ${job.customer.companyName ?? `${job.customer.firstName} ${job.customer.lastName}`}`}
        backHref={`/jobs/${job.id}`}
      />
      <CompleteJobForm
        jobId={job.id}
        locationName={locationName}
        hasAcceptedEstimate={Boolean(option)}
        acceptedOptionName={option?.name ?? null}
        suggestedParts={suggestedParts.map((part) => ({
          ...part,
          onHand: onHand.get(part.priceBookItemId) ?? 0,
        }))}
        catalog={catalog}
        afterPhotoCount={job.photos.length}
        hasSignature={job.signatures.length > 0}
        doorLabel={
          job.door
            ? (job.door.nickname ?? job.door.positionLabel ?? `D-${job.door.number}`)
            : null
        }
      />
    </>
  )
}
