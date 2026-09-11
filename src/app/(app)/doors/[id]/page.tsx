import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { DoorEventKind } from '@prisma/client'
import { requireSession } from '@/lib/session'
import { formatDate } from '@/server/jobs/queries'
import { formatCycles, formatDoorSize, formatInches, formatSpringSize, formatWind } from '@/lib/measure'
import { formatDoorNumber, formatJobNumber } from '@/lib/numbering'
import { READY_PHOTOS } from '@/server/media/photos'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardHeader, Divider, EmptyState, ListRow, SectionHeading } from '@/components/ui/card'
import { DataGrid, DataPoint } from '@/components/ui/stat'
import { Chip, JobStatusChip } from '@/components/ui/status'
import { PhotoGrid } from '@/components/app/photo-grid'
import { CameraIcon, SpringIcon, WrenchIcon } from '@/components/ui/icons'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const session = await requireSession()
  const { id } = await params
  const door = await session.db.door.findUnique({
    where: { id },
    select: { nickname: true, positionLabel: true, number: true },
  })
  return {
    title: door
      ? (door.nickname ?? door.positionLabel ?? formatDoorNumber(door.number))
      : 'Door Passport',
  }
}

const EVENT_TONE: Record<DoorEventKind, 'brand' | 'success' | 'warning' | 'neutral'> = {
  INSTALLED: 'brand',
  SERVICE: 'neutral',
  REPAIR: 'warning',
  INSPECTION: 'neutral',
  PART_REPLACED: 'warning',
  SPRING_REPLACED: 'warning',
  OPENER_REPLACED: 'warning',
  TUNE_UP: 'success',
  NOTE: 'neutral',
}

export default async function DoorPassportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSession()
  const { id } = await params

  const door = await session.db.door.findUnique({
    where: { id },
    include: {
      property: { include: { customer: true } },
      openers: { orderBy: [{ isCurrent: 'desc' }, { installedAt: 'desc' }] },
      springSystems: {
        orderBy: [{ isCurrent: 'desc' }, { installedAt: 'desc' }],
        include: { springs: true },
      },
      events: { orderBy: { occurredAt: 'desc' } },
      photos: { where: READY_PHOTOS, orderBy: { createdAt: 'desc' }, take: 12 },
      jobs: {
        where: { archivedAt: null },
        orderBy: [{ scheduledStart: 'desc' }, { createdAt: 'desc' }],
        take: 20,
        include: { jobType: { select: { name: true } } },
      },
      inspections: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { items: { select: { status: true } } },
      },
    },
  })
  if (!door) notFound()

  const currentSprings = door.springSystems.find((system) => system.isCurrent) ?? null
  const historicalSprings = door.springSystems.filter((system) => !system.isCurrent)
  const currentOpener = door.openers.find((opener) => opener.isCurrent) ?? null
  const displayName = door.nickname ?? door.positionLabel ?? formatDoorNumber(door.number)

  return (
    <>
      <PageHeader
        title={displayName}
        subtitle={`${formatDoorNumber(door.number)} · ${door.property.nickname ?? door.property.line1}`}
        backHref={`/properties/${door.propertyId}`}
        action={
          <Link
            href={`/doors/${door.id}/edit`}
            className="text-[0.8125rem] font-semibold text-brand-600"
          >
            Edit
          </Link>
        }
      />
      <PageBody>
        <Card>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/customers/${door.property.customerId}`}
                className="text-[0.9375rem] font-semibold text-ink"
              >
                {door.property.customer.companyName ??
                  `${door.property.customer.firstName} ${door.property.customer.lastName}`}
              </Link>
              <p className="text-sm text-ink-muted">
                {door.property.line1}, {door.property.city}
              </p>
            </div>
            <Chip tone="brand">{formatDoorNumber(door.number)}</Chip>
          </div>

          <Divider className="mb-3" />

          <DataGrid>
            <DataPoint label="Size" value={formatDoorSize(door.widthInches, door.heightInches)} />
            <DataPoint label="Panels" value={door.panelCount ? String(door.panelCount) : '—'} />
            <DataPoint label="Manufacturer" value={door.manufacturer ?? '—'} />
            <DataPoint label="Model" value={door.model ?? '—'} />
            <DataPoint label="Material" value={door.material?.replace('_', ' ') ?? '—'} />
            <DataPoint label="Color" value={door.color ?? '—'} />
            <DataPoint
              label="Insulated"
              value={door.insulated === null ? '—' : door.insulated ? 'Yes' : 'No'}
            />
            <DataPoint
              label="Door weight"
              value={door.weightLbs ? `${Number(door.weightLbs.toString())} lb` : '—'}
            />
            <DataPoint label="Track" value={door.trackType ?? '—'} />
            <DataPoint
              label="Track radius"
              value={door.trackRadiusInches ? formatInches(door.trackRadiusInches) : '—'}
            />
            <DataPoint label="Serial" value={door.serialNumber ?? '—'} />
            <DataPoint
              label="Installed"
              value={door.installedAt ? formatDate(door.installedAt, session.timezone) : '—'}
            />
            <DataPoint
              label="Door warranty"
              value={
                door.warrantyEndsAt
                  ? `${formatDate(door.warrantyEndsAt, session.timezone)}${
                      door.warrantyEndsAt < new Date() ? ' (expired)' : ''
                    }`
                  : '—'
              }
            />
            <DataPoint
              label="Labor warranty"
              value={
                door.laborWarrantyEndsAt
                  ? `${formatDate(door.laborWarrantyEndsAt, session.timezone)}${
                      door.laborWarrantyEndsAt < new Date() ? ' (expired)' : ''
                    }`
                  : '—'
              }
            />
          </DataGrid>

          {door.notesSummary ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">{door.notesSummary}</p>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Current Spring System"
            action={
              <Link
                href={`/tools/spring-calculator?doorId=${door.id}`}
                className="text-[0.8125rem] font-semibold text-brand-600"
              >
                Measure
              </Link>
            }
          />
          {currentSprings && currentSprings.springs.length > 0 ? (
            <div className="space-y-3">
              {currentSprings.springs.map((spring) => (
                <div key={spring.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="num text-[0.9375rem] font-semibold text-ink">
                      {formatSpringSize(
                        spring.wireSizeInches,
                        spring.insideDiameterInches,
                        spring.lengthInches,
                      )}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {formatWind(spring.wind)} · {formatCycles(spring.cycleRating)}
                    </p>
                  </div>
                  <span className="num shrink-0 text-sm font-semibold text-ink-muted">
                    ×{spring.quantity}
                  </span>
                </div>
              ))}
              <Divider />
              <DataGrid>
                <DataPoint label="Type" value={currentSprings.type.replace('_', ' ')} />
                <DataPoint label="Drum" value={currentSprings.drumModel ?? '—'} />
                <DataPoint label="Shaft" value={currentSprings.shaftDiameter ?? '—'} />
                <DataPoint
                  label="Installed"
                  value={
                    currentSprings.installedAt
                      ? formatDate(currentSprings.installedAt, session.timezone)
                      : '—'
                  }
                />
              </DataGrid>
            </div>
          ) : (
            <EmptyState
              icon={<SpringIcon />}
              title="No spring system on file"
              body="Measure the spring once and this door remembers it."
            />
          )}
        </Card>

        {historicalSprings.length > 0 ? (
          <Card>
            <CardHeader title="Previous Spring Systems" />
            <ul className="space-y-3">
              {historicalSprings.map((system) => (
                <li key={system.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="num text-sm font-medium text-ink">
                      {system.springs
                        .map((spring) =>
                          formatSpringSize(
                            spring.wireSizeInches,
                            spring.insideDiameterInches,
                            spring.lengthInches,
                          ),
                        )
                        .filter((value, index, all) => all.indexOf(value) === index)
                        .join(', ')}
                    </p>
                    <p className="text-xs text-ink-subtle">
                      {system.installedAt
                        ? `Installed ${formatDate(system.installedAt, session.timezone)}`
                        : 'Install date unknown'}
                      {system.replacedAt
                        ? ` · Replaced ${formatDate(system.replacedAt, session.timezone)}`
                        : ''}
                    </p>
                  </div>
                  <Chip tone="neutral">Historical</Chip>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Opener" />
          {currentOpener ? (
            <DataGrid>
              <DataPoint label="Manufacturer" value={currentOpener.manufacturer ?? '—'} />
              <DataPoint label="Model" value={currentOpener.model ?? '—'} />
              <DataPoint label="Drive" value={currentOpener.driveType?.replace('_', ' ') ?? '—'} />
              <DataPoint label="Horsepower" value={currentOpener.horsepower ?? '—'} />
              <DataPoint label="Serial" value={currentOpener.serialNumber ?? '—'} />
              <DataPoint
                label="Installed"
                value={
                  currentOpener.installedAt
                    ? formatDate(currentOpener.installedAt, session.timezone)
                    : '—'
                }
              />
            </DataGrid>
          ) : (
            <p className="text-sm text-ink-muted">No opener recorded on this door.</p>
          )}
        </Card>

        <div>
          <SectionHeading>Service History</SectionHeading>
          <Card padded={false}>
            {door.events.length === 0 ? (
              <EmptyState
                icon={<WrenchIcon />}
                title="No history yet"
                body="Completing a job on this door writes its work here automatically."
              />
            ) : (
              <ol className="p-4">
                {door.events.map((event, index) => (
                  <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {index < door.events.length - 1 ? (
                      <span
                        className="absolute left-[0.3125rem] top-4 h-full w-px bg-hairline"
                        aria-hidden="true"
                      />
                    ) : null}
                    <span
                      className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                        {
                          brand: 'bg-brand-500',
                          success: 'bg-success-500',
                          warning: 'bg-warning-500',
                          neutral: 'bg-navy-400',
                        }[EVENT_TONE[event.kind]]
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.9375rem] font-semibold text-ink">{event.title}</p>
                      <p className="num text-xs text-ink-subtle">
                        {formatDate(event.occurredAt, session.timezone)}
                      </p>
                      {event.detail ? (
                        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{event.detail}</p>
                      ) : null}
                      {event.jobId ? (
                        <Link
                          href={`/jobs/${event.jobId}`}
                          className="mt-1 inline-block text-[0.8125rem] font-semibold text-brand-600"
                        >
                          View job
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div>
          <SectionHeading>Jobs on this Door</SectionHeading>
          <Card padded={false}>
            {door.jobs.length === 0 ? (
              <EmptyState title="No jobs yet on this door" />
            ) : (
              door.jobs.map((job, index) => (
                <div key={job.id}>
                  {index > 0 ? <Divider className="ml-4" /> : null}
                  <ListRow
                    href={`/jobs/${job.id}`}
                    title={job.jobType?.name ?? 'Service'}
                    subtitle={
                      job.scheduledStart
                        ? formatDate(job.scheduledStart, session.timezone)
                        : formatJobNumber(job.number)
                    }
                    trailing={<JobStatusChip status={job.status} />}
                  />
                </div>
              ))
            )}
          </Card>
        </div>

        <div>
          <SectionHeading>Inspections</SectionHeading>
          <Card padded={false}>
            {door.inspections.length === 0 ? (
              <EmptyState title="No inspections recorded" />
            ) : (
              door.inspections.map((inspection, index) => {
                const findings = inspection.items.filter((item) =>
                  ['WORN', 'NEEDS_ATTENTION', 'FAILED'].includes(item.status),
                ).length
                return (
                  <div key={inspection.id}>
                    {index > 0 ? <Divider className="ml-4" /> : null}
                    <ListRow
                      href={`/jobs/${inspection.jobId}/inspection`}
                      title={
                        inspection.completedAt
                          ? formatDate(inspection.completedAt, session.timezone)
                          : 'In progress'
                      }
                      subtitle={inspection.summary ?? undefined}
                      trailing={
                        <Chip tone={findings > 0 ? 'warning' : 'success'}>
                          {findings > 0 ? `${findings} findings` : 'All good'}
                        </Chip>
                      }
                    />
                  </div>
                )
              })
            )}
          </Card>
        </div>

        <div>
          <SectionHeading>Photos</SectionHeading>
          <Card padded={false}>
            {door.photos.length === 0 ? (
              <EmptyState icon={<CameraIcon />} title="No photos of this door yet" />
            ) : (
              <PhotoGrid photos={door.photos} />
            )}
          </Card>
        </div>

        <ButtonLink
          href={`/jobs/new?customerId=${door.property.customerId}&propertyId=${door.propertyId}&doorId=${door.id}`}
          size="lg"
          fullWidth
        >
          New job on this door
        </ButtonLink>
      </PageBody>
    </>
  )
}
