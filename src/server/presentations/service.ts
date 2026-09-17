import { createHash, randomBytes } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { tenantDb } from '@/lib/tenancy'
import { verifyPassword } from '@/lib/password'
import type { AppSession, TenantContext } from '@/lib/session'
import { PRESENTATION_COOKIE } from '@/lib/presentation-cookie'

/**
 * Handing the device over, properly.
 *
 * The problem this solves is not "the customer can see the bottom nav". It is
 * that the phone in the homeowner's hands is signed in as the technician, and
 * every customer that company has ever had is one typed URL away. Hiding the
 * navigation does nothing about that, and neither does trapping the back
 * button — both are decoration over a session that is still fully privileged.
 *
 * So Presentation Mode is a *different context*, not a different screen:
 *
 *  1. Starting one writes a row naming exactly one estimate, and sets a
 *     short-lived token in its own cookie.
 *  2. The presentation screen resolves that token. It never calls
 *     `requireSession()`, so it works — and works only — as itself.
 *  3. While the row is live, the technician's session is **suspended** for
 *     every other route. That check is keyed on the technician's user id and
 *     read from the database, so clearing the presentation cookie does not
 *     lift it. The middleware does the same check on the cookie first, so the
 *     common case never reaches a server component.
 *  4. Ending it takes the technician's password. A customer holding the phone
 *     does not have that, and cannot reach it by tapping.
 *
 * The result: typing `/today`, `/customers`, `/settings` or an API path into
 * the address bar while a presentation is live gets the presentation back, not
 * the application.
 */

/** Long enough for a conversation on a driveway, short enough to matter. */
const TTL_MINUTES = 45

/** The cookie's lifetime, kept in step with the row's. */
export const PRESENTATION_TTL_SECONDS = TTL_MINUTES * 60

export { PRESENTATION_COOKIE }

export class PresentationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PresentationError'
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface StartedPresentation {
  token: string
  expiresAt: Date
}

/**
 * Open a presentation for one estimate.
 *
 * Supersedes any other live presentation this technician has, because a device
 * shows one thing at a time and a forgotten session would keep their account
 * locked out.
 */
export async function startPresentation(
  session: AppSession,
  params: { estimateId: string; ipAddress?: string | null; userAgent?: string | null },
): Promise<StartedPresentation> {
  // Scoped read: an estimate from another company simply does not exist.
  const estimate = await session.db.estimate.findUnique({
    where: { id: params.estimateId },
    select: { id: true, status: true, options: { select: { id: true } } },
  })
  if (!estimate) throw new PresentationError('Estimate not found.')
  if (estimate.options.length === 0) {
    throw new PresentationError('Add the work to this estimate before presenting it.')
  }
  if (estimate.status === 'VOID' || estimate.status === 'EXPIRED') {
    throw new PresentationError('This estimate is closed.')
  }

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000)

  await prisma.$transaction(async (tx) => {
    await tx.presentationSession.updateMany({
      where: { technicianUserId: session.userId, endedAt: null },
      data: { endedAt: new Date(), endedReason: 'SUPERSEDED' },
    })
    await tx.presentationSession.create({
      data: {
        organizationId: session.organizationId,
        estimateId: params.estimateId,
        technicianUserId: session.userId,
        tokenHash: hashToken(token),
        expiresAt,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    })
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'presentation.started',
    entityType: 'Estimate',
    entityId: params.estimateId,
    after: { expiresAt: expiresAt.toISOString() },
  })

  return { token, expiresAt }
}

export interface ResolvedPresentation {
  id: string
  estimateId: string
  organizationId: string
  technicianUserId: string
  expiresAt: Date
  signedAt: Date | null
  signedOptionId: string | null
  /** Scoped to the presenting company, with no user attached. */
  context: TenantContext
}

/**
 * Resolve a token to exactly one presentation.
 *
 * Unknown, ended and expired all return null by the same path, so nothing can
 * be learned from the difference.
 */
export async function resolvePresentationToken(
  token: string | undefined | null,
): Promise<ResolvedPresentation | null> {
  if (!token || token.length < 20 || token.length > 200) return null

  const row = await prisma.presentationSession.findUnique({
    where: { tokenHash: hashToken(token) },
  })
  if (!row) return null
  if (row.endedAt) return null
  if (row.expiresAt <= new Date()) return null

  return {
    id: row.id,
    estimateId: row.estimateId,
    organizationId: row.organizationId,
    technicianUserId: row.technicianUserId,
    expiresAt: row.expiresAt,
    signedAt: row.signedAt,
    signedOptionId: row.signedOptionId,
    context: {
      organizationId: row.organizationId,
      userId: null,
      db: tenantDb(row.organizationId),
    },
  }
}

/** The presentation this request is inside, from its own cookie. */
export const currentPresentation = cache(async (): Promise<ResolvedPresentation | null> => {
  const jar = await cookies()
  return resolvePresentationToken(jar.get(PRESENTATION_COOKIE)?.value)
})

/**
 * Is this technician's account currently handed to a customer?
 *
 * The authoritative half of the lock. Keyed on the user rather than on a
 * cookie, so deleting the cookie — the obvious way to try to escape — changes
 * nothing: the row is still there and every authenticated route still bounces.
 *
 * Cached per request, so a page that resolves the session several times pays
 * for one indexed lookup.
 */
export const presentationLockFor = cache(
  async (userId: string): Promise<{ id: string } | null> => {
    const row = await prisma.presentationSession.findFirst({
      where: { technicianUserId: userId, endedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
      orderBy: { startedAt: 'desc' },
    })
    return row
  },
)

export interface EndResult {
  jobId: string | null
  estimateId: string
}

/**
 * Leave Presentation Mode.
 *
 * The password is the point. A confirmation dialog is something a curious
 * customer taps through; a press-and-hold is something they discover. The
 * technician's own password is the only thing on this screen that a person
 * holding someone else's phone cannot produce.
 *
 * Deliberately does not use the technician's session — the whole app is locked
 * out at this moment, including whatever would resolve it. The identity comes
 * from the presentation row itself.
 */
export async function endPresentation(params: {
  token: string
  password: string
}): Promise<EndResult> {
  const presentation = await resolvePresentationToken(params.token)
  if (!presentation) throw new PresentationError('This presentation has already ended.')

  const technician = await prisma.user.findUnique({
    where: { id: presentation.technicianUserId },
    select: { id: true, passwordHash: true },
  })
  if (!technician) throw new PresentationError('This presentation has already ended.')

  const ok = await verifyPassword(params.password, technician.passwordHash)
  if (!ok) throw new PresentationError('That password is not right.')

  const estimate = await prisma.estimate.findUnique({
    where: { id: presentation.estimateId },
    select: { id: true, jobId: true },
  })

  await prisma.presentationSession.updateMany({
    where: { id: presentation.id, endedAt: null },
    data: { endedAt: new Date(), endedReason: 'TECHNICIAN' },
  })

  await recordAudit({
    organizationId: presentation.organizationId,
    actorUserId: presentation.technicianUserId,
    action: 'presentation.ended',
    entityType: 'Estimate',
    entityId: presentation.estimateId,
  })

  return { jobId: estimate?.jobId ?? null, estimateId: presentation.estimateId }
}

/**
 * The recovery path, for a device whose presentation cookie is gone.
 *
 * A cookie can be lost — cleared, expired early, a browser tidying up — while
 * the row that suspends the technician's session is still live. Without this
 * they would be locked out of their own account until it timed out.
 *
 * It is not a way round the lock. It still takes their password, and it ends
 * only their own presentation; the caller establishes who they are from their
 * session, which a customer holding the phone does not have a reason or a way
 * to make say someone else.
 */
export async function endPresentationForTechnician(params: {
  technicianUserId: string
  password: string
}): Promise<EndResult | null> {
  const live = await prisma.presentationSession.findFirst({
    where: {
      technicianUserId: params.technicianUserId,
      endedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { startedAt: 'desc' },
  })
  if (!live) return null

  const technician = await prisma.user.findUnique({
    where: { id: params.technicianUserId },
    select: { passwordHash: true },
  })
  if (!technician) throw new PresentationError('This presentation has already ended.')

  if (!(await verifyPassword(params.password, technician.passwordHash))) {
    throw new PresentationError('That password is not right.')
  }

  const estimate = await prisma.estimate.findUnique({
    where: { id: live.estimateId },
    select: { jobId: true },
  })

  await prisma.presentationSession.updateMany({
    where: { id: live.id, endedAt: null },
    data: { endedAt: new Date(), endedReason: 'TECHNICIAN' },
  })

  await recordAudit({
    organizationId: live.organizationId,
    actorUserId: live.technicianUserId,
    action: 'presentation.ended',
    entityType: 'Estimate',
    entityId: live.estimateId,
  })

  return { jobId: estimate?.jobId ?? null, estimateId: live.estimateId }
}

/** Record that the customer signed, so the closing screen knows what for. */
export async function markPresentationSigned(params: {
  presentationId: string
  optionId: string
}): Promise<void> {
  await prisma.presentationSession.updateMany({
    where: { id: params.presentationId, endedAt: null },
    data: { signedAt: new Date(), signedOptionId: params.optionId },
  })
}

/**
 * Everything the customer is allowed to see, and nothing else.
 *
 * Selected field by field rather than spread, so adding an internal column to
 * a model later cannot quietly start showing it to a homeowner. There is no
 * cost, no margin, no SKU, no stock level, no technician note and no other
 * customer anywhere in this query.
 */
export async function loadPresentation(presentation: ResolvedPresentation) {
  const estimate = await presentation.context.db.estimate.findUnique({
    where: { id: presentation.estimateId },
    select: {
      id: true,
      number: true,
      displayNumber: true,
      title: true,
      status: true,
      presentation: true,
      customerMessage: true,
      termsText: true,
      taxRateBps: true,
      selectedOptionId: true,
      expiresAt: true,
      jobId: true,
      customer: { select: { firstName: true, lastName: true, companyName: true } },
      job: {
        select: {
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
                  // The finding's photos. The technician's note on it is
                  // written for the office and is not selected.
                  photos: {
                    where: { uploadStatus: 'READY' },
                    select: { id: true },
                    take: 2,
                  },
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
        where: { kind: 'ESTIMATE_APPROVAL' },
        orderBy: { signedAt: 'desc' },
        take: 1,
        select: { signerName: true, signedAt: true },
      },
    },
  })
  if (!estimate) return null

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: presentation.organizationId },
    select: {
      name: true,
      phone: true,
      website: true,
      logoStorageKey: true,
      logoUrl: true,
      currency: true,
    },
  })

  return { estimate, organization }
}

/**
 * A photo this presentation may serve.
 *
 * Narrow on purpose: only photos hanging off a finding of the inspection
 * behind the presented estimate. A photo id from anywhere else in the same
 * company — another customer's door, a different job — resolves to nothing,
 * so the brokered file route cannot be turned into a gallery by someone
 * holding the phone.
 */
export async function presentablePhoto(
  presentation: ResolvedPresentation,
  photoId: string,
): Promise<{ storageKey: string; contentType: string | null } | null> {
  const estimate = await presentation.context.db.estimate.findUnique({
    where: { id: presentation.estimateId },
    select: { jobId: true },
  })
  if (!estimate?.jobId) return null

  const photo = await presentation.context.db.photo.findFirst({
    where: {
      id: photoId,
      uploadStatus: 'READY',
      inspectionItem: { inspection: { jobId: estimate.jobId } },
    },
    select: { storageKey: true, contentType: true },
  })
  return photo ?? null
}

/** Housekeeping: close anything that ran out of time. */
export async function sweepPresentations(now = new Date()) {
  const { count } = await prisma.presentationSession.updateMany({
    where: { endedAt: null, expiresAt: { lte: now } },
    data: { endedAt: now, endedReason: 'EXPIRED' },
  })
  return count
}
