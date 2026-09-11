import type { Prisma } from '@prisma/client'
import { prisma } from './db'

export interface AuditEntry {
  organizationId?: string | null
  actorUserId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  before?: Prisma.InputJsonValue | null
  after?: Prisma.InputJsonValue | null
  ipAddress?: string | null
  userAgent?: string | null
}

/**
 * Record a privileged or financially meaningful action. Pass a transaction
 * client when the log entry must live or die with the change it describes.
 */
export async function recordAudit(
  entry: AuditEntry,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  await client.auditLog.create({
    data: {
      organizationId: entry.organizationId ?? null,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    },
  })
}

/** Reduce a change to the fields that actually moved, so logs stay readable. */
export function diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const changedBefore: Record<string, unknown> = {}
  const changedAfter: Record<string, unknown> = {}
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      changedBefore[key] = before[key]
      changedAfter[key] = after[key]
    }
  }
  return { before: changedBefore, after: changedAfter }
}
