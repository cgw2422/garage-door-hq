import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { directionsHref, formatDate, formatTime } from '@/server/jobs/queries'
import { formatEstimateNumber, formatInvoiceNumber, formatJobNumber } from '@/lib/numbering'
import { formatCents } from '@/lib/money'
import { formatCycles, formatDoorSize, formatSpringSize, formatWind } from '@/lib/measure'
import { InspectionStatusChip, InvoiceStatusChip, JobStatusChip } from '@/components/ui/status'
import { PageBody, PageHeader, StickyActions } from '@/components/app/page-header'
import { ButtonLink, CircleAction } from '@/components/ui/button'
import { Card, CardHeader, Divider, EmptyState, ListRow } from '@/components/ui/card'
import { DataGrid, DataPoint } from '@/components/ui/stat'
import {
  CameraIcon,
  DocumentIcon,
  DoorIcon,
  MessageIcon,
  NavigationIcon,
  PhoneIcon,
  SpringIcon,
  WrenchIcon,
} from '@/components/ui/icons'
import { JobTabs, type JobTab } from './tabs'
import { JobStatusActions } from './status-actions'
import { ReviewRequestPanel } from './review-request'
import { loadReviewContext } from '@/server/communications/review-requests'
import { PhotoGrid } from '@/components/app/photo-grid'
import { PhotoCapture } from '@/components/app/photo-capture'
import { READY_PHOTOS } from '@/server/media/photos'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const session = await requireSession()
  const { id } = await params
  const job = await session.db.job.findUnique({ where: { id }, select: { number: true, displayNumber: true } })
  return { title: job ? formatJobNumber(job) : 'Job' }
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await requireSession()
  const { id } = await params
  const { tab: rawTab } = await searchParams
  const tab: JobTab = ['door', 'photos', 'notes'].includes(rawTab ?? '')
    ? (rawTab as JobTab)
    : 'job'

  // The tenant-scoped client makes this findUnique a no-match for any job
  // belonging to another organization, so a guessed id returns 404.
  const job = await session.db.job.findUnique({
    where: { id },
    include: {
      customer: true,
      property: true,
      jobType: true,
      assignedTo: { select: { firstName: true, lastName: true } },
      door: {
        include: {
          openers: { where: { isCurrent: true }, take: 1 },
          springSystems: {
            where: { isCurrent: true },
            take: 1,
            include: { springs: true },
          },
          events: { orderBy: { occurredAt: 'desc' }, take: 5 },
        },
      },
      inspections: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      },
      estimates: { orderBy: { createdAt: 'desc' }, include: { selectedOption: true } },
      invoices: { orderBy: { createdAt: 'desc' } },
      parts: true,
      photos: { where: READY_PHOTOS, orderBy: { createdAt: 'desc' } },
      notes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { firstName: true } } } },
    },
  })

  if (!job) notFound()

  const inspection = job.inspections[0] ?? null
  const opener = job.door?.openers[0] ?? null
  const springSystem = job.door?.springSystems[0] ?? null
  const customerName =
    job.customer.companyName ?? `${job.customer.firstName} ${job.customer.lastName}`

  // Only needed once the work is done; skipped entirely otherwise.
  const reviewContext =
    job.status === 'COMPLETED'
      ? await loadReviewContext(session, job.id)
      : { request: null, destinationConfigured: false, enabled: false }

  return (
    <>
      <PageHeader
        title={formatJobNumber(job)}
        subtitle={job.jobType?.name ?? 'Service call'}
        backHref="/jobs"
        action={<JobStatusChip status={job.status} />}
      />

      <PageBody>
        <Card padded={false}>
          <div className="flex items-start gap-3 px-4 pt-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
              {job.customer.firstName.charAt(0)}
              {job.customer.lastName.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <Link href={`/customers/${job.customerId}`} className="text-base font-semibold text-ink">
                {customerName}
              </Link>
              <p className="text-sm text-ink-muted">
                {job.property.line1}
                {job.property.line2 ? `, ${job.property.line2}` : ''}
              </p>
              <p className="text-sm text-ink-muted">
                {job.property.city}, {job.property.state} {job.property.postalCode}
              </p>
              {job.customer.phone ? (
                <p className="num mt-0.5 text-sm text-ink-muted">{job.customer.phone}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex px-2 pb-3">
            {job.customer.phone ? (
              <>
                <CircleAction icon={<PhoneIcon />} label="Call" href={`tel:${job.customer.phone}`} />
                <CircleAction icon={<MessageIcon />} label="Text" href={`sms:${job.customer.phone}`} />
              </>
            ) : null}
            <CircleAction
              icon={<NavigationIcon />}
              label="Directions"
              href={directionsHref(job.property)}
            />
          </div>
        </Card>

        <JobTabs jobId={job.id} value={tab} />

        {tab === 'job' ? (
          <>
            {job.scheduledStart ? (
              <Card>
                <DataGrid>
                  <DataPoint
                    label="Scheduled"
                    value={`${formatDate(job.scheduledStart, session.timezone)} · ${formatTime(job.scheduledStart, session.timezone)}`}
                  />
                  <DataPoint
                    label="Technician"
                    value={job.assignedTo ? job.assignedTo.firstName : 'Unassigned'}
                  />
                </DataGrid>
              </Card>
            ) : null}

            {job.reportedIssue ? (
              <Card>
                <CardHeader title="Customer Issue" />
                <p className="text-[0.9375rem] leading-relaxed text-ink">{job.reportedIssue}</p>
              </Card>
            ) : null}

            <Card padded={false}>
              <div className="px-4 pt-4">
                <CardHeader
                  title="Inspection"
                  action={
                    <Link
                      href={`/jobs/${job.id}/inspection`}
                      className="text-[0.8125rem] font-semibold text-brand-600"
                    >
                      {inspection ? 'Continue' : 'Start'}
                    </Link>
                  }
                />
              </div>
              {inspection && inspection.items.length > 0 ? (
                <ul className="pb-2">
                  {inspection.items
                    .filter((item) => item.status !== 'NOT_CHECKED')
                    .slice(0, 8)
                    .map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 px-4 py-2"
                      >
                        <span className="truncate text-[0.9375rem] text-ink">{item.label}</span>
                        <InspectionStatusChip status={item.status} />
                      </li>
                    ))}
                </ul>
              ) : (
                <EmptyState
                  icon={<WrenchIcon />}
                  title="No inspection yet"
                  body="Walk the door once and every finding becomes a line you can quote."
                />
              )}
            </Card>

            <Card padded={false}>
              <div className="px-4 pt-4">
                <CardHeader
                  title="Estimates"
                  action={
                    <Link
                      href={`/jobs/${job.id}/estimates/new`}
                      className="text-[0.8125rem] font-semibold text-brand-600"
                    >
                      Create
                    </Link>
                  }
                />
              </div>
              {job.estimates.length === 0 ? (
                <EmptyState
                  icon={<DocumentIcon />}
                  title="No estimate yet"
                  body="Present good, better and best on the phone and take a signature."
                />
              ) : (
                job.estimates.map((estimate, index) => (
                  <div key={estimate.id}>
                    {index > 0 ? <Divider className="ml-4" /> : null}
                    <ListRow
                      href={`/estimates/${estimate.id}`}
                      title={estimate.title ?? formatEstimateNumber(estimate)}
                      subtitle={
                        estimate.selectedOption
                          ? `${estimate.selectedOption.name} selected`
                          : `${estimate.status.toLowerCase()}`
                      }
                      trailing={
                        estimate.selectedOption ? (
                          <span className="num text-[0.9375rem] font-bold text-ink">
                            {formatCents(estimate.selectedOption.totalCents, {
                              currency: session.currency,
                            })}
                          </span>
                        ) : null
                      }
                    />
                  </div>
                ))
              )}
            </Card>

            {job.invoices.length > 0 ? (
              <Card padded={false}>
                <div className="px-4 pt-4">
                  <CardHeader title="Invoices" />
                </div>
                {job.invoices.map((invoice, index) => (
                  <div key={invoice.id}>
                    {index > 0 ? <Divider className="ml-4" /> : null}
                    <ListRow
                      href={`/invoices/${invoice.id}`}
                      title={formatInvoiceNumber(invoice)}
                      subtitle={
                        invoice.balanceCents > 0
                          ? `${formatCents(invoice.balanceCents, { currency: session.currency })} outstanding`
                          : 'Paid in full'
                      }
                      trailing={
                        <div className="flex flex-col items-end gap-1.5">
                          <InvoiceStatusChip status={invoice.status} />
                          <span className="num text-[0.9375rem] font-bold text-ink">
                            {formatCents(invoice.totalCents, { currency: session.currency })}
                          </span>
                        </div>
                      }
                    />
                  </div>
                ))}
              </Card>
            ) : null}

            {job.parts.length > 0 ? (
              <Card>
                <CardHeader title="Parts Used" />
                <ul className="space-y-2">
                  {job.parts.map((part) => (
                    <li key={part.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-[0.9375rem] text-ink">
                        {part.description}
                      </span>
                      <span className="num shrink-0 text-sm font-semibold text-ink-muted">
                        ×{Number(part.quantity.toString())}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </>
        ) : null}

        {tab === 'door' ? (
          job.door ? (
            <>
              <Card>
                <CardHeader
                  title="Door Passport"
                  action={
                    <Link
                      href={`/doors/${job.door.id}`}
                      className="text-[0.8125rem] font-semibold text-brand-600"
                    >
                      Open
                    </Link>
                  }
                />
                <DataGrid>
                  <DataPoint label="Door" value={job.door.nickname ?? job.door.positionLabel ?? `D-${job.door.number}`} />
                  <DataPoint
                    label="Size"
                    value={formatDoorSize(job.door.widthInches, job.door.heightInches)}
                  />
                  <DataPoint label="Manufacturer" value={job.door.manufacturer ?? '—'} />
                  <DataPoint label="Model" value={job.door.model ?? '—'} />
                  <DataPoint label="Material" value={job.door.material ?? '—'} />
                  <DataPoint
                    label="Insulated"
                    value={job.door.insulated === null ? '—' : job.door.insulated ? 'Yes' : 'No'}
                  />
                </DataGrid>
              </Card>

              <Card>
                <CardHeader title="Spring System" />
                {springSystem && springSystem.springs.length > 0 ? (
                  <div className="space-y-3">
                    {springSystem.springs.map((spring) => (
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
                      <DataPoint label="Type" value={springSystem.type.replace('_', ' ')} />
                      <DataPoint label="Drum" value={springSystem.drumModel ?? '—'} />
                      <DataPoint label="Shaft" value={springSystem.shaftDiameter ?? '—'} />
                      <DataPoint
                        label="Installed"
                        value={
                          springSystem.installedAt
                            ? formatDate(springSystem.installedAt, session.timezone)
                            : '—'
                        }
                      />
                    </DataGrid>
                  </div>
                ) : (
                  <EmptyState
                    icon={<SpringIcon />}
                    title="No spring system on file"
                    body="Measure the spring and it is saved to this door for next time."
                    action={
                      <ButtonLink
                        href={`/tools/spring-calculator?jobId=${job.id}&doorId=${job.door.id}`}
                        size="sm"
                      >
                        Spring Calculator
                      </ButtonLink>
                    }
                  />
                )}
              </Card>

              <Card>
                <CardHeader title="Opener" />
                {opener ? (
                  <DataGrid>
                    <DataPoint label="Manufacturer" value={opener.manufacturer ?? '—'} />
                    <DataPoint label="Model" value={opener.model ?? '—'} />
                    <DataPoint label="Drive" value={opener.driveType?.replace('_', ' ') ?? '—'} />
                    <DataPoint label="Horsepower" value={opener.horsepower ?? '—'} />
                    <DataPoint
                      label="Installed"
                      value={opener.installedAt ? formatDate(opener.installedAt, session.timezone) : '—'}
                    />
                    <DataPoint label="Serial" value={opener.serialNumber ?? '—'} />
                  </DataGrid>
                ) : (
                  <p className="text-sm text-ink-muted">No opener recorded on this door.</p>
                )}
              </Card>

              {job.door.events.length > 0 ? (
                <Card padded={false}>
                  <div className="px-4 pt-4">
                    <CardHeader title="Door History" />
                  </div>
                  <ul className="pb-3">
                    {job.door.events.map((event) => (
                      <li key={event.id} className="flex gap-3 px-4 py-2">
                        <span className="num w-24 shrink-0 text-sm text-ink-subtle">
                          {formatDate(event.occurredAt, session.timezone)}
                        </span>
                        <span className="min-w-0 text-[0.9375rem] text-ink">{event.title}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </>
          ) : (
            <Card>
              <EmptyState
                icon={<DoorIcon />}
                title="No door linked to this job"
                body="Link a Door Passport so this visit joins the door's permanent history."
              />
            </Card>
          )
        ) : null}

        {tab === 'photos' ? (
          <>
            <Card padded={false}>
              <div className="px-4 pt-4">
                <CardHeader title={`Photos (${job.photos.length})`} />
              </div>
              {job.photos.length === 0 ? (
                <EmptyState
                  icon={<CameraIcon />}
                  title="No photos yet"
                  body="Before and after shots are the fastest way to end a dispute before it starts."
                />
              ) : (
                <PhotoGrid photos={job.photos} />
              )}
            </Card>

            <div className="grid grid-cols-2 gap-2.5">
              <PhotoCapture
                kind="BEFORE"
                label="Before"
                target={{ jobId: job.id }}
                revalidate={`/jobs/${job.id}`}
              />
              <PhotoCapture
                kind="AFTER"
                label="After"
                target={{ jobId: job.id }}
                revalidate={`/jobs/${job.id}`}
              />
            </div>
          </>
        ) : null}

        {tab === 'notes' ? (
          <Card padded={false}>
            <div className="px-4 pt-4">
              <CardHeader title="Notes" />
            </div>
            {job.notes.length === 0 ? (
              <EmptyState title="No notes on this job" />
            ) : (
              job.notes.map((note, index) => (
                <div key={note.id}>
                  {index > 0 ? <Divider className="ml-4" /> : null}
                  <div className="px-4 py-3">
                    <p className="text-[0.9375rem] leading-relaxed text-ink">{note.body}</p>
                    <p className="mt-1 text-xs text-ink-subtle">
                      {note.author?.firstName ?? 'System'} ·{' '}
                      {formatDate(note.createdAt, session.timezone)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </Card>
        ) : null}

        {job.status === 'COMPLETED' ? (
          <ReviewRequestPanel
            jobId={job.id}
            sentAt={
              reviewContext.request?.sentAt
                ? formatDate(reviewContext.request.sentAt, session.timezone)
                : null
            }
            queued={Boolean(reviewContext.request && !reviewContext.request.sentAt)}
            customerHasEmail={Boolean(job.customer.email)}
            destinationConfigured={reviewContext.destinationConfigured}
            enabled={reviewContext.enabled}
          />
        ) : null}
      </PageBody>

      <StickyActions>
        {job.status === 'COMPLETED' || job.status === 'CANCELLED' ? (
          <JobStatusActions jobId={job.id} status={job.status} />
        ) : (
          <>
            <ButtonLink
              href={`/jobs/${job.id}/inspection`}
              variant="secondary"
              size="lg"
              className="flex-1"
            >
              Inspect
            </ButtonLink>
            <JobStatusActions jobId={job.id} status={job.status} />
          </>
        )}
      </StickyActions>
    </>
  )
}
