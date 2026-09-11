import type { Metadata } from 'next'
import { formatBps, formatCents } from '@/lib/money'
import { formatInvoiceNumber } from '@/lib/numbering'
import { clientAddress, consumeRateLimit } from '@/lib/rate-limit'
import { loadPortalInvoice, resolvePortalToken } from '@/server/portal/service'
import { Logo } from '@/components/ui/logo'
import { Alert } from '@/components/ui/alert'
import { Card, Divider } from '@/components/ui/card'
import { Chip } from '@/components/ui/status'
import { DocumentIcon } from '@/components/ui/icons'

export const metadata: Metadata = { title: 'Your invoice', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function PortalInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const address = await clientAddress()
  const allowed = await consumeRateLimit('portalToken', `portal:${address}`)
  if (!allowed.ok) {
    return (
      <Card>
        <h1 className="text-lg font-bold text-ink">Too many attempts</h1>
        <p className="mt-1 text-sm text-ink-muted">Try again shortly.</p>
      </Card>
    )
  }

  const link = await resolvePortalToken(token)
  if (!link || link.target !== 'INVOICE') {
    return (
      <div className="pt-10">
        <div className="mb-6 flex justify-center">
          <Logo tone="light" />
        </div>
        <Card>
          <h1 className="text-lg font-bold text-ink">This link isn&apos;t available</h1>
          <p className="mt-1 text-sm text-ink-muted">
            It may have expired or been replaced. Contact the company that sent it for a new
            one.
          </p>
        </Card>
      </div>
    )
  }

  const loaded = await loadPortalInvoice(link)
  if (!loaded) {
    return (
      <Card>
        <h1 className="text-lg font-bold text-ink">This invoice is no longer available</h1>
      </Card>
    )
  }

  const { invoice, organization } = loaded
  const currency = organization.currency
  const customerName =
    invoice.customer.companyName ??
    `${invoice.customer.firstName} ${invoice.customer.lastName}`

  return (
    <>
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-ink">{organization.name}</p>
          {organization.phone ? (
            <a href={`tel:${organization.phone}`} className="num text-sm text-brand-600">
              {organization.phone}
            </a>
          ) : null}
        </div>
        <Logo tone="light" />
      </header>

      <Card className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
              Invoice {formatInvoiceNumber(invoice.number)}
            </p>
            <p
              className={`num mt-1 text-3xl font-bold leading-none ${
                invoice.balanceCents > 0 ? 'text-ink' : 'text-success-600'
              }`}
            >
              {formatCents(invoice.balanceCents, { currency })}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {invoice.balanceCents > 0 ? 'Balance due' : 'Paid in full'} · {customerName}
            </p>
          </div>
          <Chip
            tone={
              invoice.status === 'PAID'
                ? 'success'
                : invoice.status === 'PAST_DUE'
                  ? 'danger'
                  : invoice.status === 'PARTIAL'
                    ? 'warning'
                    : 'brand'
            }
          >
            {invoice.status.replace('_', ' ').toLowerCase()}
          </Chip>
        </div>

        {invoice.dueAt ? (
          <p className="mt-2 text-sm text-ink-muted">
            Due {new Date(invoice.dueAt).toLocaleDateString()}
          </p>
        ) : null}
      </Card>

      <Card className="mb-4">
        <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
          Work performed
        </p>
        <ul className="space-y-2.5">
          {invoice.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.9375rem] text-ink">{item.name}</p>
                {item.description ? (
                  <p className="text-xs text-ink-subtle">{item.description}</p>
                ) : null}
                <p className="num text-xs text-ink-subtle">
                  {Number(item.quantity.toString())} ×{' '}
                  {formatCents(item.unitPriceCents, { currency })}
                </p>
              </div>
              <span className="num shrink-0 text-[0.9375rem] font-semibold text-ink">
                {formatCents(
                  Math.round(Number(item.quantity.toString()) * item.unitPriceCents),
                  { currency },
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
              {formatCents(invoice.subtotalCents, { currency })}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Tax {formatBps(invoice.taxRateBps)}</dt>
            <dd className="num font-semibold text-ink">
              {formatCents(invoice.taxCents, { currency })}
            </dd>
          </div>
          <div className="flex justify-between border-t border-hairline pt-1.5">
            <dt className="font-semibold text-ink">Total</dt>
            <dd className="num font-bold text-ink">
              {formatCents(invoice.totalCents, { currency })}
            </dd>
          </div>
          {invoice.paidCents > 0 ? (
            <div className="flex justify-between">
              <dt className="text-ink-muted">Paid</dt>
              <dd className="num font-semibold text-success-600">
                −{formatCents(invoice.paidCents, { currency })}
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>

      {invoice.payments.length > 0 ? (
        <Card className="mb-4">
          <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
            Payments received
          </p>
          <ul className="space-y-2">
            {invoice.payments.map((payment, index) => (
              <li key={index} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink-muted">
                  {payment.method.charAt(0) + payment.method.slice(1).toLowerCase()} ·{' '}
                  {new Date(payment.receivedAt).toLocaleDateString()}
                </span>
                <span className="num font-semibold text-success-600">
                  {formatCents(payment.amountCents, { currency })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {invoice.notesToCustomer ? (
        <Alert tone="info" className="mb-4">
          {invoice.notesToCustomer}
        </Alert>
      ) : null}

      <a
        href={`/api/p/i/${token}/pdf`}
        target="_blank"
        rel="noreferrer"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-[--radius-control] border border-hairline-strong bg-surface font-semibold text-ink"
      >
        <DocumentIcon className="h-[1.15em] w-[1.15em]" />
        Download a PDF copy
      </a>

      {invoice.balanceCents > 0 ? (
        <p className="mt-4 text-center text-sm leading-relaxed text-ink-muted">
          To pay, contact {organization.name}
          {organization.phone ? ` on ${organization.phone}` : ''}. Online card payment is coming
          soon.
        </p>
      ) : null}

      <p className="mt-6 text-center text-xs text-ink-subtle">This link is private to you.</p>
    </>
  )
}
