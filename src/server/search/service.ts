import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import { formatCents } from '@/lib/money'
import {
  formatCustomerNumber,
  formatDoorNumber,
  formatEstimateNumber,
  formatInvoiceNumber,
  formatJobNumber,
} from '@/lib/numbering'

/**
 * One search box for the whole product.
 *
 * A garage door technician standing in a driveway does not want to decide
 * whether the thing they half-remember is a customer, a door, or an invoice.
 * They type "330-555-1212" or ".225 2 27" or "INV-1043" and the right thing
 * comes back.
 *
 * Every query goes through the tenant client, so another company's records are
 * not reachable however the input is shaped.
 */

export type SearchGroupKey =
  | 'customers'
  | 'properties'
  | 'doors'
  | 'jobs'
  | 'estimates'
  | 'invoices'
  | 'inventory'

export interface SearchHit {
  id: string
  title: string
  subtitle: string | null
  meta: string | null
  href: string
}

export interface SearchGroup {
  key: SearchGroupKey
  label: string
  hits: SearchHit[]
}

export interface SearchOutcome {
  query: string
  groups: SearchGroup[]
  total: number
  /** How the query was read, so the UI can explain a surprising result. */
  interpretation: string | null
}

const GROUP_LABELS: Record<SearchGroupKey, string> = {
  customers: 'Customers',
  properties: 'Properties',
  doors: 'Doors',
  jobs: 'Jobs',
  estimates: 'Estimates',
  invoices: 'Invoices',
  inventory: 'Inventory',
}

const PER_GROUP = 6

/**
 * What the text looks like it is.
 *
 * Cheap and deliberately loose: a wrong guess only changes what is searched
 * *first*, never what is reachable — the general text search runs regardless.
 */
interface ParsedQuery {
  raw: string
  text: string
  /** Digits only, when the input looks like a phone number. */
  phoneDigits: string | null
  /** A document number, from "INV-1043", "#1043" or "1043". */
  documentNumber: number | null
  /** An explicit prefix, so "INV-1043" does not match EST-1043. */
  documentPrefix: string | null
  /** Wire size, inside diameter and length, from ".225 2 27". */
  springDimensions: number[] | null
}

export function parseQuery(raw: string): ParsedQuery {
  const text = raw.trim()

  // Phone: seven or more digits once punctuation is stripped. Seven, because
  // a local number without an area code is still worth finding.
  const digits = text.replace(/\D/g, '')
  const phoneDigits = digits.length >= 7 ? digits : null

  // Document numbers: an optional prefix, then digits.
  const documentMatch = /^([A-Za-z]{1,8})?[-#\s]*(\d{3,9})$/.exec(text)
  const documentPrefix = documentMatch?.[1]?.toUpperCase() ?? null
  const documentNumber = documentMatch ? Number(documentMatch[2]) : null

  // Spring dimensions: two or three decimals separated by spaces, x or by.
  // ".225 2 27" and ".225x2x27" both mean the same thing to a technician.
  const dimensionTokens = text
    .split(/[\s x×by,]+/i)
    .map((token) => token.replace(/["']/g, ''))
    .filter((token) => token.length > 0)
  const numeric = dimensionTokens
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value) && value > 0)
  const springDimensions =
    numeric.length >= 2 && numeric.length <= 4 && numeric.some((value) => value < 1)
      ? numeric
      : null

  return { raw, text, phoneDigits, documentNumber, documentPrefix, springDimensions }
}

/**
 * The words in a query, for matching across several fields at once.
 *
 * "LiftMaster 87504" has to match a door whose manufacturer is one token and
 * whose model is the other, so each token is required (AND) and each may land
 * in any field (OR). Matching the whole string against single fields would
 * find nothing, which is exactly how a technician would type it.
 */
function tokensOf(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 5)
}

/**
 * Every token must appear somewhere in `fields`.
 *
 * Returns a Prisma `AND` of `OR`s, or null when there is nothing to match on.
 */
function allTokensIn(tokens: string[], fields: string[]) {
  if (tokens.length === 0) return null
  return {
    AND: tokens.map((token) => ({
      OR: fields.map((field) => ({
        [field]: { contains: token, mode: 'insensitive' as const },
      })),
    })),
  }
}

/**
 * Customer ids whose phone number contains these digits.
 *
 * Done in SQL with the punctuation stripped, because "(330) 555-1212" stored
 * and "3305551212" typed do not match with LIKE. A generated column would let
 * this use an index; at a garage door company's scale a scan of their own
 * customers is cheaper than the migration.
 */
async function customerIdsByPhone(
  organizationId: string,
  digits: string,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Customer"
     WHERE "organizationId" = ${organizationId}
       AND "archivedAt" IS NULL
       AND (
         regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'}
         OR regexp_replace(COALESCE("altPhone", ''), '[^0-9]', '', 'g') LIKE ${'%' + digits + '%'}
       )
     LIMIT 20
  `
  return rows.map((row) => row.id)
}

export async function search(
  session: AppSession,
  rawQuery: string,
): Promise<SearchOutcome> {
  const parsed = parseQuery(rawQuery)
  if (parsed.text.length < 2) {
    return { query: rawQuery, groups: [], total: 0, interpretation: null }
  }

  const q = parsed.text
  const contains = { contains: q, mode: 'insensitive' as const }
  const tokens = tokensOf(q)

  // Phone matching needs SQL that strips punctuation, so the ids are resolved
  // first and folded into the customer query.
  const phoneIds = parsed.phoneDigits
    ? await customerIdsByPhone(session.organizationId, parsed.phoneDigits)
    : []

  const [customers, properties, doors, jobs, estimates, invoices, items] = await Promise.all([
    session.db.customer.findMany({
      where: {
        archivedAt: null,
        OR: [
          { firstName: contains },
          { lastName: contains },
          { companyName: contains },
          { email: contains },
          { phone: contains },
          { altPhone: contains },
          ...(phoneIds.length > 0 ? [{ id: { in: phoneIds } }] : []),
          // "Rachel Okafor" — first name in one column, last in another.
          ...(tokens.length > 1
            ? [allTokensIn(tokens, ['firstName', 'lastName', 'companyName'])!]
            : []),
          ...(parsed.documentNumber !== null && matchesPrefix(parsed, 'C')
            ? [{ number: parsed.documentNumber }]
            : []),
          { displayNumber: contains },
        ],
      },
      take: PER_GROUP * 3,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        number: true,
        displayNumber: true,
        firstName: true,
        lastName: true,
        companyName: true,
        phone: true,
        altPhone: true,
        email: true,
      },
    }),

    session.db.property.findMany({
      where: {
        archivedAt: null,
        OR: [
          { line1: contains },
          { line2: contains },
          { city: contains },
          { postalCode: contains },
          { nickname: contains },
          ...(tokens.length > 1
            ? [allTokensIn(tokens, ['line1', 'line2', 'city', 'nickname'])!]
            : []),
        ],
      },
      take: PER_GROUP,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        line1: true,
        city: true,
        state: true,
        nickname: true,
        customer: { select: { firstName: true, lastName: true, companyName: true } },
      },
    }),

    session.db.door.findMany({
      where: {
        archivedAt: null,
        OR: [
          { nickname: contains },
          { positionLabel: contains },
          { manufacturer: contains },
          { model: contains },
          { serialNumber: contains },
          { displayNumber: contains },
          ...(parsed.documentNumber !== null && matchesPrefix(parsed, 'D')
            ? [{ number: parsed.documentNumber }]
            : []),
          // "LiftMaster 87504" is a make in one column and a model in
          // another, so every token has to be allowed to land anywhere.
          ...(tokens.length > 1
            ? [allTokensIn(tokens, ['nickname', 'manufacturer', 'model', 'serialNumber'])!]
            : []),
          // Openers live under the door, and a search for one should surface
          // the Door Passport rather than a part.
          {
            openers: {
              some: {
                OR: [
                  { manufacturer: contains },
                  { model: contains },
                  { serialNumber: contains },
                  ...(tokens.length > 1
                    ? [allTokensIn(tokens, ['manufacturer', 'model', 'serialNumber'])!]
                    : []),
                ],
              },
            },
          },
        ],
      },
      take: PER_GROUP,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        number: true,
        displayNumber: true,
        nickname: true,
        positionLabel: true,
        manufacturer: true,
        model: true,
        property: {
          select: {
            line1: true,
            city: true,
            customer: { select: { firstName: true, lastName: true, companyName: true } },
          },
        },
      },
    }),

    session.db.job.findMany({
      where: {
        archivedAt: null,
        OR: [
          { displayNumber: contains },
          { reportedIssue: contains },
          ...(parsed.documentNumber !== null && matchesPrefix(parsed, 'J')
            ? [{ number: parsed.documentNumber }]
            : []),
        ],
      },
      take: PER_GROUP,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        number: true,
        displayNumber: true,
        status: true,
        reportedIssue: true,
        customer: { select: { firstName: true, lastName: true, companyName: true } },
      },
    }),

    session.db.estimate.findMany({
      where: {
        OR: [
          { displayNumber: contains },
          { title: contains },
          ...(parsed.documentNumber !== null && matchesPrefix(parsed, 'EST')
            ? [{ number: parsed.documentNumber }]
            : []),
        ],
      },
      take: PER_GROUP,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        number: true,
        displayNumber: true,
        status: true,
        title: true,
        customer: { select: { firstName: true, lastName: true, companyName: true } },
      },
    }),

    session.db.invoice.findMany({
      where: {
        OR: [
          { displayNumber: contains },
          ...(parsed.documentNumber !== null && matchesPrefix(parsed, 'INV')
            ? [{ number: parsed.documentNumber }]
            : []),
        ],
      },
      take: PER_GROUP,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        number: true,
        displayNumber: true,
        status: true,
        totalCents: true,
        balanceCents: true,
        customer: { select: { firstName: true, lastName: true, companyName: true } },
      },
    }),

    session.db.priceBookItem.findMany({
      where: {
        archivedAt: null,
        OR: [
          { name: contains },
          { sku: contains },
          { description: contains },
          { supplierPartNo: contains },
          ...(parsed.springDimensions ? [springWhere(parsed.springDimensions)] : []),
        ],
      },
      take: PER_GROUP * 2,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        sku: true,
        category: true,
        priceCents: true,
        springSpec: {
          select: {
            wireSizeInches: true,
            insideDiameterInches: true,
            lengthInches: true,
            wind: true,
            cycleRating: true,
          },
        },
        stockLevels: { select: { quantity: true } },
      },
    }),
  ])

  // A phone match is the most specific thing somebody can type, so those come
  // first when the query looked like a number.
  const phoneSet = new Set(phoneIds)
  const customerHits = dedupe([
    ...customers.filter((customer) => phoneSet.has(customer.id)),
    ...customers,
  ]).slice(0, PER_GROUP)

  const groups: SearchGroup[] = ([
    {
      key: 'customers' as const,
      label: GROUP_LABELS.customers,
      hits: customerHits.map((customer) => ({
        id: customer.id,
        title: customer.companyName ?? `${customer.firstName} ${customer.lastName}`,
        subtitle: customer.phone ?? customer.email,
        meta: formatCustomerNumber(customer),
        href: `/customers/${customer.id}`,
      })),
    },
    {
      key: 'properties' as const,
      label: GROUP_LABELS.properties,
      hits: properties.map((property) => ({
        id: property.id,
        title: property.nickname ?? property.line1,
        subtitle: `${property.line1}, ${property.city}, ${property.state}`,
        meta: nameOf(property.customer),
        href: `/properties/${property.id}`,
      })),
    },
    {
      key: 'doors' as const,
      label: GROUP_LABELS.doors,
      hits: doors.map((door) => ({
        id: door.id,
        title: door.nickname ?? door.positionLabel ?? formatDoorNumber(door),
        subtitle: [door.manufacturer, door.model].filter(Boolean).join(' ') || null,
        meta: `${nameOf(door.property.customer)} · ${door.property.line1}`,
        href: `/doors/${door.id}`,
      })),
    },
    {
      key: 'jobs' as const,
      label: GROUP_LABELS.jobs,
      hits: jobs.map((job) => ({
        id: job.id,
        title: formatJobNumber(job),
        subtitle: job.reportedIssue,
        meta: `${nameOf(job.customer)} · ${statusLabel(job.status)}`,
        href: `/jobs/${job.id}`,
      })),
    },
    {
      key: 'estimates' as const,
      label: GROUP_LABELS.estimates,
      hits: estimates.map((estimate) => ({
        id: estimate.id,
        title: formatEstimateNumber(estimate),
        subtitle: estimate.title,
        meta: `${nameOf(estimate.customer)} · ${statusLabel(estimate.status)}`,
        href: `/estimates/${estimate.id}`,
      })),
    },
    {
      key: 'invoices' as const,
      label: GROUP_LABELS.invoices,
      hits: invoices.map((invoice) => ({
        id: invoice.id,
        title: formatInvoiceNumber(invoice),
        subtitle:
          invoice.balanceCents > 0
            ? `${formatCents(invoice.balanceCents, { currency: session.currency })} due`
            : formatCents(invoice.totalCents, { currency: session.currency }),
        meta: `${nameOf(invoice.customer)} · ${statusLabel(invoice.status)}`,
        href: `/invoices/${invoice.id}`,
      })),
    },
    {
      key: 'inventory' as const,
      label: GROUP_LABELS.inventory,
      hits: items.slice(0, PER_GROUP).map((item) => {
        const onHand = item.stockLevels.reduce(
          (sum, level) => sum + Number(level.quantity.toString()),
          0,
        )
        return {
          id: item.id,
          title: item.name,
          subtitle: item.springSpec
            ? springLabel(item.springSpec)
            : (item.sku ?? null),
          meta: `${formatCents(item.priceCents, { currency: session.currency })} · ${onHand} on hand`,
          href: `/inventory/items/${item.id}`,
        }
      }),
    },
  ] satisfies SearchGroup[]).filter((group) => group.hits.length > 0)

  return {
    query: rawQuery,
    groups,
    total: groups.reduce((sum, group) => sum + group.hits.length, 0),
    interpretation: describe(parsed),
  }
}

/**
 * "INV-1043" must not match estimate 1043.
 *
 * A bare number matches every kind, because someone typing "1043" does not
 * know which sequence it came from.
 */
function matchesPrefix(parsed: ParsedQuery, expected: string): boolean {
  if (!parsed.documentPrefix) return true
  return parsed.documentPrefix === expected
}

/** Match a spring by its measurements, within a tolerance a caliper allows. */
function springWhere(dimensions: number[]) {
  const [wire, inside, length] = dimensions
  const clauses: Record<string, unknown>[] = []

  if (wire !== undefined && wire < 1) {
    clauses.push({ wireSizeInches: { gte: wire - 0.002, lte: wire + 0.002 } })
  }
  if (inside !== undefined && inside >= 1 && inside < 4) {
    clauses.push({ insideDiameterInches: { gte: inside - 0.05, lte: inside + 0.05 } })
  }
  if (length !== undefined && length >= 4) {
    clauses.push({ lengthInches: { gte: length - 0.5, lte: length + 0.5 } })
  }

  // No usable dimensions: match nothing rather than everything.
  if (clauses.length === 0) return { springSpec: { is: null }, id: '' }
  return { springSpec: { AND: clauses } }
}

function springLabel(spec: {
  wireSizeInches: unknown
  insideDiameterInches: unknown
  lengthInches: unknown
  wind: string | null
  cycleRating: number | null
}): string {
  const parts = [
    `${spec.wireSizeInches}`,
    `${spec.insideDiameterInches}"`,
    `${spec.lengthInches}"`,
  ].join(' × ')
  const wind = spec.wind === 'LEFT_HAND' ? 'LH' : spec.wind === 'RIGHT_HAND' ? 'RH' : null
  const cycles = spec.cycleRating ? `${spec.cycleRating.toLocaleString()} cycles` : null
  return [parts, wind, cycles].filter(Boolean).join(' · ')
}

function describe(parsed: ParsedQuery): string | null {
  if (parsed.springDimensions) {
    return `Reading that as spring measurements: ${parsed.springDimensions.join(' × ')}`
  }
  if (parsed.phoneDigits) return 'Reading that as a phone number'
  if (parsed.documentNumber !== null) {
    return parsed.documentPrefix
      ? `Looking for ${parsed.documentPrefix}-${parsed.documentNumber}`
      : `Looking for number ${parsed.documentNumber}`
  }
  return null
}

function nameOf(customer: {
  firstName: string
  lastName: string
  companyName: string | null
}): string {
  return customer.companyName ?? `${customer.firstName} ${customer.lastName}`
}

function statusLabel(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

function dedupe<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  const output: T[] = []
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    output.push(row)
  }
  return output
}
