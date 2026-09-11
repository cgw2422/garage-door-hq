import type { Metadata } from 'next'
import { requireSession } from '@/lib/session'
import { formatCents } from '@/lib/money'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { ButtonLink } from '@/components/ui/button'
import { Card, Divider, EmptyState, ListRow } from '@/components/ui/card'
import { PlusIcon, UsersIcon } from '@/components/ui/icons'
import { CustomerSearch } from './search'

export const metadata: Metadata = { title: 'Customers' }
export const dynamic = 'force-dynamic'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await requireSession()
  const { q } = await searchParams
  const query = (q ?? '').trim()

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
              { email: { contains: query, mode: 'insensitive' } },
              { properties: { some: { line1: { contains: query, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 100,
    include: {
      properties: { select: { line1: true, city: true }, take: 1 },
      _count: { select: { properties: true, jobs: true } },
    },
  })

  const balances = await session.db.invoice.groupBy({
    by: ['customerId'],
    where: { archivedAt: null, status: { in: ['SENT', 'PARTIAL', 'PAST_DUE'] } },
    _sum: { balanceCents: true },
  })
  const balanceByCustomer = new Map(
    balances.map((row) => [row.customerId, row._sum.balanceCents ?? 0]),
  )

  return (
    <>
      <PageHeader
        title="Customers"
        action={
          <ButtonLink href="/customers/new" size="sm" icon={<PlusIcon />}>
            New
          </ButtonLink>
        }
      />
      <PageBody>
        <CustomerSearch initialQuery={query} />

        <Card padded={false}>
          {customers.length === 0 ? (
            <EmptyState
              icon={<UsersIcon />}
              title={query ? 'No matches' : 'No customers yet'}
              body={
                query
                  ? 'Try a phone number, an address, or part of a name.'
                  : 'Add your first customer and their doors start building history immediately.'
              }
            />
          ) : (
            customers.map((customer, index) => {
              const balance = balanceByCustomer.get(customer.id) ?? 0
              const property = customer.properties[0]
              return (
                <div key={customer.id}>
                  {index > 0 ? <Divider className="ml-4" /> : null}
                  <ListRow
                    href={`/customers/${customer.id}`}
                    title={
                      customer.companyName ?? `${customer.firstName} ${customer.lastName}`
                    }
                    subtitle={
                      property
                        ? `${property.line1}, ${property.city}${customer._count.properties > 1 ? ` +${customer._count.properties - 1} more` : ''}`
                        : `${customer._count.jobs} jobs`
                    }
                    trailing={
                      balance > 0 ? (
                        <span className="num text-sm font-bold text-warning-600">
                          {formatCents(balance, { currency: session.currency, showCents: false })}
                        </span>
                      ) : null
                    }
                  />
                </div>
              )
            })
          )}
        </Card>
      </PageBody>
    </>
  )
}
