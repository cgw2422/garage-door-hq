import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { formatDoorNumber } from '@/lib/numbering'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { EditDoorForm } from './form'

export const metadata: Metadata = { title: 'Edit Door Passport' }
export const dynamic = 'force-dynamic'

function dateValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : ''
}

export default async function EditDoorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('door:write')
  const { id } = await params

  const door = await session.db.door.findUnique({
    where: { id },
    include: {
      property: { select: { id: true, kind: true, nickname: true, line1: true } },
      _count: { select: { springSystems: true, events: true } },
    },
  })
  if (!door) notFound()

  return (
    <>
      <PageHeader
        title="Edit Door Passport"
        subtitle={door.nickname ?? door.positionLabel ?? formatDoorNumber(door)}
        backHref={`/doors/${door.id}`}
      />
      <PageBody>
        <EditDoorForm
          door={{
            id: door.id,
            propertyId: door.propertyId,
            isCommercial: door.property.kind === 'COMMERCIAL',
            nickname: door.nickname ?? '',
            positionLabel: door.positionLabel ?? '',
            widthInches: door.widthInches ? String(Number(door.widthInches.toString())) : '',
            heightInches: door.heightInches ? String(Number(door.heightInches.toString())) : '',
            panelCount: door.panelCount ? String(door.panelCount) : '',
            manufacturer: door.manufacturer ?? '',
            model: door.model ?? '',
            serialNumber: door.serialNumber ?? '',
            material: door.material ?? '',
            color: door.color ?? '',
            insulated: door.insulated === null ? 'unknown' : door.insulated ? 'yes' : 'no',
            trackType: door.trackType ?? '',
            trackRadiusInches: door.trackRadiusInches
              ? String(Number(door.trackRadiusInches.toString()))
              : '',
            headroomInches: door.headroomInches
              ? String(Number(door.headroomInches.toString()))
              : '',
            weightLbs: door.weightLbs ? String(Number(door.weightLbs.toString())) : '',
            installedAt: dateValue(door.installedAt),
            warrantyEndsAt: dateValue(door.warrantyEndsAt),
            laborWarrantyEndsAt: dateValue(door.laborWarrantyEndsAt),
            notesSummary: door.notesSummary ?? '',
          }}
          historyCounts={{
            springSystems: door._count.springSystems,
            events: door._count.events,
          }}
        />
      </PageBody>
    </>
  )
}
