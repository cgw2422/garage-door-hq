import type { ApprovalMethod } from '@prisma/client'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import type { AppSession, TenantContext } from '@/lib/session'
import { storeSignatureImage } from '@/server/media/signatures'
import { EstimateError, recalcEstimateTx } from './builder'
import { snapshotEstimate } from './documents'

/**
 * Presenting an estimate and getting it signed.
 *
 * The rule this file exists to enforce: a customer signs a specific version of
 * a specific document. Sending freezes a version; signing freezes another and
 * records its content hash against the signature. Nothing after that can edit
 * what they agreed to — `assertEditable` in builder.ts refuses.
 */

export async function sendEstimate(session: AppSession, estimateId: string) {
  const estimate = await session.db.estimate.findUnique({
    where: { id: estimateId },
    include: { options: { include: { items: true } } },
  })
  if (!estimate) throw new EstimateError('Estimate not found')
  if (estimate.options.length === 0) {
    throw new EstimateError('Add at least one option before sending this estimate.')
  }
  if (estimate.options.every((option) => option.items.length === 0)) {
    throw new EstimateError('Every option is empty. Add the work before sending.')
  }
  if (estimate.status === 'ACCEPTED') return estimate

  // Recalculate before freezing so the snapshot can never disagree with the
  // lines it contains.
  await prisma.$transaction((tx) => recalcEstimateTx(tx, estimateId))
  await snapshotEstimate({
    organizationId: session.organizationId,
    estimateId,
    createdById: session.userId,
  })

  const updated = await session.db.estimate.update({
    where: { id: estimateId },
    data: { status: 'SENT', sentAt: estimate.sentAt ?? new Date() },
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'estimate.sent',
    entityType: 'Estimate',
    entityId: estimateId,
    after: { number: estimate.number },
  })

  return updated
}

/**
 * Choose an option.
 *
 * Takes a tenant context rather than a session because a customer following a
 * secure link runs exactly this code, with the same tenant boundary and no
 * user attached.
 */
export async function selectEstimateOption(
  session: TenantContext,
  params: { estimateId: string; optionId: string },
) {
  const option = await prisma.estimateOption.findUnique({
    where: { id: params.optionId },
    include: { estimate: { select: { id: true, organizationId: true, status: true } } },
  })
  if (
    !option ||
    option.estimateId !== params.estimateId ||
    option.estimate.organizationId !== session.organizationId
  ) {
    throw new EstimateError('Option not found')
  }
  if (option.estimate.status === 'ACCEPTED') {
    throw new EstimateError('This estimate has already been signed.')
  }

  return session.db.estimate.update({
    where: { id: params.estimateId },
    data: {
      selectedOptionId: params.optionId,
      viewedAt: new Date(),
      status: option.estimate.status === 'DRAFT' ? 'SENT' : option.estimate.status,
    },
  })
}

export interface SignEstimateInput {
  estimateId: string
  optionId: string
  signerName: string
  signatureDataUrl: string
  ipAddress?: string | null
  userAgent?: string | null
  /**
   * Which channel the customer approved through.
   *
   * The two channels are the same document, the same options, the same
   * prices, the same terms and the same frozen version — only the screen
   * differs. This is recorded so the history can say which, not because
   * anything downstream treats them differently.
   */
  approvalMethod: ApprovalMethod
}

/**
 * Capture the customer's approval.
 *
 * Runs for a technician holding their phone out in a driveway and for a
 * customer following a portal link at their kitchen table. The actor differs;
 * the guarantees do not.
 *
 * Order matters: totals are recalculated, a version is frozen, and only then is
 * the signature written against that version's content hash. If anything fails
 * the whole thing rolls back and no signature exists for a document nobody saw.
 */
export async function signEstimate(session: TenantContext, input: SignEstimateInput) {
  const estimate = await session.db.estimate.findUnique({
    where: { id: input.estimateId },
    include: { options: { select: { id: true } }, job: { select: { id: true } } },
  })
  if (!estimate) throw new EstimateError('Estimate not found')
  if (estimate.status === 'ACCEPTED') {
    throw new EstimateError('This estimate has already been signed.')
  }
  if (!estimate.options.some((option) => option.id === input.optionId)) {
    throw new EstimateError('Choose one of the options before signing.')
  }
  if (!input.signerName.trim()) throw new EstimateError('Enter the name of the person signing.')

  await prisma.$transaction((tx) => recalcEstimateTx(tx, input.estimateId))

  // Written before the transaction because object storage cannot participate in
  // it. A stranded image is harmless; a signature row pointing at nothing is not.
  const imageKey = await storeSignatureImage(session, input.signatureDataUrl)

  const version = await snapshotEstimate({
    organizationId: session.organizationId,
    estimateId: input.estimateId,
    createdById: session.userId,
  })

  const signedAt = new Date()

  const result = await prisma.$transaction(async (tx) => {
    const signature = await tx.signature.create({
      data: {
        organizationId: session.organizationId,
        kind: 'ESTIMATE_APPROVAL',
        signerName: input.signerName.trim(),
        imageKey,
        signedAt,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        estimateId: input.estimateId,
        estimateVersionId: version.id,
        jobId: estimate.jobId,
        documentHash: version.contentHash,
        approvalMethod: input.approvalMethod,
      },
    })

    const updated = await tx.estimate.update({
      where: { id: input.estimateId },
      data: {
        status: 'ACCEPTED',
        selectedOptionId: input.optionId,
        acceptedAt: signedAt,
        approvalMethod: input.approvalMethod,
        viewedAt: estimate.viewedAt ?? signedAt,
        // An estimate approved on the technician's own device was never sent,
        // and saying it was would be a lie the timeline repeats forever.
        sentAt:
          estimate.sentAt ?? (input.approvalMethod === 'REMOTE_LINK' ? signedAt : null),
      },
    })

    return { signature, estimate: updated, version }
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'estimate.signed',
    entityType: 'Estimate',
    entityId: input.estimateId,
    after: {
      optionId: input.optionId,
      signerName: input.signerName.trim(),
      version: version.version,
      contentHash: version.contentHash,
    },
  })

  return result
}

export async function declineEstimate(session: AppSession, estimateId: string) {
  const estimate = await session.db.estimate.findUnique({ where: { id: estimateId } })
  if (!estimate) throw new EstimateError('Estimate not found')
  if (estimate.status === 'ACCEPTED') {
    throw new EstimateError('This estimate has already been signed.')
  }

  return session.db.estimate.update({
    where: { id: estimateId },
    data: { status: 'DECLINED', declinedAt: new Date() },
  })
}
