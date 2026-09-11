import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { formatCents } from '@/lib/money'
import { formatDate } from '@/server/jobs/queries'
import { formatDoorSize } from '@/lib/measure'
import { formatDoorNumber, formatInvoiceNumber, formatJobNumber } from '@/lib/numbering'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { ButtonLink, CircleAction } from '@/components/ui/button'
import { Card, Divider, EmptyState, ListRow, SectionHeading } from '@/components/ui/card'
import { DataGrid, DataPoint } from '@/components/ui/stat'
import { InvoiceStatusChip, JobStatusChip } from '@/components/ui/status'
import {
  DoorIcon,
  MessageIcon,
  NavigationIcon,
  PhoneIcon,
  PlusIcon,
} from '@/components/ui/icons'
import { directionsHref } from '@/server/jobs/queries'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const session = await requireSession()
  const { id } = await params
  const customer = await session.db.customer.findUnique({
    where: { id },
    select: { firstName: true, lastName: true, companyName: true },
  })
  return {
    title: customer
      ? (customer.companyName ?? `${customer.firstName} ${customer.lastName}`)
      : 'Customer',
  }
}

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSession()
  const { id } = await params

  const customer = await session.db.customer.findUnique({
    where: { id },
    include: {
      properties: {
        where: { archivedAt: null },
        orderBy: { createdAt: 'asc' },
        include: { doors: { where: { archivedAt: null }, orderBy: { number: 'asc' } } },
      },
      jobs: {
        where: { archivedAt: null },
        orderBy: [{ scheduledStart: 'desc' }, { createdAt: 'desc' }],
        take: 15,
        include: { jobType: { select: { name: true } } },
      },
      invoices: { where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 10 },
    },
  })
  if (!customer) notFound()

  const lifetimeRevenue = await session.db.payment.aggregate({
    where: { customerId: customer.id, status: 'SUCCEEDED' },
    _sum: { amountCents: true },
  })
  const outstanding = customer.invoices
    .filter((invoice) => ['SENT', 'PARTIAL', 'PAST_DUE'].includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.balanceCents, 0)

  const displayName = customer.companyName ?? `${customer.firstName} ${customer.lastName}`
  const primaryProperty = customer.properties[0]

  return (
    <>
      <PageHeader
        title={displayName}
        subtitle={customer.companyName ? `${customer.firstName} ${customer.lastName}` : undefined}
        backHref="/customers"
      />
      <PageBody>
        <Card padded={false}>
          <div className="flex px-2 pt-2">
            {customer.phone ? (
              <>
                <CircleAction icon={<PhoneIcon />} label="Call" href={`tel:${customer.phone}`} />
                <CircleAction icon={<MessageIcon />} label="Text" href={`sms:${customer.phone}`} />
              </>
            ) : null}
            {primaryProperty ? (
              <CircleAction
                icon={<NavigationIcon />}
                label="Directions"
                href={directionsHref(primaryProperty)}
              />
            ) : null}
          </div>
          <Divider className="mx-4" />
          <div className="p-4">
            <DataGrid>
              <DataPoint label="Phone" value={customer.phone ?? '—'} />
              <DataPoint label="Email" value={customer.email ?? '—'} />
              <DataPoint
                label="Customer since"
                value={formatDate(customer.customerSince, session.timezone)}
              />
              <DataPoint
                label="Lifetime revenue"
                value={formatCents(lifetimeRevenue._sum.amountCents ?? 0, {
                  currency: session.currency,
                  showCents: false,
                })}
              />
            </DataGrid>
            {outstanding > 0 ? (
              <p className="mt-3 rounded-[--radius-control] bg-warning-50 px-3 py-2 text-sm font-semibold text-warning-700">
                {formatCents(outstanding, { currency: session.currency })} outstanding
              </p>
            ) : null}
            {customer.notesSummary ? (
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{customer.notesSummary}</p>
            ) : null}
          </div>
        </Card>

        <div>
          <SectionHeading
            action={
              <Link
                href={`/customers/${customer.id}/properties/new`}
                className="text-[0.8125rem] font-semibold text-brand-600"
              >
                Add property
              </Link>
            }
          >
            Properties &amp; Doors
          </SectionHeading>

          {customer.properties.length === 0 ? (
            <Card>
              <EmptyState
                icon={<DoorIcon />}
                title="No service address yet"
                body="Add the address so their doors can start building history."
                action={
                  <ButtonLink
                    href={`/customers/${customer.id}/properties/new`}
                    size="sm"
                    icon={<PlusIcon />}
                  >
                    Add property
                  </ButtonLink>
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {customer.properties.map((property) => (
                <Card key={property.id} padded={false}>
                  <ListRow
                    href={`/properties/${property.id}`}
                    title={property.nickname ?? property.line1}
                    subtitle={`${property.line1}, ${property.city}, ${property.state} ${property.postalCode}`}
                  />
                  {property.doors.length > 0 ? (
                    <>
                      <Divider className="ml-4" />
                      {property.doors.map((door) => (
                        <ListRow
                          key={door.id}
                          href={`/doors/${door.id}`}
                          leading={<DoorIcon className="h-5 w-5 text-ink-subtle" />}
                          title={
                            door.nickname ?? door.positionLabel ?? formatDoorNumber(door.number)
                          }
                          subtitle={[
                            formatDoorSize(door.widthInches, door.heightInches),
                            door.manufacturer,
                            door.model,
                          ]
                            .filter((part) => part && part !== '—')
                            .join(' · ')}
                        />
                      ))}
                    </>
                  ) : (
                    <>
                      <Divider className="ml-4" />
                      <ListRow
                        href={`/properties/${property.id}/doors/new`}
                        leading={<PlusIcon className="h-5 w-5 text-brand-600" />}
                        title="Add a door"
                        subtitle="Start this property's Door Passport"
                      />
                    </>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionHeading>Job History</SectionHeading>
          <Card padded={false}>
            {customer.jobs.length === 0 ? (
              <EmptyState title="No jobs yet" />
            ) : (
              customer.jobs.map((job, index) => (
                <div key={job.id}>
                  {index > 0 ? <Divider className="ml-4" /> : null}
                  <ListRow
                    href={`/jobs/${job.id}`}
                    title={job.jobType?.name ?? formatJobNumber(job.number)}
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

        {customer.invoices.length > 0 ? (
          <div>
            <SectionHeading>Invoices</SectionHeading>
            <Card padded={false}>
              {customer.invoices.map((invoice, index) => (
                <div key={invoice.id}>
                  {index > 0 ? <Divider className="ml-4" /> : null}
                  <ListRow
                    href={`/invoices/${invoice.id}`}
                    title={formatInvoiceNumber(invoice.number)}
                    subtitle={
                      invoice.issuedAt ? formatDate(invoice.issuedAt, session.timezone) : 'Draft'
                    }
                    trailing={
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="num text-[0.9375rem] font-bold text-ink">
                          {formatCents(invoice.totalCents, { currency: session.currency })}
                        </span>
                        <InvoiceStatusChip status={invoice.status} />
                      </div>
                    }
                  />
                </div>
              ))}
            </Card>
          </div>
        ) : null}

        <ButtonLink href={`/jobs/new?customerId=${customer.id}`} size="lg" fullWidth icon={<PlusIcon />}>
          New job for {customer.firstName}
        </ButtonLink>
      </PageBody>
    </>
  )
}
