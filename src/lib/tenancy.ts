import { Prisma } from '@prisma/client'
import { prisma } from './db'

/**
 * Multi-tenant isolation.
 *
 * Every model listed here carries `organizationId`. `tenantDb(orgId)` returns a
 * Prisma client that injects that filter into the `where` of every read and
 * write, and into the `data` of every create. A caller that forgets to scope a
 * query still cannot see another company's rows.
 *
 * This is defence in depth, not the only defence: the organization id itself is
 * resolved server-side from the session (see session.ts) and is never read from
 * a URL, form field or request body.
 *
 * Child rows that have no `organizationId` of their own - estimate items,
 * inspection items, springs, package items - are reached only through their
 * scoped parent. That is deliberate: a second denormalized tenant column on
 * every child is a second thing that can drift out of sync.
 */
const TENANT_MODELS = new Set<string>([
  'Customer',
  'Property',
  'Door',
  'Opener',
  'SpringSystem',
  'Job',
  'JobType',
  'Inspection',
  'InspectionRemedy',
  'Estimate',
  'Invoice',
  'Payment',
  'PriceBookItem',
  'PriceBookPackage',
  'InventoryLocation',
  'StockLevel',
  'InventoryTransaction',
  'Photo',
  'Note',
  'VoiceNote',
  'Signature',
  'SpringMeasurement',
  'CommunicationLog',
  'ReviewDestination',
  'ReviewRequest',
  'PortalLink',
  'Membership',
  'Invitation',
  'AuditLog',
  'NumberSequence',
  'PaymentAccount',
  // Webhook rows are written by the unauthenticated webhook route through
  // `unscopedDb` — the organization is resolved from the payload, not a
  // session. Listing it here scopes the reads the app itself makes.
  'WebhookEvent',
  'Subscription',
  'Referral',
])

/**
 * The organization row itself is identified by `id`, not `organizationId`, so
 * it is scoped by a different column rather than left unscoped. Without this a
 * mis-scoped `organization.update({ where: { id } })` would happily edit
 * another company's profile.
 */
const SELF_SCOPED_MODELS = new Set<string>(['Organization'])

/**
 * A syntactically valid id that no row will ever carry, used to turn a
 * cross-tenant lookup into an empty result rather than a redirected one.
 */
const NO_SUCH_ROW = '00000000-0000-0000-0000-000000000000'

/** Operations whose `where` must be narrowed to the tenant. */
const WHERE_SCOPED = new Set<string>([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
])

/** Operations whose `data` must be stamped with the tenant. */
const DATA_SCOPED = new Set<string>(['create', 'createMany', 'createManyAndReturn'])

export type TenantDb = ReturnType<typeof tenantDb>

export function tenantDb(organizationId: string) {
  if (!organizationId) {
    throw new Error('tenantDb() called without an organization id')
  }

  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const selfScoped = !!model && SELF_SCOPED_MODELS.has(model)
          if (!model || (!TENANT_MODELS.has(model) && !selfScoped)) {
            return query(args)
          }

          const next = args as Record<string, unknown>
          const scope = selfScoped ? { id: organizationId } : { organizationId }

          if (WHERE_SCOPED.has(operation)) {
            // Prisma's extended `where` accepts non-unique filters alongside a
            // unique field, so this works for findUnique/update/delete too.
            // It cannot be wrapped in `AND`, because findUnique requires the
            // unique field at the top level.
            //
            // For a tenant model the two never name the same column, so the
            // spread only ever narrows: `{ id: theirs, organizationId: ours }`
            // matches nothing, which is the answer we want.
            //
            // `Organization` is the exception, because it is scoped by `id` —
            // the same column a caller filters on. A plain spread would
            // silently rewrite "fetch organization X" into "fetch mine",
            // handing back a row that was not asked for. Narrowing must never
            // widen or redirect, so a foreign id asked for here is replaced
            // with one that cannot exist: reads find nothing, writes refuse.
            // Read before the spread, which is what would hide it.
            const askedForId = selfScoped
              ? (next.where as { id?: unknown } | undefined)?.id
              : undefined

            next.where = { ...(next.where as object | undefined), ...scope }

            if (typeof askedForId === 'string' && askedForId !== organizationId) {
              ;(next.where as { id: string }).id = NO_SUCH_ROW
            }
          }

          if (DATA_SCOPED.has(operation)) {
            // Creating an organization is a signup concern, never a tenant one.
            if (selfScoped) {
              throw new Error('tenantDb() cannot create organizations; use unscopedDb.')
            }

            const data = next.data
            next.data = Array.isArray(data)
              ? data.map((row) => ({ ...(row as object), organizationId }))
              : { ...(data as object | undefined), organizationId }
          }

          if (operation === 'upsert') {
            if (selfScoped) {
              throw new Error('tenantDb() cannot upsert organizations; use unscopedDb.')
            }
            next.where = { ...(next.where as object | undefined), organizationId }
            next.create = { ...(next.create as object | undefined), organizationId }
          }

          return query(next)
        },
      },
    },
  })
}

/**
 * Raw client for the few places that legitimately cross tenants: signup,
 * login, platform admin, and the customer portal token lookup. Every call site
 * is expected to justify itself.
 */
export const unscopedDb = prisma
export { Prisma }
