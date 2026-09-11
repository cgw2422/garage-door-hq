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
  'ReviewRequest',
  'PortalLink',
  'Membership',
  'Invitation',
  'AuditLog',
])

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
          if (!model || !TENANT_MODELS.has(model)) {
            return query(args)
          }

          const next = args as Record<string, unknown>

          if (WHERE_SCOPED.has(operation)) {
            // Prisma's extended `where` accepts non-unique filters alongside a
            // unique field, so this works for findUnique/update/delete too.
            next.where = { ...(next.where as object | undefined), organizationId }
          }

          if (DATA_SCOPED.has(operation)) {
            const data = next.data
            next.data = Array.isArray(data)
              ? data.map((row) => ({ ...(row as object), organizationId }))
              : { ...(data as object | undefined), organizationId }
          }

          if (operation === 'upsert') {
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
