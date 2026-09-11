import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { RESIDENTIAL_INSPECTION } from '@/lib/inspection-template'
import { formatJobNumber } from '@/lib/numbering'
import { READY_PHOTOS } from '@/server/media/photos'
import { loadRemedies, startInspection } from '@/server/inspections/service'
import { PageHeader } from '@/components/app/page-header'
import { InspectionChecklist } from './checklist'

export const metadata: Metadata = { title: 'Inspection' }
export const dynamic = 'force-dynamic'

export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('job:write')
  const { id } = await params

  const job = await session.db.job.findUnique({
    where: { id },
    include: {
      customer: { select: { firstName: true, lastName: true, companyName: true } },
      door: { select: { id: true, nickname: true, positionLabel: true, number: true } },
    },
  })
  if (!job) notFound()

  // Opening the screen is what starts the inspection; there is no separate
  // "begin" tap standing between a technician and the checklist.
  await startInspection(session, job.id)

  const [inspection, remedies, estimate] = await Promise.all([
    session.db.inspection.findFirst({
      where: { jobId: job.id },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { photos: { where: READY_PHOTOS, select: { id: true } } },
        },
      },
    }),
    loadRemedies(session),
    session.db.estimate.findFirst({
      where: { jobId: job.id, status: 'DRAFT', archivedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { options: { include: { items: { select: { id: true } } } } },
    }),
  ])
  if (!inspection) notFound()

  const groupByKey = new Map(
    RESIDENTIAL_INSPECTION.map((component) => [component.key, component]),
  )

  return (
    <>
      <PageHeader
        title="Inspection"
        subtitle={`${formatJobNumber(job.number)} · ${job.customer.companyName ?? `${job.customer.firstName} ${job.customer.lastName}`}`}
        backHref={`/jobs/${job.id}`}
      />
      <InspectionChecklist
        jobId={job.id}
        inspectionId={inspection.id}
        currency={session.currency}
        items={inspection.items.map((item) => ({
          id: item.id,
          componentKey: item.componentKey,
          label: item.label,
          status: item.status,
          note: item.note,
          quoted: item.estimateItemId !== null,
          photoCount: item.photos.length,
          group: groupByKey.get(item.componentKey)?.group ?? 'Door',
          hint: groupByKey.get(item.componentKey)?.hint ?? null,
        }))}
        remedies={Object.fromEntries(remedies)}
        estimate={
          estimate
            ? {
                id: estimate.id,
                optionCount: estimate.options.length,
                lineCount: estimate.options.reduce(
                  (sum, option) => sum + option.items.length,
                  0,
                ),
                totalCents: Math.max(
                  ...estimate.options.map((option) => option.totalCents),
                  0,
                ),
              }
            : null
        }
      />
    </>
  )
}
