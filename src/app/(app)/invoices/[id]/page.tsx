import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { roleCan } from '@/lib/rbac'
import { formatBps, formatCents } from '@/lib/money'
import { formatDate } from '@/server/jobs/queries'
import { formatInvoiceNumber, formatJobNumber } from '@/lib/numbering'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Card, CardHeader, Divider } from '@/components/ui/card'
import { InvoiceStatusChip } from '@/components/ui/status'
import { PaymentPanel } from './payment-panel'
import { SendDocument } from '@/components/app/send-document'
import { emailIsConfigured } from '@/server/email'
import { activeLinkFor } from '@/server/portal/service'
import { DocumentIcon } from '@/components/ui/icons'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const session = await requireSession()
  const { id } = await params
  const invoice = await session.db.invoice.findUnique({
    where: { id },
    select: { number: true, displayNumber: true },
  })
  return { title: invoice ? formatInvoiceNumber(invoice) : 'Invoice' }
}

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ collect?: string }>
}) {
  const session = await requireSession()
  const { id } = await params
  const { collect } = await searchParams

  const portalLink = await activeLinkFor(session, { invoiceId: id })
  const emailConfigured = emailIsConfigured()
  const invoice = await session.db.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      job: { select: { id: true, number: true, displayNumber: true } },
      items: { orderBy: { sortOrder: 'asc' } },
      payments: { orderBy: { receivedAt: 'desc' } },
    },
  })
  if (!invoice) notFound()

  const customerName =
    invoice.customer.companyName ??
    `${invoice.customer.firstName} ${invoice.customer.lastName}`

  return (
    <>
      <PageHeader
        title={formatInvoiceNumber(invoice)}
        subtitle={customerName}
        backHref={invoice.job ? `/jobs/${invoice.job.id}` : '/money'}
        action={<InvoiceStatusChip status={invoice.status} />}
      />
      <PageBody>
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
                Balance due
              </p>
              <p
                className={`num mt-1 text-3xl font-bold leading-none ${
                  invoice.balanceCents > 0 ? 'text-ink' : 'text-success-600'
                }`}
              >
                {formatCents(invoice.balanceCents, { currency: session.currency })}
              </p>
            </div>
            <div className="text-right text-sm text-ink-muted">
              {invoice.issuedAt ? (
                <p>Issued {formatDate(invoice.issuedAt, session.timezone)}</p>
              ) : null}
              {invoice.dueAt ? <p>Due {formatDate(invoice.dueAt, session.timezone)}</p> : null}
              {invoice.job ? (
                <Link
                  href={`/jobs/${invoice.job.id}`}
                  className="mt-1 inline-block font-semibold text-brand-600"
                >
                  {formatJobNumber(invoice.job)}
                </Link>
              ) : null}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Line Items" />
          <ul className="space-y-2.5">
            {invoice.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.9375rem] text-ink">{item.name}</p>
                  <p className="num text-xs text-ink-subtle">
                    {Number(item.quantity.toString())} ×{' '}
                    {formatCents(item.unitPriceCents, { currency: session.currency })}
                    {item.taxable ? '' : ' · not taxed'}
                  </p>
                </div>
                <span className="num shrink-0 text-[0.9375rem] font-semibold text-ink">
                  {formatCents(
                    Math.round(Number(item.quantity.toString()) * item.unitPriceCents),
                    { currency: session.currency },
                  )}
                </span>
              </li>
            ))}
          </ul>

          <Divider className="my-3" />

          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="num font-semibold text-ink">
                {formatCents(invoice.subtotalCents, { currency: session.currency })}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">
                Tax {formatBps(invoice.taxRateBps)}
                {invoice.taxRateOverridden ? ' (adjusted)' : ''}
              </dt>
              <dd className="num font-semibold text-ink">
                {formatCents(invoice.taxCents, { currency: session.currency })}
              </dd>
            </div>
            <div className="flex justify-between border-t border-hairline pt-1.5">
              <dt className="font-semibold text-ink">Total</dt>
              <dd className="num font-bold text-ink">
                {formatCents(invoice.totalCents, { currency: session.currency })}
              </dd>
            </div>
            {invoice.paidCents > 0 ? (
              <div className="flex justify-between">
                <dt className="text-ink-muted">Paid</dt>
                <dd className="num font-semibold text-success-600">
                  −{formatCents(invoice.paidCents, { currency: session.currency })}
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>

        {invoice.payments.length > 0 ? (
          <Card>
            <CardHeader title="Payments" />
            <ul className="space-y-2.5">
              {invoice.payments.map((payment) => (
                <li key={payment.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] text-ink">
                      {payment.method.charAt(0) + payment.method.slice(1).toLowerCase()}
                      {payment.reference ? ` · ${payment.reference}` : ''}
                    </p>
                    <p className="num text-xs text-ink-subtle">
                      {formatDate(payment.receivedAt, session.timezone)}
                      {payment.feeCents > 0
                        ? ` · ${formatCents(payment.feeCents, { currency: session.currency })} fee`
                        : ''}
                    </p>
                  </div>
                  <span className="num shrink-0 text-[0.9375rem] font-bold text-success-600">
                    {formatCents(payment.amountCents, { currency: session.currency })}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <SendDocument
            target="INVOICE"
            documentId={invoice.id}
            customerEmail={invoice.customer.email}
            customerName={customerName}
            emailConfigured={emailConfigured}
            existingLink={
              portalLink
                ? {
                    expiresAt: portalLink.expiresAt.toISOString(),
                    viewCount: portalLink.viewCount,
                    lastViewedAt: portalLink.lastViewedAt?.toISOString() ?? null,
                  }
                : null
            }
            label="Send to the customer"
          />

        <a
          href={`/api/documents/invoices/${invoice.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[--radius-control] border border-hairline-strong bg-surface font-semibold text-ink active:bg-surface-sunken"
        >
          <DocumentIcon className="h-[1.15em] w-[1.15em]" />
          Invoice PDF
        </a>

        <PaymentPanel
          invoiceId={invoice.id}
          balanceCents={invoice.balanceCents}
          currency={session.currency}
          status={invoice.status}
          openByDefault={collect === '1' && invoice.balanceCents > 0}
          canRecord={roleCan(session.role, 'payment:record')}
          canSend={roleCan(session.role, 'invoice:write')}
        />
      </PageBody>
    </>
  )
}
