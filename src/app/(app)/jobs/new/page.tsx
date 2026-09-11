import type { Metadata } from 'next'
import { requirePermission } from '@/lib/session'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Card, Divider, EmptyState, ListRow } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { PlusIcon, UsersIcon } from '@/components/ui/icons'
import { CustomerSearch } from '../../customers/search'
import { NewJobForm } from './form'

export const metadata: Metadata = { title: 'New job' }
export const dynamic = 'force-dynamic'

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{
    customerId?: string
    propertyId?: string
    doorId?: string
    q?: string
    date?: string
  }>
}) {
  const session = await requirePermission('job:write')
  const params = await searchParams

  // Step one is always "who is this for?". Everything else follows from it.
  if (!params.customerId) {
    const query = (params.q ?? '').trim()
    const customers = await session.db.customer.findMany({
      where: {
        archivedAt: null,
        ...(query
          ? {
              OR: [
                { firstName: { contains: query, mode: 'insensitive' } },
                { lastName: { contains: query, mode: 'insensitive' } },
                { companyName: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query } },
                { properties: { some: { line1: { contains: query, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 25,
      include: { properties: { select: { line1: true, city: true }, take: 1 } },
    })

    return (
      <>
        <PageHeader title="New Job" subtitle="Who is this for?" backHref="/jobs" />
        <PageBody>
          <CustomerSearch initialQuery={query} basePath="/jobs/new" />
          <ButtonLink href="/customers/new" variant="secondary" fullWidth icon={<PlusIcon />}>
            New customer
          </ButtonLink>
          <Card padded={false}>
            {customers.length === 0 ? (
              <EmptyState
                icon={<UsersIcon />}
                title={query ? 'No matches' : 'No customers yet'}
                body={query ? 'Try a phone number or an address.' : undefined}
              />
            ) : (
              customers.map((customer, index) => (
                <div key={customer.id}>
                  {index > 0 ? <Divider className="ml-4" /> : null}
                  <ListRow
                    href={`/jobs/new?customerId=${customer.id}${params.date ? `&date=${params.date}` : ''}`}
                    title={customer.companyName ?? `${customer.firstName} ${customer.lastName}`}
                    subtitle={
                      customer.properties[0]
                        ? `${customer.properties[0].line1}, ${customer.properties[0].city}`
                        : customer.phone ?? undefined
                    }
                  />
                </div>
              ))
            )}
          </Card>
        </PageBody>
      </>
    )
  }

  const customer = await session.db.customer.findUnique({
    where: { id: params.customerId },
    include: {
      properties: {
        where: { archivedAt: null },
        orderBy: { createdAt: 'asc' },
        include: { doors: { where: { archivedAt: null }, orderBy: { number: 'asc' } } },
      },
    },
  })

  if (!customer) {
    return (
      <>
        <PageHeader title="New Job" backHref="/jobs" />
        <PageBody>
          <Card>
            <EmptyState title="Customer not found" />
          </Card>
        </PageBody>
      </>
    )
  }

  if (customer.properties.length === 0) {
    return (
      <>
        <PageHeader title="New Job" backHref="/jobs" />
        <PageBody>
          <Card>
            <EmptyState
              title="No service address yet"
              body="Add where the work happens, then the job can be scheduled."
              action={
                <ButtonLink href={`/customers/${customer.id}/properties/new`} size="sm">
                  Add property
                </ButtonLink>
              }
            />
          </Card>
        </PageBody>
      </>
    )
  }

  const [jobTypes, technicians] = await Promise.all([
    session.db.jobType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
    session.isSoloOperator
      ? Promise.resolve([])
      : session.db.membership.findMany({
          where: { isActive: true, role: { in: ['OWNER', 'ADMIN', 'TECHNICIAN'] } },
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        }),
  ])

  return (
    <>
      <PageHeader
        title="New Job"
        subtitle={customer.companyName ?? `${customer.firstName} ${customer.lastName}`}
        backHref="/jobs/new"
      />
      <PageBody>
        <NewJobForm
          customerId={customer.id}
          properties={customer.properties.map((property) => ({
            id: property.id,
            label: property.nickname
              ? `${property.nickname} — ${property.line1}`
              : `${property.line1}, ${property.city}`,
            doors: property.doors.map((door) => ({
              id: door.id,
              label: door.nickname ?? door.positionLabel ?? `Door D-${door.number}`,
            })),
          }))}
          jobTypes={jobTypes}
          technicians={technicians.map((membership) => ({
            id: membership.user.id,
            name: `${membership.user.firstName} ${membership.user.lastName}`,
          }))}
          defaultPropertyId={params.propertyId}
          defaultDoorId={params.doorId}
          defaultDate={
            /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : undefined
          }
          currentUserId={session.userId}
        />
      </PageBody>
    </>
  )
}
