import type { Prisma, SequenceEntity } from '@prisma/client'

/**
 * Readable per-organization identifiers. The counter row is locked with
 * `FOR UPDATE` inside the caller's transaction, so two technicians creating a
 * job at the same moment cannot be handed the same number.
 *
 * Must be called with a transaction client - never the base client.
 */
export async function nextNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
  entity: SequenceEntity,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ nextValue: number }>>`
    UPDATE "NumberSequence"
       SET "nextValue" = "nextValue" + 1
     WHERE "organizationId" = ${organizationId}
       AND "entity" = ${entity}::"SequenceEntity"
    RETURNING "nextValue" - 1 AS "nextValue"
  `

  const row = rows[0]
  if (row) return row.nextValue

  // First use for this organization; seed the sequence at its starting value.
  const start = SEQUENCE_START[entity]
  await tx.numberSequence.create({
    data: { organizationId, entity, nextValue: start + 1 },
  })
  return start
}

const SEQUENCE_START: Record<SequenceEntity, number> = {
  JOB: 1000,
  ESTIMATE: 1000,
  INVOICE: 1000,
  DOOR: 2000,
  CUSTOMER: 1000,
}

export const formatJobNumber = (n: number) => `Job #${n}`
export const formatEstimateNumber = (n: number) => `EST-${n}`
export const formatInvoiceNumber = (n: number) => `INV-${n}`
export const formatDoorNumber = (n: number) => `D-${n}`
