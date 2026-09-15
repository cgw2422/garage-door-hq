import type { Metadata } from 'next'
import type { SubscriptionStatus } from '@prisma/client'
import { requirePermission } from '@/lib/session'
import { formatCents } from '@/lib/money'
import { formatDate } from '@/server/jobs/queries'
import { PLAN, loadBillingOverview } from '@/server/billing/service'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Alert } from '@/components/ui/alert'
import { Card, CardHeader, Divider, SectionHeading } from '@/components/ui/card'
import { Chip } from '@/components/ui/status'
import { ManageBillingButton, StartSubscriptionButton } from './billing-panel'
import { refreshBillingAction } from './actions'

export const metadata: Metadata = { title: 'Billing' }
export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIALING: 'Free trial',
  ACTIVE: 'Active',
  PAST_DUE: 'Payment failed',
  CANCELLED: 'Cancelled',
  COMPLIMENTARY: 'Complimentary',
  EXPIRED: 'Ended',
}

const STATUS_TONE: Record<SubscriptionStatus, 'brand' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  TRIALING: 'brand',
  ACTIVE: 'success',
  PAST_DUE: 'danger',
  CANCELLED: 'neutral',
  COMPLIMENTARY: 'success',
  EXPIRED: 'neutral',
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>
}) {
  const session = await requirePermission('subscription:manage')
  const { checkout } = await searchParams

  // Returning from Checkout. Confirm against Stripe rather than believing the
  // redirect — anyone can type this URL.
  if (checkout && checkout !== 'cancelled') {
    await refreshBillingAction(checkout)
  }

  const billing = await loadBillingOverview(session)
  const access = billing.access
  const readOnly = access.level === 'read_only'
  const canSubscribe =
    billing.billingConfigured &&
    !billing.priceMissing &&
    billing.status !== 'ACTIVE' &&
    !access.isComplimentary

  return (
    <>
      <PageHeader
        title="Billing"
        subtitle={session.organizationName}
        backHref="/settings"
        action={<Chip tone={STATUS_TONE[billing.status]}>{STATUS_LABEL[billing.status]}</Chip>}
      />
      <PageBody>
        {checkout === 'cancelled' ? (
          <Alert tone="info">
            Checkout was cancelled. Nothing was charged and nothing has changed.
          </Alert>
        ) : null}

        {!billing.billingConfigured ? (
          <Alert tone="warning" title="Billing is not connected yet">
            Card payments for Garage Door HQ are not switched on in this deployment. Your trial
            and your data are unaffected.
          </Alert>
        ) : billing.priceMissing ? (
          <Alert tone="warning" title="Billing is not finished being set up">
            The subscription price has not been configured. Contact support — nothing is wrong
            with your account.
          </Alert>
        ) : null}

        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
                Your plan
              </p>
              <p className="mt-1 text-lg font-bold text-ink">{PLAN.name}</p>
            </div>
            <p className="num shrink-0 text-2xl font-bold leading-none text-ink">
              {formatCents(PLAN.priceCents, { currency: PLAN.currency })}
              <span className="text-sm font-semibold text-ink-muted">/mo</span>
            </p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">{PLAN.blurb}</p>

          <Divider className="my-3.5" />

          <dl className="space-y-2 text-sm">
            <Row label="Status" value={STATUS_LABEL[billing.status]} />

            {access.isTrialing && billing.trialEndsAt ? (
              <Row
                label="Trial ends"
                value={`${formatDate(billing.trialEndsAt, session.timezone)}${
                  access.trialDaysLeft !== null
                    ? ` · ${access.trialDaysLeft} ${access.trialDaysLeft === 1 ? 'day' : 'days'} left`
                    : ''
                }`}
              />
            ) : null}

            {access.isComplimentary ? (
              <Row
                label="Complimentary"
                value={
                  billing.complimentaryUntil
                    ? `Through ${formatDate(billing.complimentaryUntil, session.timezone)}`
                    : 'No end date'
                }
              />
            ) : null}

            {billing.status === 'ACTIVE' && billing.currentPeriodEnd ? (
              <Row
                label={billing.cancelAtPeriodEnd ? 'Access ends' : 'Next payment'}
                value={formatDate(billing.currentPeriodEnd, session.timezone)}
              />
            ) : null}

            {billing.startedAt ? (
              <Row label="Subscribed since" value={formatDate(billing.startedAt, session.timezone)} />
            ) : null}

            {billing.cancelledAt ? (
              <Row label="Cancelled" value={formatDate(billing.cancelledAt, session.timezone)} />
            ) : null}

            {billing.cardLast4 ? (
              <Row
                label="Payment method"
                value={`${titleCase(billing.cardBrand ?? 'Card')} ending ${billing.cardLast4}`}
              />
            ) : null}
          </dl>
        </Card>

        {billing.cancelAtPeriodEnd && billing.currentPeriodEnd ? (
          <Alert tone="warning" title="Your subscription is set to end">
            You&apos;ll keep full access until{' '}
            {formatDate(billing.currentPeriodEnd, session.timezone)}. You can turn it back on
            from Manage billing any time before then.
          </Alert>
        ) : null}

        {readOnly ? (
          <Alert tone="danger" title="Your account is read-only">
            {access.restrictionReason}
          </Alert>
        ) : null}

        {access.isPastDue ? (
          <Alert tone="danger" title="Your last payment did not go through">
            You still have full access. Stripe will retry your card automatically — update your
            payment method to make sure it goes through.
          </Alert>
        ) : null}

        <div className="space-y-3">
          {billing.status !== 'ACTIVE' ? (
            <StartSubscriptionButton
              disabled={!canSubscribe}
              reason={
                access.isComplimentary
                  ? 'You have complimentary access. There is nothing to pay for right now.'
                  : !billing.billingConfigured
                    ? 'Billing is not connected in this deployment yet.'
                    : billing.priceMissing
                      ? 'The plan price is not configured yet.'
                      : null
              }
            />
          ) : null}

          {billing.providerCustomerId ? (
            <ManageBillingButton disabled={!billing.billingConfigured} />
          ) : null}
        </div>

        <div>
          <SectionHeading>What&apos;s included</SectionHeading>
          <Card>
            <ul className="space-y-2 text-sm leading-relaxed text-ink-muted">
              <li>Unlimited customers, jobs, doors and estimates</li>
              <li>Every technician on your team — no per-user fee</li>
              <li>Door Passports, inspections and signed estimates</li>
              <li>Inventory, invoicing, PDFs and customer links</li>
              <li>Email delivery for estimates, invoices and receipts</li>
            </ul>
          </Card>
        </div>

        <Card>
          <CardHeader title="Taking payments from your customers" />
          <p className="text-sm leading-relaxed text-ink-muted">
            That is separate from this subscription and uses your own Stripe account, so the
            money goes straight to you.
          </p>
          <a
            href="/settings/payments"
            className="mt-3 flex h-11 w-full items-center justify-center rounded-[--radius-control] border border-hairline-strong bg-surface font-semibold text-ink active:bg-surface-sunken"
          >
            Customer payments
          </a>
        </Card>
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

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
