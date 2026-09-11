import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { directionsHref, formatDate } from '@/server/jobs/queries'
import { formatDoorSize } from '@/lib/measure'
import { formatDoorNumber } from '@/lib/numbering'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { ButtonLink, CircleAction } from '@/components/ui/button'
import { Card, Divider, EmptyState, ListRow, SectionHeading } from '@/components/ui/card'
import { DataGrid, DataPoint } from '@/components/ui/stat'
import { Chip, JobStatusChip } from '@/components/ui/status'
import { DoorIcon, NavigationIcon, PlusIcon } from '@/components/ui/icons'

export const metadata: Metadata = { title: 'Property' }
export const dynamic = 'force-dynamic'

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params

  const property = await session.db.property.findUnique({
    where: { id },
    include: {
      customer: true,
      doors: {
        where: { archivedAt: null },
        orderBy: { number: 'asc' },
        include: {
          openers: { where: { isCurrent: true }, take: 1 },
          springSystems: { where: { isCurrent: true }, take: 1, include: { springs: true } },
        },
      },
      jobs: {
        where: { archivedAt: null },
        orderBy: [{ scheduledStart: 'desc' }],
        take: 10,
        include: { jobType: { select: { name: true } } },
      },
    },
  })
  if (!property) notFound()

  return (
    <>
      <PageHeader
        title={property.nickname ?? property.line1}
        subtitle={property.customer.companyName ?? `${property.customer.firstName} ${property.customer.lastName}`}
        backHref={`/customers/${property.customerId}`}
        action={
          <Link
            href={`/properties/${property.id}/edit`}
            className="text-[0.8125rem] font-semibold text-brand-600"
          >
            Edit
          </Link>
        }
      />
      <PageBody>
        <Card>
          <p className="text-[0.9375rem] font-medium text-ink">{property.line1}</p>
          {property.line2 ? <p className="text-sm text-ink-muted">{property.line2}</p> : null}
          <p className="text-sm text-ink-muted">
            {property.city}, {property.state} {property.postalCode}
          </p>

          <div className="mt-3 flex justify-start">
            <CircleAction
              icon={<NavigationIcon />}
              label="Directions"
              href={directionsHref(property)}
            />
          </div>

          <Divider className="my-3" />
          <DataGrid>
            <DataPoint
              label="Type"
              value={<Chip tone={property.kind === 'COMMERCIAL' ? 'brand' : 'neutral'}>
                {property.kind === 'COMMERCIAL' ? 'Commercial' : 'Residential'}
              </Chip>}
            />
            <DataPoint label="Doors" value={String(property.doors.length)} />
          </DataGrid>

          {property.accessInstructions ? (
            <div className="mt-3 rounded-[--radius-control] bg-warning-50 px-3 py-2.5">
              <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-warning-700">
                Access
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-warning-700">
                {property.accessInstructions}
              </p>
            </div>
          ) : null}
          {property.gateInfo ? (
            <p className="mt-2 text-sm text-ink-muted">Gate: {property.gateInfo}</p>
          ) : null}
        </Card>

        <div>
          <SectionHeading
            action={
              <Link
                href={`/properties/${property.id}/doors/new`}
                className="text-[0.8125rem] font-semibold text-brand-600"
              >
                Add door
              </Link>
            }
          >
            Doors
          </SectionHeading>
          <Card padded={false}>
            {property.doors.length === 0 ? (
              <EmptyState
                icon={<DoorIcon />}
                title="No doors on file"
                body="A Door Passport keeps the size, hardware and full service history in one place."
                action={
                  <ButtonLink
                    href={`/properties/${property.id}/doors/new`}
                    size="sm"
                    icon={<PlusIcon />}
                  >
                    Add door
                  </ButtonLink>
                }
              />
            ) : (
              property.doors.map((door, index) => {
                const springs = door.springSystems[0]?.springs ?? []
                return (
                  <div key={door.id}>
                    {index > 0 ? <Divider className="ml-4" /> : null}
                    <ListRow
                      href={`/doors/${door.id}`}
                      leading={<DoorIcon className="h-5 w-5 text-ink-subtle" />}
                      title={door.nickname ?? door.positionLabel ?? formatDoorNumber(door.number)}
                      subtitle={[
                        formatDoorSize(door.widthInches, door.heightInches),
                        door.manufacturer,
                        springs.length > 0 ? `${springs.length} spring system on file` : null,
                      ]
                        .filter((part) => part && part !== '—')
                        .join(' · ')}
                    />
                  </div>
                )
              })
            )}
          </Card>
        </div>

        {property.jobs.length > 0 ? (
          <div>
            <SectionHeading>Recent Jobs</SectionHeading>
            <Card padded={false}>
              {property.jobs.map((job, index) => (
                <div key={job.id}>
                  {index > 0 ? <Divider className="ml-4" /> : null}
                  <ListRow
                    href={`/jobs/${job.id}`}
                    title={job.jobType?.name ?? 'Service'}
                    subtitle={
                      job.scheduledStart ? formatDate(job.scheduledStart, session.timezone) : undefined
                    }
                    trailing={<JobStatusChip status={job.status} />}
                  />
                </div>
              ))}
            </Card>
          </div>
        ) : null}

        <ButtonLink
          href={`/jobs/new?customerId=${property.customerId}&propertyId=${property.id}`}
          size="lg"
          fullWidth
          icon={<PlusIcon />}
        >
          New job here
        </ButtonLink>
      </PageBody>
    </>
  )
}
