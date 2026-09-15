import type { Metadata } from 'next'
import type { Prisma } from '@prisma/client'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { formatEstimateNumber } from '@/lib/numbering'
import { layoutFor } from '@/lib/estimate-presentation'
import { READY_PHOTOS } from '@/server/media/photos'
import { isActionable } from '@/lib/inspection-template'
import { CustomerPresentation } from './presentation'

export const metadata: Metadata = { title: 'Presenting', robots: { index: false } }
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
 * Everything the customer should see, and nothing else.
 *
 * The selection here is the security boundary as much as the design: costs,
 * margins, SKUs, stock levels, internal notes and price-book controls are not
 * hidden with CSS, they are never loaded. A customer holding this device
 * cannot reach what was never sent to it.
 */
export default async function PresentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('estimate:write')
  const { id } = await params

  const estimate = await session.db.estimate.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      displayNumber: true,
      title: true,
      status: true,
      kind: true,
      presentation: true,
      customerMessage: true,
      termsText: true,
      taxRateBps: true,
      selectedOptionId: true,
      expiresAt: true,
      acceptedAt: true,
      jobId: true,
      customer: {
        select: { firstName: true, lastName: true, companyName: true },
      },
      job: {
        select: {
          id: true,
          property: {
            select: { line1: true, line2: true, city: true, state: true, postalCode: true },
          },
          door: {
            select: {
              nickname: true,
              positionLabel: true,
              widthInches: true,
              heightInches: true,
            },
          },
          inspections: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              summary: true,
              items: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  id: true,
                  label: true,
                  status: true,
                  // Photos of the fault are the most persuasive thing on the
                  // screen. The technician's own note is not shown — it is
                  // written for the office, not the homeowner.
                  photos: { where: READY_PHOTOS, select: { id: true }, take: 2 },
                },
              },
            },
          },
        },
      },
      options: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          tier: true,
          isRecommended: true,
          subtotalCents: true,
          taxCents: true,
          totalCents: true,
          items: {
            orderBy: { sortOrder: 'asc' },
            select: { id: true, name: true, description: true, quantity: true },
          },
        },
      },
      signatures: {
        orderBy: { signedAt: 'desc' },
        take: 1,
        select: { signerName: true, signedAt: true },
      },
    },
  })
  if (!estimate) notFound()

  const organization = await session.db.organization.findUniqueOrThrow({
    where: { id: session.organizationId },
    select: {
      name: true,
      phone: true,
      website: true,
      logoStorageKey: true,
      logoUrl: true,
      estimateTermsText: true,
    },
  })

  const property = estimate.job?.property
  const inspection = estimate.job?.inspections[0]

  return (
    <CustomerPresentation
      estimateId={estimate.id}
      jobId={estimate.jobId}
      estimateNumber={formatEstimateNumber(estimate)}
      currency={session.currency}
      company={{
        name: organization.name,
        phone: organization.phone,
        website: organization.website,
        logoSrc: organization.logoStorageKey
          ? '/api/files/logo'
          : (organization.logoUrl ?? null),
      }}
      customerName={
        estimate.customer.companyName ??
        `${estimate.customer.firstName} ${estimate.customer.lastName}`
      }
      serviceAddress={
        property
          ? [property.line1, property.line2, `${property.city}, ${property.state} ${property.postalCode}`]
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
      taxRateBps={estimate.taxRateBps}
      termsText={estimate.termsText ?? organization.estimateTermsText}
      expiresAt={estimate.expiresAt?.toISOString() ?? null}
      alreadySigned={
        estimate.status === 'ACCEPTED' && estimate.signatures[0]
          ? {
              signerName: estimate.signatures[0].signerName,
              signedAt: estimate.signatures[0].signedAt.toISOString(),
              optionId: estimate.selectedOptionId,
            }
          : null
      }
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
    />
  )
}
