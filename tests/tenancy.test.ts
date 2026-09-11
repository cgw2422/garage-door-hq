import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

  /**
   * The list of scoped models is hand-maintained, and a model added to the
   * schema without being added to the list is silently unscoped. This reads
   * the schema and insists the two agree, so the next migration cannot open a
   * hole quietly.
   */
  it('scopes every model in the schema that carries an organization id', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8')
    const scoping = readFileSync(join(process.cwd(), 'src', 'lib', 'tenancy.ts'), 'utf8')

    const declared = new Set(
      [...scoping.matchAll(/^\s*'(\w+)',$/gm)].map((match) => match[1]!),
    )

    const missing: string[] = []
    for (const [, name, body] of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
      if (!/^\s*organizationId\s/m.test(body!)) continue
      if (!declared.has(name!)) missing.push(name!)
    }

    expect(missing).toEqual([])
  })

  it('scopes the organization row itself, which has no organization id', async () => {
    const db = tenantDb(orgA)

    await db.organization.updateMany({
      where: { id: orgB },
      data: { name: 'Hijacked' },
    })

    const theirs = await prisma.organization.findUniqueOrThrow({ where: { id: orgB } })
    expect(theirs.name).not.toBe('Hijacked')
  })
})
