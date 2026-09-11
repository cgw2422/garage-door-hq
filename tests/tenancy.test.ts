import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { tenantDb } from '@/lib/tenancy'

/**
 * Multi-tenant isolation is the one thing in this product that must never
 * regress. These tests build two organizations and confirm that a client
 * scoped to one cannot read, update or delete anything belonging to the other,
 * even when it is handed the other tenant's primary key.
 */

let orgA = ''
let orgB = ''
let customerB = ''
let jobB = ''

beforeAll(async () => {
  const a = await prisma.organization.create({
    data: { name: 'Tenant A', slug: `tenant-a-${Date.now()}` },
  })
  const b = await prisma.organization.create({
    data: { name: 'Tenant B', slug: `tenant-b-${Date.now()}` },
  })
  orgA = a.id
  orgB = b.id

  const customer = await prisma.customer.create({
    data: { organizationId: orgB, number: 1, firstName: 'Bee', lastName: 'Customer' },
  })
  customerB = customer.id

  const property = await prisma.property.create({
    data: {
      organizationId: orgB,
      customerId: customerB,
      line1: '1 Private Rd',
      city: 'Charlotte',
      state: 'NC',
      postalCode: '28202',
    },
  })

  const job = await prisma.job.create({
    data: {
      organizationId: orgB,
      number: 1,
      customerId: customerB,
      propertyId: property.id,
      reportedIssue: 'Tenant B only',
    },
  })
  jobB = job.id
})

afterAll(async () => {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "Job" WHERE "organizationId" IN ($1, $2)`, orgA, orgB,
  )
  await prisma.$executeRawUnsafe(
    `DELETE FROM "Property" WHERE "organizationId" IN ($1, $2)`, orgA, orgB,
  )
  await prisma.$executeRawUnsafe(
    `DELETE FROM "Customer" WHERE "organizationId" IN ($1, $2)`, orgA, orgB,
  )
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } })
  await prisma.$disconnect()
})

describe('tenant-scoped client', () => {
  it("hides another organization's rows from findMany", async () => {
    const db = tenantDb(orgA)
    expect(await db.job.findMany()).toHaveLength(0)
    expect(await db.customer.findMany()).toHaveLength(0)
  })

  it('returns null for a findUnique on another organization primary key', async () => {
    const db = tenantDb(orgA)
    expect(await db.job.findUnique({ where: { id: jobB } })).toBeNull()
    expect(await db.customer.findUnique({ where: { id: customerB } })).toBeNull()
  })

  it('refuses to update a row owned by another organization', async () => {
    const db = tenantDb(orgA)
    await expect(
      db.job.update({ where: { id: jobB }, data: { reportedIssue: 'hijacked' } }),
    ).rejects.toThrow()

    const untouched = await prisma.job.findUniqueOrThrow({ where: { id: jobB } })
    expect(untouched.reportedIssue).toBe('Tenant B only')
  })

  it('refuses to delete a row owned by another organization', async () => {
    const db = tenantDb(orgA)
    await expect(db.job.delete({ where: { id: jobB } })).rejects.toThrow()
    expect(await prisma.job.findUnique({ where: { id: jobB } })).not.toBeNull()
  })

  it('ignores an organization id supplied by the caller on create', async () => {
    const db = tenantDb(orgA)
    const customer = await db.customer.create({
      // A forged tenant id in the payload must not win.
      data: { organizationId: orgB, number: 99, firstName: 'Forged', lastName: 'Row' },
    })
    expect(customer.organizationId).toBe(orgA)
  })

  it('scopes aggregates and counts', async () => {
    expect(await tenantDb(orgA).job.count()).toBe(0)
    expect(await tenantDb(orgB).job.count()).toBe(1)
  })
})
