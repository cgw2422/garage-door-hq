import { prisma } from '@/lib/db'
import { nextIdentifier } from '@/lib/numbering'
import { recordAudit } from '@/lib/audit'
import type { AppSession } from '@/lib/session'

export interface CreateJobInput {
  customerId: string
  propertyId: string
  doorId?: string | null
  jobTypeId?: string | null
  assignedToId?: string | null
  reportedIssue?: string | null
  scheduledStart?: Date | null
  scheduledEnd?: Date | null
}

/**
 * Create a job.
 *
 * Solo mode: when nobody is named, the job is assigned to whoever is creating
 * it. A one-person company should never have to answer "which technician?".
 */
export async function createJob(session: AppSession, input: CreateJobInput) {
  const [customer, property] = await Promise.all([
    session.db.customer.findUnique({ where: { id: input.customerId }, select: { id: true } }),
    session.db.property.findUnique({
      where: { id: input.propertyId },
      select: { id: true, customerId: true },
    }),
  ])
  if (!customer) throw new Error('Customer not found')
  if (!property || property.customerId !== input.customerId) {
    throw new Error('That address does not belong to this customer')
  }

  if (input.doorId) {
    const door = await session.db.door.findUnique({
      where: { id: input.doorId },
      select: { propertyId: true },
    })
    if (!door || door.propertyId !== input.propertyId) {
      throw new Error('That door is not at this address')
    }
  }

  // The two foreign keys that are easy to forget, because no form field asks
  // the user to type them. A job type belongs to one company's own list, and
  // work can only be given to someone on this team — the same rule the
  // schedule's assign action already enforces, applied at creation too.
  if (input.jobTypeId) {
    const jobType = await session.db.jobType.findUnique({
      where: { id: input.jobTypeId },
      select: { id: true },
    })
    if (!jobType) throw new Error('That job type does not exist')
  }

  if (input.assignedToId) {
    const membership = await session.db.membership.findFirst({
      where: { userId: input.assignedToId, isActive: true },
      select: { id: true },
    })
    if (!membership) throw new Error('That person is not on your team')
  }

  const job = await prisma.$transaction(async (tx) => {
    const { number, displayNumber } = await nextIdentifier(
      tx,
      session.organizationId,
      'JOB',
    )
    return tx.job.create({
      data: {
        organizationId: session.organizationId,
        number,
        displayNumber,
        customerId: input.customerId,
        propertyId: input.propertyId,
        doorId: input.doorId ?? null,
        jobTypeId: input.jobTypeId ?? null,
        assignedToId: input.assignedToId ?? session.userId,
        reportedIssue: input.reportedIssue?.trim() || null,
        scheduledStart: input.scheduledStart ?? null,
        scheduledEnd: input.scheduledEnd ?? null,
        status: input.scheduledStart ? 'SCHEDULED' : 'DRAFT',
      },
    })
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'job.created',
    entityType: 'Job',
    entityId: job.id,
    after: { number: job.number, customerId: input.customerId },
  })

  return job
}

const FORWARD: Record<string, string[]> = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['ON_MY_WAY', 'ARRIVED', 'IN_PROGRESS', 'WAITING', 'CANCELLED'],
  ON_MY_WAY: ['ARRIVED', 'IN_PROGRESS', 'WAITING', 'CANCELLED'],
  ARRIVED: ['IN_PROGRESS', 'WAITING', 'CANCELLED'],
  IN_PROGRESS: ['WAITING', 'CANCELLED'],
  WAITING: ['IN_PROGRESS', 'CANCELLED'],
}

/**
 * Move a job along its workflow. Completion is deliberately NOT reachable here
 * — it runs through `completeJob`, which has to move inventory, the passport
 * and the invoice in one transaction.
 */
export async function advanceJobStatus(
  session: AppSession,
  jobId: string,
  status: 'ON_MY_WAY' | 'ARRIVED' | 'IN_PROGRESS' | 'WAITING' | 'CANCELLED',
  options?: { cancelReason?: string },
) {
  const job = await session.db.job.findUnique({
    where: { id: jobId },
    select: { id: true, status: true },
  })
  if (!job) throw new Error('Job not found')

  const allowed = FORWARD[job.status] ?? []
  if (!allowed.includes(status)) {
    throw new Error(`A ${job.status.toLowerCase().replace('_', ' ')} job cannot move to ${status.toLowerCase().replace('_', ' ')}.`)
  }

  const now = new Date()
  return session.db.job.update({
    where: { id: jobId },
    data: {
      status,
      ...(status === 'ON_MY_WAY' ? { onMyWayAt: now } : {}),
      ...(status === 'ARRIVED' ? { arrivedAt: now } : {}),
      ...(status === 'IN_PROGRESS' ? { startedAt: now } : {}),
      ...(status === 'CANCELLED'
        ? { cancelledAt: now, cancelReason: options?.cancelReason ?? null }
        : {}),
    },
  })
}
