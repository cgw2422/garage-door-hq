import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { formatDoorSize } from '@/lib/measure'
import { formatEstimateNumber, formatInvoiceNumber, formatJobNumber } from '@/lib/numbering'
import { storage } from '@/server/storage'
import type {
  DocumentLine,
  DocumentOption,
  DocumentParty,
  EstimateDocument,
  InvoiceDocument,
} from './model'

/** Objects are private; a PDF has to carry its own copy of the bytes. */
async function objectDataUri(key: string | null | undefined): Promise<string | null> {
  if (!key) return null
  try {
    const head = await storage().head(key)
    if (!head) return null
    // 2 MB is generous for a logo or a signature and bounds a hostile object.
    if (head.byteSize > 2 * 1024 * 1024) return null

    const bytes = await storage().readHead(key, head.byteSize)
    if (!bytes) return null

    const contentType = head.contentType ?? 'image/png'
    return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`
  } catch {
    return null
  }
}

function companyParty(org: {
  name: string
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  phone: string | null
  email: string | null
  website: string | null
}): DocumentParty {
  const cityLine = [org.city, org.state].filter(Boolean).join(', ')
  return {
    name: org.name,
    lines: [
      org.addressLine1,
      org.addressLine2,
      [cityLine, org.postalCode].filter(Boolean).join(' '),
    ].filter((line): line is string => Boolean(line && line.trim())),
    phone: org.phone,
    email: org.email,
    website: org.website,
  }
}

function addressLines(property: {
  line1?: string | null
  line2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  nickname?: string | null
} | null): string[] | null {
  if (!property?.line1) return null
  const cityLine = [property.city, property.state].filter(Boolean).join(', ')
  return [
    property.line1,
    property.line2,
    [cityLine, property.postalCode].filter(Boolean).join(' '),
  ].filter((line): line is string => Boolean(line && line.trim()))
}

/**
 * Build the estimate document.
 *
 * When a frozen version exists it is the source, full stop. Live rows are used
 * only for a draft that has never been sent, and the result is marked as such.
 */
export async function buildEstimateDocument(params: {
  organizationId: string
  estimateId: string
}): Promise<EstimateDocument | null> {
  const estimate = await prisma.estimate.findFirst({
    where: { id: params.estimateId, organizationId: params.organizationId },
    include: {
      customer: true,
      options: {
        orderBy: { sortOrder: 'asc' },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      },
      versions: { orderBy: { version: 'desc' } },
      signatures: {
        where: { kind: 'ESTIMATE_APPROVAL' },
        orderBy: { signedAt: 'desc' },
        take: 1,
      },
      job: {
        select: {
          number: true,
          displayNumber: true,
          property: true,
          door: {
            select: {
              number: true,
              nickname: true,
              positionLabel: true,
              manufacturer: true,
              model: true,
              widthInches: true,
              heightInches: true,
            },
          },
        },
      },
    },
  })
  if (!estimate) return null

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: params.organizationId },
  })

  const signatureRow = estimate.signatures[0] ?? null

  // A signature names the exact version it approved. That version wins over
  // anything newer, so a PDF of a signed estimate is always what was signed.
  const version =
    (signatureRow?.estimateVersionId
      ? estimate.versions.find((entry) => entry.id === signatureRow.estimateVersionId)
      : undefined) ?? estimate.versions[0]

  const [logoDataUri, signatureDataUri] = await Promise.all([
    objectDataUri(organization.logoStorageKey),
    signatureRow ? objectDataUri(signatureRow.imageKey) : Promise.resolve(null),
  ])

  const signature = signatureRow
    ? {
        signerName: signatureRow.signerName,
        signedAt: signatureRow.signedAt.toISOString(),
        imageDataUri: signatureDataUri,
        documentHash: signatureRow.documentHash,
        versionNumber: version?.version ?? null,
      }
    : null

  if (version) {
    const snapshot = version.snapshot as SnapshotShape

    return {
      kind: 'estimate',
      number: formatEstimateNumber({
        number: snapshot.estimateNumber ?? estimate.number,
        displayNumber: snapshot.estimateDisplayNumber ?? estimate.displayNumber,
      }),
      title: snapshot.title ?? estimate.title ?? 'Estimate',
      issuedAt: (estimate.sentAt ?? version.createdAt).toISOString(),
      expiresAt: snapshot.expiresAt ?? null,
      status: estimate.status,
      isDraft: false,
      versionNumber: version.version,
      company: companyParty(snapshot.organization ?? organization),
      logoDataUri,
      customer: customerParty(snapshot.customer),
      serviceAddress: addressLines(snapshot.property ?? estimate.job?.property ?? null),
      doorLine: doorLine(snapshot.door),
      jobReference: snapshot.jobNumber
        ? formatJobNumber({
            number: snapshot.jobNumber,
            displayNumber: snapshot.jobDisplayNumber ?? null,
          })
        : null,
      customerMessage: snapshot.customerMessage ?? null,
      termsText: snapshot.termsText ?? null,
      taxRateBps: snapshot.taxRateBps ?? estimate.taxRateBps,
      options: (snapshot.options ?? []).map((option) => ({
        tier: option.tier,
        name: option.name,
        description: option.description ?? null,
        isRecommended: option.isRecommended,
        // The snapshot has no ids, so the selection is matched by tier — which
        // is unique within an estimate.
        isSelected: selectedTier(estimate, option.tier),
        lines: (option.items ?? []).map(snapshotLine),
        subtotalCents: option.subtotalCents,
        discountCents: option.discountCents,
        taxCents: option.taxCents,
        totalCents: option.totalCents,
      })),
      signature,
      currency: organization.currency,
    }
  }

  // No version yet: this has never left the building.
  return {
    kind: 'estimate',
    number: formatEstimateNumber(estimate),
    title: estimate.title ?? 'Estimate',
    issuedAt: estimate.createdAt.toISOString(),
    expiresAt: estimate.expiresAt?.toISOString() ?? null,
    status: estimate.status,
    isDraft: true,
    versionNumber: null,
    company: companyParty(organization),
    logoDataUri,
    customer: customerParty(estimate.customer),
    serviceAddress: addressLines(estimate.job?.property ?? null),
    doorLine: estimate.job?.door
      ? doorLine({
          label:
            estimate.job.door.nickname ??
            estimate.job.door.positionLabel ??
            `D-${estimate.job.door.number}`,
          manufacturer: estimate.job.door.manufacturer,
          model: estimate.job.door.model,
          widthInches: estimate.job.door.widthInches,
          heightInches: estimate.job.door.heightInches,
        })
      : null,
    jobReference: estimate.job ? formatJobNumber(estimate.job) : null,
    customerMessage: estimate.customerMessage,
    termsText: estimate.termsText,
    taxRateBps: estimate.taxRateBps,
    options: estimate.options.map((option) => ({
      tier: option.tier,
      name: option.name,
      description: option.description,
      isRecommended: option.isRecommended,
      isSelected: estimate.selectedOptionId === option.id,
      lines: option.items.map((item) => ({
        name: item.name,
        description: item.description,
        sku: item.sku,
        quantity: Number(item.quantity.toString()),
        unitPriceCents: item.unitPriceCents,
        lineCents: Math.round(Number(item.quantity.toString()) * item.unitPriceCents),
        taxable: item.taxable,
      })),
      subtotalCents: option.subtotalCents,
      discountCents: option.discountCents,
      taxCents: option.taxCents,
      totalCents: option.totalCents,
    })) satisfies DocumentOption[],
    signature,
    currency: organization.currency,
  }
}

interface SnapshotShape {
  estimateNumber?: number
  estimateDisplayNumber?: string | null
  title?: string | null
  customerMessage?: string | null
  termsText?: string | null
  taxRateBps?: number
  expiresAt?: string | null
  jobNumber?: number | null
  jobDisplayNumber?: string | null
  organization?: Parameters<typeof companyParty>[0]
  customer?: {
    firstName?: string
    lastName?: string
    companyName?: string | null
    email?: string | null
    phone?: string | null
  }
  property?: Parameters<typeof addressLines>[0]
  door?: {
    label?: string
    manufacturer?: string | null
    model?: string | null
    widthInches?: unknown
    heightInches?: unknown
  } | null
  options?: Array<{
    tier: string
    name: string
    description?: string | null
    isRecommended: boolean
    subtotalCents: number
    discountCents: number
    taxCents: number
    totalCents: number
    items?: Array<{
      name: string
      description?: string | null
      sku?: string | null
      quantity: string | number
      unitPriceCents: number
      taxable: boolean
    }>
  }>
}

function customerParty(customer: SnapshotShape['customer'] | null | undefined): DocumentParty {
  if (!customer) return { name: 'Customer', lines: [] }
  return {
    name:
      customer.companyName ??
      `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() ??
      'Customer',
    lines: [],
    phone: customer.phone ?? null,
    email: customer.email ?? null,
  }
}

function doorLine(door: SnapshotShape['door']): string | null {
  if (!door) return null
  const size = formatDoorSize(
    door.widthInches as never,
    door.heightInches as never,
  )
  return [door.label, size !== '—' ? size : null, door.manufacturer, door.model]
    .filter(Boolean)
    .join(' · ')
}

function snapshotLine(item: NonNullable<NonNullable<SnapshotShape['options']>[number]['items']>[number]): DocumentLine {
  const quantity = Number(item.quantity)
  return {
    name: item.name,
    description: item.description ?? null,
    sku: item.sku ?? null,
    quantity,
    unitPriceCents: item.unitPriceCents,
    lineCents: Math.round(quantity * item.unitPriceCents),
    taxable: item.taxable,
  }
}

/** Snapshots carry no ids; tiers are unique per estimate, so match on those. */
function selectedTier(
  estimate: Prisma.EstimateGetPayload<{ include: { options: true } }>,
  tier: string,
): boolean {
  if (!estimate.selectedOptionId) return false
  const selected = estimate.options.find((option) => option.id === estimate.selectedOptionId)
  return selected?.tier === tier
}

export async function buildInvoiceDocument(params: {
  organizationId: string
  invoiceId: string
}): Promise<InvoiceDocument | null> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, organizationId: params.organizationId },
    include: {
      customer: true,
      items: { orderBy: { sortOrder: 'asc' } },
      payments: { where: { status: 'SUCCEEDED' }, orderBy: { receivedAt: 'asc' } },
      estimate: { select: { number: true, displayNumber: true } },
      job: {
        select: {
          number: true,
          displayNumber: true,
          property: true,
          door: {
            select: {
              number: true,
              nickname: true,
              positionLabel: true,
              manufacturer: true,
              model: true,
              widthInches: true,
              heightInches: true,
            },
          },
        },
      },
    },
  })
  if (!invoice) return null

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: params.organizationId },
  })
  const logoDataUri = await objectDataUri(organization.logoStorageKey)

  return {
    kind: 'invoice',
    number: formatInvoiceNumber(invoice),
    issuedAt: invoice.issuedAt?.toISOString() ?? null,
    dueAt: invoice.dueAt?.toISOString() ?? null,
    status: invoice.status,
    company: companyParty(organization),
    logoDataUri,
    customer: {
      name:
        invoice.customer.companyName ??
        `${invoice.customer.firstName} ${invoice.customer.lastName}`,
      lines: [],
      phone: invoice.customer.phone,
      email: invoice.customer.email,
    },
    serviceAddress: addressLines(invoice.job?.property ?? null),
    doorLine: invoice.job?.door
      ? doorLine({
          label:
            invoice.job.door.nickname ??
            invoice.job.door.positionLabel ??
            `D-${invoice.job.door.number}`,
          manufacturer: invoice.job.door.manufacturer,
          model: invoice.job.door.model,
          widthInches: invoice.job.door.widthInches,
          heightInches: invoice.job.door.heightInches,
        })
      : null,
    jobReference: invoice.job ? formatJobNumber(invoice.job) : null,
    estimateReference: invoice.estimate ? formatEstimateNumber(invoice.estimate) : null,
    notesToCustomer: invoice.notesToCustomer,
    termsText: invoice.termsText,
    taxRateBps: invoice.taxRateBps,
    lines: invoice.items.map((item) => ({
      name: item.name,
      description: item.description,
      sku: item.sku,
      quantity: Number(item.quantity.toString()),
      unitPriceCents: item.unitPriceCents,
      lineCents: Math.round(Number(item.quantity.toString()) * item.unitPriceCents),
      taxable: item.taxable,
    })),
    subtotalCents: invoice.subtotalCents,
    discountCents: invoice.discountCents,
    taxCents: invoice.taxCents,
    totalCents: invoice.totalCents,
    paidCents: invoice.paidCents,
    balanceCents: invoice.balanceCents,
    payments: invoice.payments.map((payment) => ({
      method: payment.method,
      receivedAt: payment.receivedAt.toISOString(),
      amountCents: payment.amountCents,
      reference: payment.reference,
    })),
    currency: organization.currency,
  }
}
