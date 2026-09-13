import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePlatformStaff } from '@/lib/session'
import { formatCents } from '@/lib/money'
import { prisma } from '@/lib/db'
import { affiliateSummaries } from '@/server/billing/commissions'
import { Card, CardHeader, EmptyState, SectionHeading } from '@/components/ui/card'
import { DataGrid, DataPoint } from '@/components/ui/stat'
import { Chip } from '@/components/ui/status'
import { appBaseUrlUnchecked } from '@/lib/app-url'

export const metadata: Metadata = { title: 'Affiliates' }
export const dynamic = 'force-dynamic'

/**
 * What each partner has brought in, and what they are owed.
 *
 * Deliberately read-only and deliberately not a payouts screen. The gap
 * between "owed" and "paid" is where a person decides to send money, and this
 * product does not move money to partners on a schedule.
 */
export default async function AffiliatesPage() {
  await requirePlatformStaff()

  const summaries = await affiliateSummaries()

  const totals = summaries.reduce(
    (sum, affiliate) => ({
      companies: sum.companies + affiliate.referredCompanies,
      active: sum.active + affiliate.activeSubscriptions,
      mrr: sum.mrr + affiliate.attributedMrrCents,
      owed: sum.owed + affiliate.owedCents,
    }),
    { companies: 0, active: 0, mrr: 0, owed: 0 },
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">Affiliates</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Attribution is captured at signup and never changes afterwards.
        </p>
      </div>

      <Card>
        <CardHeader title="Across all partners" />
        <DataGrid>
          <DataPoint label="Referred companies" value={String(totals.companies)} />
          <DataPoint label="Paying" value={String(totals.active)} />
          <DataPoint label="Attributed MRR" value={formatCents(totals.mrr)} />
          <DataPoint label="Commission owed" value={formatCents(totals.owed)} />
        </DataGrid>
      </Card>

      {summaries.length === 0 ? (
        <Card>
          <EmptyState
            title="No affiliates yet"
            body="Create an affiliate record with a code, then share a link ending in ?ref=THATCODE."
          />
        </Card>
      ) : (
        summaries.map((affiliate) => (
          <div key={affiliate.affiliateId}>
            <SectionHeading>{affiliate.affiliateName}</SectionHeading>
            <Card>
              <CardHeader
                title={affiliate.affiliateCode}
                action={<Chip tone="brand">{affiliate.commissionPercent}% recurring</Chip>}
              />
              <DataGrid>
                <DataPoint
                  label="Referred companies"
                  value={String(affiliate.referredCompanies)}
                />
                <DataPoint label="Paying now" value={String(affiliate.activeSubscriptions)} />
                <DataPoint
                  label="Attributed MRR"
                  value={formatCents(affiliate.attributedMrrCents)}
                />
                <DataPoint
                  label="Est. monthly commission"
                  value={formatCents(affiliate.estimatedMonthlyCommissionCents)}
                />
                <DataPoint label="Owed" value={formatCents(affiliate.owedCents)} />
                <DataPoint label="Paid to date" value={formatCents(affiliate.paidCents)} />
              </DataGrid>

              <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
                Share{' '}
                <span className="font-mono">
                  {appBaseUrlUnchecked()}/?ref=
                  {affiliate.affiliateCode}
                </span>
              </p>
            </Card>

            <ReferredCompanies code={affiliate.affiliateCode} />
          </div>
        ))
      )}

      <p className="text-xs leading-relaxed text-ink-subtle">
        Commission is recorded per paid billing period and is never paid out automatically.
        Nothing here moves money.
      </p>
    </div>
  )
}

/** The companies behind a partner's numbers. */
async function ReferredCompanies({ code }: { code: string }) {
  const referrals = await prisma.referral.findMany({
    where: { code },
    orderBy: { attributedAt: 'desc' },
    take: 25,
    select: {
      organizationId: true,
      attributedAt: true,
      organization: {
        select: {
          name: true,
          subscription: { select: { status: true, priceCents: true } },
        },
      },
    },
  })

  if (referrals.length === 0) return null

  return (
    <Card padded={false} className="mt-3">
      {referrals.map((referral, index) => (
        <Link
          key={referral.organizationId}
          href={`/admin/companies/${referral.organizationId}`}
          className={`flex items-center justify-between gap-3 px-4 py-3 active:bg-surface-sunken ${
            index > 0 ? 'border-t border-hairline' : ''
          }`}
        >
          <span className="min-w-0">
            <span className="block truncate text-[0.9375rem] font-semibold text-ink">
              {referral.organization.name}
            </span>
            <span className="block text-xs text-ink-subtle">
              {referral.attributedAt.toISOString().slice(0, 10)}
            </span>
          </span>
          <Chip
            tone={
              referral.organization.subscription?.status === 'ACTIVE'
                ? 'success'
                : referral.organization.subscription?.status === 'PAST_DUE'
                  ? 'danger'
                  : 'neutral'
            }
          >
            {(referral.organization.subscription?.status ?? 'none').replace('_', ' ').toLowerCase()}
          </Chip>
        </Link>
      ))}
    </Card>
  )
}
