import type { Metadata } from 'next'
import { requireSession } from '@/lib/session'
import { formatCents } from '@/lib/money'
import { formatDate } from '@/server/jobs/queries'
import { formatEstimateNumber } from '@/lib/numbering'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Card, Divider, EmptyState, ListRow } from '@/components/ui/card'
import { Chip } from '@/components/ui/status'
import { DocumentIcon } from '@/components/ui/icons'

export const metadata: Metadata = { title: 'Estimates' }
export const dynamic = 'force-dynamic'

export default async function EstimatesPage() {
  const session = await requireSession()

  const estimates = await session.db.estimate.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      customer: { select: { firstName: true, lastName: true, companyName: true } },
      selectedOption: { select: { totalCents: true, name: true } },
      options: { select: { totalCents: true } },
    },
  })

  return (
    <>
      <PageHeader title="Estimates" backHref="/more" />
      <PageBody>
        <Card padded={false}>
          {estimates.length === 0 ? (
            <EmptyState
              icon={<DocumentIcon />}
              title="No estimates yet"
              body="Estimates are built from a job — run an inspection and tap what you find."
            />
          ) : (
            estimates.map((estimate, index) => {
              const total =
                estimate.selectedOption?.totalCents ??
                Math.max(...estimate.options.map((option) => option.totalCents), 0)
              return (
                <div key={estimate.id}>
                  {index > 0 ? <Divider className="ml-4" /> : null}
                  <ListRow
                    href={`/estimates/${estimate.id}`}
                    title={
                      estimate.customer.companyName ??
                      `${estimate.customer.firstName} ${estimate.customer.lastName}`
                    }
                    subtitle={`${formatEstimateNumber(estimate.number)} · ${formatDate(estimate.createdAt, session.timezone)}`}
                    trailing={
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="num text-[0.9375rem] font-bold text-ink">
                          {formatCents(total, { currency: session.currency, showCents: false })}
                        </span>
                        <Chip
                          tone={
                            estimate.status === 'ACCEPTED'
                              ? 'success'
                              : estimate.status === 'DECLINED'
                                ? 'danger'
                                : estimate.status === 'DRAFT'
                                  ? 'neutral'
                                  : 'brand'
                          }
                        >
                          {estimate.status.charAt(0) + estimate.status.slice(1).toLowerCase()}
                        </Chip>
                      </div>
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
