import type { Metadata } from 'next'
import { formatEstimateNumber } from '@/lib/numbering'
import { clientAddress, consumeRateLimit } from '@/lib/rate-limit'
import { loadPortalEstimate, resolvePortalToken } from '@/server/portal/service'
import { Logo } from '@/components/ui/logo'
import { Card } from '@/components/ui/card'
import { PortalEstimate } from './portal-estimate'

export const metadata: Metadata = { title: 'Your estimate', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function PortalEstimatePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Token guessing is the only attack surface here, so every lookup counts.
  const address = await clientAddress()
  const allowed = await consumeRateLimit('portalToken', `portal:${address}`)
  if (!allowed.ok) return <LinkProblem title="Too many attempts" body="Try again shortly." />

  const link = await resolvePortalToken(token)
  if (!link || link.target !== 'ESTIMATE') {
    return (
      <LinkProblem
        title="This link isn't available"
        body="It may have expired or been replaced. Contact the company that sent it for a new one."
      />
    )
  }

  const loaded = await loadPortalEstimate(link)
  if (!loaded) {
    return <LinkProblem title="This estimate is no longer available" body="" />
  }

  const { estimate, organization } = loaded
  const signature = estimate.signatures[0] ?? null

  return (
    <PortalEstimate
      token={token}
      companyName={organization.name}
      companyPhone={organization.phone}
      currency={organization.currency}
      estimateNumber={formatEstimateNumber(estimate.number)}
      title={estimate.title}
      customerName={
        estimate.customer.companyName ??
        `${estimate.customer.firstName} ${estimate.customer.lastName}`
      }
      customerMessage={estimate.customerMessage}
      termsText={estimate.termsText}
      status={estimate.status}
      selectedOptionId={estimate.selectedOptionId}
      signature={
        signature
          ? { signerName: signature.signerName, signedAt: signature.signedAt.toISOString() }
          : null
      }
      options={estimate.options.map((option) => ({
        id: option.id,
        tier: option.tier,
        name: option.name,
        description: option.description,
        isRecommended: option.isRecommended,
        totalCents: option.totalCents,
        subtotalCents: option.subtotalCents,
        taxCents: option.taxCents,
        items: option.items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          quantity: Number(item.quantity.toString()),
          lineCents: Math.round(Number(item.quantity.toString()) * item.unitPriceCents),
        })),
      }))}
    />
  )
}

function LinkProblem({ title, body }: { title: string; body: string }) {
  return (
    <div className="pt-10">
      <div className="mb-6 flex justify-center">
        <Logo tone="light" />
      </div>
      <Card>
        <h1 className="text-lg font-bold text-ink">{title}</h1>
        {body ? <p className="mt-1 text-sm text-ink-muted">{body}</p> : null}
      </Card>
      <p className="mt-4 text-center text-xs text-ink-subtle">Garage Door HQ</p>
    </div>
  )
}
