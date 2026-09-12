import type { Metadata } from 'next'
import { requirePermission } from '@/lib/session'
import { formatDate } from '@/server/jobs/queries'
import { loadConnectStatus } from '@/server/billing/connect'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Alert } from '@/components/ui/alert'
import { Card, CardHeader, SectionHeading } from '@/components/ui/card'
import { Chip } from '@/components/ui/status'
import { ConnectStripeButton, DisconnectButton } from './connect-panel'
import { refreshConnectAction } from './actions'

export const metadata: Metadata = { title: 'Customer payments' }
export const dynamic = 'force-dynamic'

export default async function PaymentsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; refresh?: string }>
}) {
  const session = await requirePermission('subscription:manage')
  const { connected } = await searchParams

  // Coming back from onboarding proves nothing on its own — ask Stripe.
  if (connected === '1') await refreshConnectAction()

  const status = await loadConnectStatus(session)
  const live = status.connected && status.chargesEnabled

  return (
    <>
      <PageHeader
        title="Customer payments"
        subtitle="Card payment on your invoices"
        backHref="/settings"
        action={
          live ? (
            <Chip tone="success">Live</Chip>
          ) : status.connected ? (
            <Chip tone="warning">Finishing setup</Chip>
          ) : (
            <Chip tone="neutral">Off</Chip>
          )
        }
      />
      <PageBody>
        {!status.configured ? (
          <Alert tone="warning" title="Payments are not available in this deployment">
            Card payment has not been switched on here yet. You can still record cash, check and
            card payments by hand on every invoice.
          </Alert>
        ) : null}

        <Card>
          <CardHeader title="How this works" />
          <p className="text-sm leading-relaxed text-ink-muted">
            You connect your own Stripe account. When a customer pays an invoice, the money goes
            straight into <strong className="font-semibold text-ink">your</strong> Stripe balance
            and out to your bank on your own schedule. Garage Door HQ never holds your money and
            takes nothing from the transaction.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-ink-muted">
            <li>Your customer&apos;s statement shows {session.organizationName}.</li>
            <li>Stripe&apos;s processing fee comes out of your balance, as it always does.</li>
            <li>Refunds and disputes are yours, in your own Stripe dashboard.</li>
          </ul>
        </Card>

        {status.connected && !status.chargesEnabled ? (
          <Alert tone="warning" title="Stripe still needs a few details">
            {status.requirementsNote ??
              'Finish your Stripe onboarding to start taking card payments.'}{' '}
            Until then, the Pay button stays hidden from your customers.
          </Alert>
        ) : null}

        {live ? (
          <Card>
            <CardHeader title="Connected" />
            <dl className="space-y-2 text-sm">
              <Row label="Card payments" value="Enabled" />
              <Row label="Payouts" value={status.payoutsEnabled ? 'Enabled' : 'Pending'} />
              {status.connectedAt ? (
                <Row
                  label="Connected"
                  value={formatDate(status.connectedAt, session.timezone)}
                />
              ) : null}
            </dl>
            <a
              href="https://dashboard.stripe.com/"
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex h-11 w-full items-center justify-center rounded-[--radius-control] border border-hairline-strong bg-surface font-semibold text-ink active:bg-surface-sunken"
            >
              Open your Stripe dashboard
            </a>
          </Card>
        ) : null}

        <div className="space-y-3">
          {!live ? (
            <ConnectStripeButton
              label={status.connected ? 'Finish Stripe setup' : 'Connect Stripe'}
              disabled={!status.configured}
            />
          ) : null}
          {status.connected ? <DisconnectButton /> : null}
        </div>

        <div>
          <SectionHeading>Without this</SectionHeading>
          <Card>
            <p className="text-sm leading-relaxed text-ink-muted">
              Everything else still works exactly the same. You can send invoices, and record
              cash, check or card payments taken elsewhere by hand. Connecting Stripe only adds
              a Pay button to the link your customer already gets.
            </p>
          </Card>
        </div>
      </PageBody>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-semibold text-ink">{value}</dd>
    </div>
  )
}
