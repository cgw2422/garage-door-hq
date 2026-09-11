import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePermission } from '@/lib/session'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Card, Divider, ListRow, SectionHeading } from '@/components/ui/card'
import { CompanyForm, LaborCostForm, ReviewDestinationForm } from './forms'

export const metadata: Metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await requirePermission('settings:manage')

  const [organization, googleDestination, subscription] = await Promise.all([
    session.db.organization.findUniqueOrThrow({ where: { id: session.organizationId } }),
    session.db.reviewDestination.findUnique({
      where: {
        organizationId_provider: { organizationId: session.organizationId, provider: 'GOOGLE' },
      },
    }),
    session.db.subscription.findUnique({
      where: { organizationId: session.organizationId },
    }),
  ])

  return (
    <>
      <PageHeader title="Settings" subtitle={organization.name} backHref="/more" />
      <PageBody>
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
                city: organization.city ?? '',
                state: organization.state ?? '',
                postalCode: organization.postalCode ?? '',
                timezone: organization.timezone,
                taxRatePercent: (organization.defaultTaxRateBps / 100).toString(),
                defaultPaymentTermsDays: String(organization.defaultPaymentTermsDays),
              }}
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
              title="Subscription"
              subtitle={
                subscription
                  ? `${subscription.status.toLowerCase()} · $${(subscription.priceCents / 100).toFixed(2)}/month`
                  : 'No subscription on file'
              }
            />
          </Card>
        </div>

        <p className="px-1 text-center text-xs leading-relaxed text-ink-subtle">
          Team management, invoice branding and logo upload are not built yet — see{' '}
          <Link href="/more" className="font-semibold text-brand-600">
            More
          </Link>{' '}
          for what is available today.
        </p>
      </PageBody>
    </>
  )
}
