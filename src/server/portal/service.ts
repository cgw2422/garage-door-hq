import { createHash, randomBytes } from 'node:crypto'
import type { PortalLinkTarget } from '@prisma/client'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { tenantDb } from '@/lib/tenancy'
import type { AppSession, TenantContext } from '@/lib/session'

/**
 * Customer-facing document links.
 *
 * A customer never creates an account. The token is the whole credential, so
 * it is built accordingly:
 *
 *   - 256 bits from a CSPRNG, base64url. Not derived from any record, so it
 *     leaks nothing and cannot be guessed from a sequence.
 *   - Only the SHA-256 of the token is stored. A database dump does not yield
 *     working links.
 *   - Every link names exactly one document. Resolving it produces a tenant
 *     context scoped to that organization and an id for that document only —
 *     there is no path from a link to anything else the company owns.
 *   - Links expire, can be revoked, and record when they were last opened.
 *
 * No organization id, customer id or document id ever appears in a customer
 * URL. The token is the only thing in it.
 */

export class PortalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PortalError'
  }
}

const DEFAULT_TTL_DAYS = 30

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function portalUrlFor(target: PortalLinkTarget, token: string) {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.AUTH_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '')
  return `${base}/p/${target === 'ESTIMATE' ? 'e' : 'i'}/${token}`
}

export interface IssuedLink {
  token: string
  url: string
  expiresAt: Date
}

/**
 * Issue a link for one document, replacing any live link for it.
 *
 * Replacing rather than accumulating means "send a new link" also invalidates
 * the old one, which is what someone expects when they re-send after a mistake.
 */
export async function issuePortalLink(
  session: AppSession,
  input: {
    target: PortalLinkTarget
    estimateId?: string
    invoiceId?: string
    ttlDays?: number
  },
): Promise<IssuedLink> {
  if (input.target === 'ESTIMATE' && !input.estimateId) {
    throw new PortalError('An estimate link needs an estimate.')
  }
  if (input.target === 'INVOICE' && !input.invoiceId) {
    throw new PortalError('An invoice link needs an invoice.')
  }

  // Scoped reads: a document from another organization simply is not found.
  if (input.estimateId) {
    const estimate = await session.db.estimate.findUnique({
      where: { id: input.estimateId },
      select: { id: true },
    })
    if (!estimate) throw new PortalError('Estimate not found.')
  }
  if (input.invoiceId) {
    const invoice = await session.db.invoice.findUnique({
      where: { id: input.invoiceId },
      select: { id: true },
    })
    if (!invoice) throw new PortalError('Invoice not found.')
  }

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(
    Date.now() + (input.ttlDays ?? DEFAULT_TTL_DAYS) * 24 * 60 * 60 * 1000,
  )

  await prisma.$transaction(async (tx) => {
    await tx.portalLink.updateMany({
      where: {
        organizationId: session.organizationId,
        ...(input.estimateId ? { estimateId: input.estimateId } : {}),
        ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    })

    await tx.portalLink.create({
      data: {
        organizationId: session.organizationId,
        target: input.target,
        estimateId: input.estimateId ?? null,
        invoiceId: input.invoiceId ?? null,
        tokenHash: hashToken(token),
        expiresAt,
      },
    })
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'portal.link_issued',
    entityType: input.target === 'ESTIMATE' ? 'Estimate' : 'Invoice',
    entityId: input.estimateId ?? input.invoiceId ?? null,
    after: { expiresAt: expiresAt.toISOString() },
  })

  return { token, url: portalUrlFor(input.target, token), expiresAt }
}

export interface ResolvedPortalLink {
  linkId: string
  target: PortalLinkTarget
  estimateId: string | null
  invoiceId: string | null
  organizationId: string
  /** Scoped to the link's organization, with no user attached. */
  context: TenantContext
}

/**
 * Resolve a token to exactly one document.
 *
 * Returns null for anything that is not a live link — unknown, expired,
 * revoked — without distinguishing between them to the caller, so a prober
 * learns nothing from the difference.
 */
export async function resolvePortalToken(
  token: string,
  options?: { countView?: boolean },
): Promise<ResolvedPortalLink | null> {
  if (!token || token.length < 20 || token.length > 200) return null

  const link = await prisma.portalLink.findUnique({
    where: { tokenHash: hashToken(token) },
  })
  if (!link) return null
  if (link.revokedAt) return null
  if (link.expiresAt < new Date()) return null

  if (options?.countView !== false) {
    await prisma.portalLink.update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    })
  }

  return {
    linkId: link.id,
    target: link.target,
    estimateId: link.estimateId,
    invoiceId: link.invoiceId,
    organizationId: link.organizationId,
    context: {
      organizationId: link.organizationId,
      userId: null,
      db: tenantDb(link.organizationId),
    },
  }
}

export async function revokePortalLink(session: AppSession, linkId: string) {
  await session.db.portalLink.update({
    where: { id: linkId },
    data: { revokedAt: new Date() },
  })
}

/** Live links for a document, for the "share" panel. */
export async function activeLinkFor(
  session: AppSession,
  input: { estimateId?: string; invoiceId?: string },
) {
  return session.db.portalLink.findFirst({
    where: {
      revokedAt: null,
      expiresAt: { gt: new Date() },
      ...(input.estimateId ? { estimateId: input.estimateId } : {}),
      ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * The estimate a customer is allowed to see through a link, and nothing else.
 *
 * Explicitly selected rather than spread, so adding an internal field to the
 * model later cannot quietly start leaking it to customers.
 */
export async function loadPortalEstimate(link: ResolvedPortalLink) {
  if (!link.estimateId) return null

  const estimate = await link.context.db.estimate.findUnique({
    where: { id: link.estimateId },
    select: {
      id: true,
      number: true,
      displayNumber: true,
      title: true,
      status: true,
      customerMessage: true,
      termsText: true,
      taxRateBps: true,
      selectedOptionId: true,
      expiresAt: true,
      acceptedAt: true,
      customer: { select: { firstName: true, lastName: true, companyName: true } },
      options: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          tier: true,
          name: true,
          description: true,
          isRecommended: true,
          subtotalCents: true,
          taxCents: true,
          totalCents: true,
          items: {
            orderBy: { sortOrder: 'asc' },
            select: { id: true, name: true, description: true, quantity: true, unitPriceCents: true },
          },
        },
      },
      signatures: {
        where: { kind: 'ESTIMATE_APPROVAL' },
        orderBy: { signedAt: 'desc' },
        take: 1,
        select: { signerName: true, signedAt: true },
      },
    },
  })
  if (!estimate) return null

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: link.organizationId },
    // Only what a customer should see, plus the timezone so dates render in
    // the company's own day rather than the server's.
    select: { name: true, phone: true, email: true, currency: true, timezone: true },
  })

  return { estimate, organization }
}

export async function loadPortalInvoice(link: ResolvedPortalLink) {
  if (!link.invoiceId) return null

  const invoice = await link.context.db.invoice.findUnique({
    where: { id: link.invoiceId },
    select: {
      id: true,
      number: true,
      displayNumber: true,
      status: true,
      issuedAt: true,
      dueAt: true,
      subtotalCents: true,
      taxCents: true,
      taxRateBps: true,
      totalCents: true,
      paidCents: true,
      balanceCents: true,
      notesToCustomer: true,
      termsText: true,
      customer: { select: { firstName: true, lastName: true, companyName: true } },
      items: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, description: true, quantity: true, unitPriceCents: true },
      },
      payments: {
        where: { status: 'SUCCEEDED' },
        orderBy: { receivedAt: 'asc' },
        select: { method: true, amountCents: true, receivedAt: true },
      },
    },
  })
  if (!invoice) return null

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: link.organizationId },
    // Only what a customer should see, plus the timezone so dates render in
    // the company's own day rather than the server's.
    select: { name: true, phone: true, email: true, currency: true, timezone: true },
  })

  return { invoice, organization }
}
