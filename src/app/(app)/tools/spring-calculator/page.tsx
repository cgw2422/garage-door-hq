import type { Metadata } from 'next'
import { requireSession } from '@/lib/session'
import { sizingAvailable } from '@/server/springs/calculator'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { SpringCalculatorForm } from './form'

export const metadata: Metadata = { title: 'Spring Calculator' }
export const dynamic = 'force-dynamic'

export default async function SpringCalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string; doorId?: string }>
}) {
  const session = await requireSession()
  const { jobId, doorId } = await searchParams

  const myLocation = session.defaultLocationId
    ? await session.db.inventoryLocation.findUnique({
        where: { id: session.defaultLocationId },
        select: { name: true },
      })
    : null

  return (
    <>
      <PageHeader
        title="Spring Calculator"
        subtitle="Measure the spring. Find it on the truck."
        backHref={jobId ? `/jobs/${jobId}?tab=door` : '/more'}
      />
      <PageBody>
        <SpringCalculatorForm
          jobId={jobId ?? ''}
          doorId={doorId ?? ''}
          currency={session.currency}
          myLocationName={myLocation?.name ?? 'My Truck'}
          sizingAvailable={sizingAvailable()}
        />
      </PageBody>
    </>
  )
}
