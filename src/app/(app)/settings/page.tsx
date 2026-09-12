import type { Metadata } from 'next'
import type { SubscriptionStatus } from '@prisma/client'
import { requirePermission } from '@/lib/session'
import { roleCan } from '@/lib/rbac'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Card, Divider, ListRow, SectionHeading } from '@/components/ui/card'
import {
  CompanyForm,
  LaborCostForm,
  LogoManager,
  NumberingForm,
  ReviewDestinationForm,
} from './forms'

export const metadata: Metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

const SUBSCRIPTION_LABEL: Record<SubscriptionStatus, string> = {
  TRIALING: 'Free trial',
  ACTIVE: 'Active',
  PAST_DUE: 'Payment failed',
  CANCELLED: 'Cancelled',
  COMPLIMENTARY: 'Complimentary',
  EXPIRED: 'Ended',
}

export default async function SettingsPage() {
  const session = await requirePermission('settings:manage')
  // Billing is the owner's alone, so an admin sees the status without a way in.
  const canManageBilling = roleCan(session.role, 'subscription:manage')

  const [organization, googleDestination, subscription, sequences] = await Promise.all([
    session.db.organization.findUniqueOrThrow({ where: { id: session.organizationId } }),
    session.db.reviewDestination.findUnique({
      where: {
        organizationId_provider: { organizationId: session.organizationId, provider: 'GOOGLE' },
      },
    }),
    session.db.subscription.findUnique({ where: { organizationId: session.organizationId } }),
    session.db.numberSequence.findMany({ orderBy: { entity: 'asc' } }),
  ])

  return (
    <>
      <PageHeader title="Settings" subtitle={organization.name} backHref="/more" />
      <PageBody>
        <div>
          <SectionHeading>Branding</SectionHeading>
          <Card>
            <LogoManager hasLogo={organization.logoStorageKey !== null} />
          </Card>
        </div>

        <div>
          <SectionHeading>Company</SectionHeading>
          <Card>
            <CompanyForm
              defaults={{
                name: organization.name,
                phone: organization.phone ?? '',
                email: organization.email ?? '',
                website: organization.website ?? '',
                addressLine1: organization.addressLine1 ?? '',
                addressLine2: organization.addressLine2 ?? '',
                city: organization.city ?? '',
                state: organization.state ?? '',
                postalCode: organization.postalCode ?? '',
                timezone: organization.timezone,
                currency: organization.currency,
                taxRatePercent: (organization.defaultTaxRateBps / 100).toString(),
                defaultPaymentTermsDays: String(organization.defaultPaymentTermsDays),
                estimateTermsText: organization.estimateTermsText ?? '',
                invoiceTermsText: organization.invoiceTermsText ?? '',
              }}
              businessHours={
                (organization.businessHours as Record<string, unknown> | null) ?? null
              }
            />
          </Card>
        </div>

        <div>
          <SectionHeading>Job Costing</SectionHeading>
          <Card>
            <LaborCostForm
              enabled={organization.laborCostEnabled}
              hourly={
                organization.laborCostPerHourCents
                  ? (organization.laborCostPerHourCents / 100).toFixed(2)
                  : ''
              }
            />
          </Card>
        </div>

        <div>
          <SectionHeading>Reviews</SectionHeading>
          <Card>
            <ReviewDestinationForm
              url={googleDestination?.url ?? ''}
              label={googleDestination?.label ?? ''}
              enabled={organization.reviewRequestEnabled}
            />
          </Card>
        </div>

        <div>
          <SectionHeading>Numbering</SectionHeading>
          <Card>
            <NumberingForm
              sequences={sequences.map((sequence) => ({
                entity: sequence.entity,
                nextValue: sequence.nextValue,
                prefix: sequence.prefix,
              }))}
            />
          </Card>
        </div>

        <div>
          <SectionHeading>More</SectionHeading>
          <Card padded={false}>
            <ListRow
              href="/settings/price-book"
              title="Price Book"
              subtitle="Parts, labor and reusable packages"
            />
            <Divider className="ml-4" />
            <ListRow
              href="/settings/team"
              title="Team Members"
              subtitle="Invite people and set their roles"
            />
            <Divider className="ml-4" />
            <ListRow
              href={canManageBilling ? '/settings/billing' : undefined}
              title="Subscription"
              subtitle={
                subscription
                  ? `${SUBSCRIPTION_LABEL[subscription.status]} · $${(subscription.priceCents / 100).toFixed(2)}/month`
                  : 'No subscription on file'
              }
            />
            {canManageBilling ? (
              <>
                <Divider className="ml-4" />
                <ListRow
                  href="/settings/payments"
                  title="Customer Payments"
                  subtitle="Take card payments on your invoices"
                />
              </>
            ) : null}
          </Card>
        </div>

        <p className="px-1 text-center text-xs leading-relaxed text-ink-subtle">
          Changing settings never alters an estimate a customer signed or an invoice already
          issued — each document keeps the terms, tax rate and totals it was created with.
        </p>
      </PageBody>
    </>
  )
}
