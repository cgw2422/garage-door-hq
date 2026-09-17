import type { Metadata } from 'next'
import type { Prisma } from '@prisma/client'
import { redirect } from 'next/navigation'
import { layoutFor } from '@/lib/estimate-presentation'
import { formatEstimateNumber } from '@/lib/numbering'
import { isActionable } from '@/lib/inspection-template'
import { currentPresentation, loadPresentation } from '@/server/presentations/service'
import { CustomerPresentation } from './presentation'
import { EndedPresentation } from './ended'

export const metadata: Metadata = {
  title: 'Your Estimate',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

/** "Front Garage · 16′ × 7′" — how a homeowner would point at it. */
function describeDoor(
  door: {
    nickname: string | null
    positionLabel: string | null
    widthInches: Prisma.Decimal | null
    heightInches: Prisma.Decimal | null
  } | null,
): string | null {
  if (!door) return null
  const feet = (value: Prisma.Decimal | null) =>
    value === null ? null : `${Math.round(Number(value.toString()) / 12)}′`
  const size =
    door.widthInches && door.heightInches
      ? `${feet(door.widthInches)} × ${feet(door.heightInches)}`
      : null
  const parts = [door.nickname ?? door.positionLabel, size].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * The one screen a presentation can reach.
 *
 * There is no `requireSession()` here, and no id in the URL. The presentation
 * is resolved from its own token, in its own cookie, and it names exactly one
 * estimate — so this page has no way to address another document even if
 * something asked it to.
 *
 * What it selects is the security boundary as much as the design. Costs,
 * margins, SKUs, stock levels and technician notes are not hidden with CSS;
 * they are never loaded. A customer holding this device cannot reach what was
 * never sent to it.
 */
export default async function PresentPage() {
  const presentation = await currentPresentation()

  // No live presentation. Either it expired while the phone was in a pocket,
  // or somebody arrived here without one — which, given the middleware, means
  // their cookie is stale. Offer the way back rather than a dead end.
  if (!presentation) return <EndedPresentation />

  const loaded = await loadPresentation(presentation)
  if (!loaded) redirect('/today')

  const { estimate, organization } = loaded
  const property = estimate.job?.property
  const inspection = estimate.job?.inspections[0]

  return (
    <CustomerPresentation
      estimateNumber={formatEstimateNumber(estimate)}
      currency={organization.currency}
      company={{
        name: organization.name,
        phone: organization.phone,
        website: organization.website,
        logoSrc: organization.logoStorageKey ? '/api/files/logo' : (organization.logoUrl ?? null),
      }}
      customerName={
        estimate.customer.companyName ??
        `${estimate.customer.firstName} ${estimate.customer.lastName}`
      }
      serviceAddress={
        property
          ? [
              property.line1,
              property.line2,
              `${property.city}, ${property.state} ${property.postalCode}`,
            ]
              .filter(Boolean)
              .join(' · ')
          : null
      }
      door={describeDoor(estimate.job?.door ?? null)}
      diagnosis={estimate.customerMessage ?? inspection?.summary ?? null}
      findings={(inspection?.items ?? [])
        .filter((item) => isActionable(item.status))
        .map((item) => ({
          id: item.id,
          label: item.label,
          photoIds: item.photos.map((photo) => photo.id),
        }))}
      title={estimate.title}
      layout={layoutFor(estimate.options, estimate.presentation)}
      options={estimate.options.map((option) => ({
        id: option.id,
        name: option.name,
        description: option.description,
        tier: option.tier,
        isRecommended: option.isRecommended,
        subtotalCents: option.subtotalCents,
        taxCents: option.taxCents,
        totalCents: option.totalCents,
        items: option.items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          quantity: Number(item.quantity.toString()),
        })),
      }))}
      taxRateBps={estimate.taxRateBps}
      termsText={estimate.termsText}
      expiresAt={estimate.expiresAt?.toISOString() ?? null}
      alreadySigned={
        presentation.signedAt
          ? {
              signerName: estimate.signatures[0]?.signerName ?? 'the customer',
              optionId: presentation.signedOptionId,
            }
          : null
      }
    />
  )
}
