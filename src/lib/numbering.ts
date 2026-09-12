import type { Prisma, SequenceEntity } from '@prisma/client'

/**
 * Readable per-organization identifiers.
 *
 * Two things matter here, and they are easy to confuse:
 *
 * - `number` is the counter. It sorts, it is unique per organization, and it
 *   never changes.
 * - `displayNumber` is the identifier a customer has seen — "INV-1008". It is
 *   **written down at creation**, not rendered on demand.
 *
 * Storing the rendered form is the whole point. A company that changes its
 * invoice prefix from "INV-" to "GD-" next year must not appear to have
 * renumbered every invoice it ever sent; the ones already out in the world
 * keep the identifier they were issued under, and only new records take the
 * new prefix.
 *
 * The counter row is locked by the `UPDATE ... RETURNING` inside the caller's
 * transaction, so two technicians creating a job at the same moment cannot be
 * handed the same number.
 */

/** The prefix used when a company has not set one of its own. */
export const DEFAULT_PREFIX: Record<SequenceEntity, string> = {
  JOB: 'J-',
  ESTIMATE: 'EST-',
  INVOICE: 'INV-',
  DOOR: 'D-',
  CUSTOMER: 'C-',
}

const SEQUENCE_START: Record<SequenceEntity, number> = {
  JOB: 1000,
  ESTIMATE: 1000,
  INVOICE: 1000,
  DOOR: 2000,
  CUSTOMER: 1000,
}

export interface IssuedNumber {
  number: number
  displayNumber: string
}

/**
 * Take the next identifier for an entity.
 *
 * Must be called with a transaction client — never the base client — so the
 * counter moves in the same transaction as the row that consumes it. A rolled
 * back job creation gives its number back.
 */
export async function nextIdentifier(
  tx: Prisma.TransactionClient,
  organizationId: string,
  entity: SequenceEntity,
): Promise<IssuedNumber> {
  // One statement: increment, and read back both the number handed out and the
  // prefix in force at this moment.
  const rows = await tx.$queryRaw<Array<{ nextValue: number; prefix: string | null }>>`
    UPDATE "NumberSequence"
       SET "nextValue" = "nextValue" + 1
     WHERE "organizationId" = ${organizationId}
       AND "entity" = ${entity}::"SequenceEntity"
    RETURNING "nextValue" - 1 AS "nextValue", "prefix"
  `

  const row = rows[0]
  if (row) {
    return { number: row.nextValue, displayNumber: render(entity, row.prefix, row.nextValue) }
  }

  // First use for this organization; seed the sequence at its starting value.
  const start = SEQUENCE_START[entity]
  await tx.numberSequence.create({
    data: { organizationId, entity, nextValue: start + 1 },
  })
  return { number: start, displayNumber: render(entity, null, start) }
}

/** Back-compatible helper for callers that only need the counter. */
export async function nextNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
  entity: SequenceEntity,
): Promise<number> {
  return (await nextIdentifier(tx, organizationId, entity)).number
}

function render(entity: SequenceEntity, prefix: string | null, value: number): string {
  return `${(prefix ?? DEFAULT_PREFIX[entity]).trim()}${value}`
}

/**
 * A record that carries an identifier.
 *
 * Every formatter below takes one of these, or a bare counter for the handful
 * of places that genuinely only have the number. When `displayNumber` is
 * present it wins — that is the identifier the customer has.
 */
export interface Numbered {
  number: number
  /**
   * Required, not optional, and deliberately so: a query that forgets to
   * select it will not compile rather than quietly rendering the default
   * prefix over a record issued under a different one.
   */
  displayNumber: string | null
}

function identifier(entity: SequenceEntity, value: Numbered | number): string {
  if (typeof value === 'number') return render(entity, null, value)
  return value.displayNumber ?? render(entity, null, value.number)
}

export const formatJobNumber = (value: Numbered | number) => identifier('JOB', value)
export const formatEstimateNumber = (value: Numbered | number) => identifier('ESTIMATE', value)
export const formatInvoiceNumber = (value: Numbered | number) => identifier('INVOICE', value)
export const formatDoorNumber = (value: Numbered | number) => identifier('DOOR', value)
export const formatCustomerNumber = (value: Numbered | number) => identifier('CUSTOMER', value)

/**
 * Validate a prefix a company typed.
 *
 * Kept deliberately narrow: an identifier ends up in URLs, PDFs, email subject
 * lines and accounting exports, so it holds letters, digits and a separator,
 * and nothing that needs escaping anywhere.
 */
export function normalizePrefix(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
}

export class PrefixError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrefixError'
  }
}

export function assertValidPrefix(input: string): string {
  const prefix = normalizePrefix(input)
  if (prefix.length === 0) throw new PrefixError('Enter a prefix, or leave it blank for the default.')
  if (prefix.length > 8) throw new PrefixError('Keep the prefix to 8 characters or fewer.')
  return prefix
}
