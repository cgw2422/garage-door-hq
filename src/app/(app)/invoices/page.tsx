import type { Metadata } from 'next'
import { requireSession } from '@/lib/session'
import { formatCents } from '@/lib/money'
import { formatDate } from '@/server/jobs/queries'
import { formatInvoiceNumber } from '@/lib/numbering'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Card, Divider, EmptyState, ListRow } from '@/components/ui/card'
import { InvoiceStatusChip } from '@/components/ui/status'
import { CardIcon } from '@/components/ui/icons'

export const metadata: Metadata = { title: 'Invoices' }
export const dynamic = 'force-dynamic'

export default async function InvoicesPage() {
  const session = await requireSession()

  const invoices = await session.db.invoice.findMany({
    where: { archivedAt: null },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 50,
    include: { customer: { select: { firstName: true, lastName: true, companyName: true } } },
  })

  return (
    <>
      <PageHeader title="Invoices" backHref="/more" />
      <PageBody>
        <Card padded={false}>
          {invoices.length === 0 ? (
            <EmptyState
              icon={<CardIcon />}
              title="No invoices yet"
              body="Completing a job generates the invoice from what the customer approved."
            />
          ) : (
            invoices.map((invoice, index) => (
              <div key={invoice.id}>
                {index > 0 ? <Divider className="ml-4" /> : null}
                <ListRow
                  href={`/invoices/${invoice.id}`}
                  title={
                    invoice.customer.companyName ??
                    `${invoice.customer.firstName} ${invoice.customer.lastName}`
                  }
                  subtitle={`${formatInvoiceNumber(invoice.number)}${
                    invoice.issuedAt
                      ? ` · ${formatDate(invoice.issuedAt, session.timezone)}`
                      : ''
                  }`}
                  trailing={
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="num text-[0.9375rem] font-bold text-ink">
                        {formatCents(
                          invoice.balanceCents > 0 ? invoice.balanceCents : invoice.totalCents,
                          { currency: session.currency },
                        )}
                      </span>
                      <InvoiceStatusChip status={invoice.status} />
                    </div>
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
