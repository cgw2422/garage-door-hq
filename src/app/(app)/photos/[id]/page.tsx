import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { roleCan } from '@/lib/rbac'
import { formatDate } from '@/server/jobs/queries'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { PhotoDetail } from './detail'

export const metadata: Metadata = { title: 'Photo' }
export const dynamic = 'force-dynamic'

/** Where the photo came from, so "back" goes somewhere sensible. */
function contextFor(photo: {
  jobId: string | null
  doorId: string | null
  customerId: string | null
  propertyId: string | null
  priceBookItemId: string | null
  inspectionItemId: string | null
}) {
  if (photo.jobId) return { href: `/jobs/${photo.jobId}?tab=photos`, label: 'job' }
  if (photo.doorId) return { href: `/doors/${photo.doorId}`, label: 'Door Passport' }
  if (photo.priceBookItemId) {
    return { href: `/settings/price-book/${photo.priceBookItemId}`, label: 'price book item' }
  }
  if (photo.customerId) return { href: `/customers/${photo.customerId}`, label: 'customer' }
  if (photo.propertyId) return { href: `/properties/${photo.propertyId}`, label: 'property' }
  return { href: '/today', label: 'today' }
}

export default async function PhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params

  const photo = await session.db.photo.findUnique({
    where: { id },
    include: {
      job: { select: { number: true } },
      door: { select: { number: true, nickname: true } },
      inspectionItem: { select: { label: true } },
    },
  })
  if (!photo || photo.uploadStatus !== 'READY') notFound()

  const context = contextFor(photo)

  return (
    <>
      <PageHeader
        title={photo.caption || photo.kind.replace('_', ' ').toLowerCase()}
        subtitle={`Added ${formatDate(photo.createdAt, session.timezone)}`}
        backHref={context.href}
      />
      <PageBody>
        <PhotoDetail
          photoId={photo.id}
          kind={photo.kind}
          caption={photo.caption ?? ''}
          contextHref={context.href}
          contextLabel={context.label}
          meta={[
            photo.job ? `Job #${photo.job.number}` : null,
            photo.door ? `Door ${photo.door.nickname ?? `D-${photo.door.number}`}` : null,
            photo.inspectionItem ? `Inspection: ${photo.inspectionItem.label}` : null,
            photo.byteSize ? `${Math.round(photo.byteSize / 1024)} KB` : null,
          ].filter((line): line is string => Boolean(line))}
          canDelete={roleCan(session.role, 'photo:delete')}
        />
      </PageBody>
    </>
  )
}
