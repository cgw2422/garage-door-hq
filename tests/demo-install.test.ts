import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { DEMO_OWNER_EMAIL, DEMO_SLUG } from '@/server/demo/data'
import { installDemoData, removeDemoData } from '@/server/demo/install'
import { createTestCompany } from './helpers'

/**
 * Adding the demo company to a deployment that already has real companies on
 * it.
 *
 * The development seed truncates every table first, which is the correct
 * behaviour on a laptop and would be the end of someone's business anywhere
 * else. This path shares the same data and none of that, so what these tests
 * check is mostly the absence of damage: real companies untouched, no partial
 * write when it refuses, and the same answer twice.
 *
 * These run in order against one database, because that is the situation being
 * described: an operator meets these states in this sequence.
 */

describe('installing the demo company', () => {
  it('refuses when a real account already holds an address it needs', async () => {
    const squatter = await prisma.user.create({
      data: {
        email: DEMO_OWNER_EMAIL,
        passwordHash: 'not-a-real-hash',
        firstName: 'Someone',
        lastName: 'Else',
      },
    })

    const result = await installDemoData()

    expect(result.status).toBe('already-present')
    if (result.status === 'already-present') {
      expect(result.message).toContain(DEMO_OWNER_EMAIL)
    }

    // Nothing half-written: the refusal happened before the first insert.
    const demo = await prisma.organization.findUnique({ where: { slug: DEMO_SLUG } })
    expect(demo).toBeNull()

    await prisma.user.delete({ where: { id: squatter.id } })
  })

  it('adds it alongside a real company, and leaves that company alone', async () => {
    const { session } = await createTestCompany()
    await session.db.customer.create({
      data: {
        organizationId: session.organizationId,
        number: 1,
        displayNumber: 'C-1',
        firstName: 'Real',
        lastName: 'Customer',
      },
    })

    const result = await installDemoData()
    expect(result.status).toBe('installed')

    const real = await prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { id: true },
    })
    expect(real).not.toBeNull()

    const theirCustomers = await prisma.customer.count({
      where: { organizationId: session.organizationId },
    })
    expect(theirCustomers).toBe(1)

    const demo = await prisma.organization.findUnique({
      where: { slug: DEMO_SLUG },
      select: { id: true },
    })
    expect(demo).not.toBeNull()

    // The demo company's own data landed, and is scoped to the demo company.
    const demoCustomers = await prisma.customer.count({
      where: { organizationId: demo!.id },
    })
    expect(demoCustomers).toBeGreaterThan(0)
  })

  // Now that it is installed, running it again is the likely accident: a
  // start command that carries it, or an operator who clicks twice.
  it('refuses the second time rather than duplicating anything', async () => {
    const organizations = await prisma.organization.count()
    const users = await prisma.user.count()
    const customers = await prisma.customer.count()

    const again = await installDemoData()

    expect(again.status).toBe('already-present')
    expect(await prisma.organization.count()).toBe(organizations)
    expect(await prisma.user.count()).toBe(users)
    expect(await prisma.customer.count()).toBe(customers)
  })

  // Reloading after a price change is the reason this exists, and it is the
  // one destructive path in the product, so what it does not touch matters
  // more than what it does.
  it('replaces the demo company without touching a real one', async () => {
    const { session } = await createTestCompany()
    await session.db.customer.create({
      data: {
        organizationId: session.organizationId,
        number: 99,
        displayNumber: 'C-99',
        firstName: 'Still',
        lastName: 'Here',
      },
    })

    const before = await prisma.organization.findUnique({ where: { slug: DEMO_SLUG } })
    expect(before).not.toBeNull()

    const result = await installDemoData({ replace: true })

    expect(result.status).toBe('installed')
    if (result.status === 'installed') expect(result.replaced).toBe(true)

    // A new demo company, not the old one.
    const after = await prisma.organization.findUnique({ where: { slug: DEMO_SLUG } })
    expect(after).not.toBeNull()
    expect(after!.id).not.toBe(before!.id)

    // The real company and its data are exactly as they were.
    const real = await prisma.organization.findUnique({ where: { id: session.organizationId } })
    expect(real).not.toBeNull()
    expect(
      await prisma.customer.count({ where: { organizationId: session.organizationId } }),
    ).toBe(1)

    // Nothing points at the company that was removed.
    for (const table of ['customer', 'job', 'invoice', 'estimate', 'priceBookItem'] as const) {
      expect(
        await (prisma[table] as { count: (args: unknown) => Promise<number> }).count({
          where: { organizationId: before!.id },
        }),
        table,
      ).toBe(0)
    }
  })

  it('leaves nothing behind that would block a reinstall', async () => {
    const { removed } = await removeDemoData()
    expect(removed).toBe(true)

    expect(await prisma.organization.findUnique({ where: { slug: DEMO_SLUG } })).toBeNull()
    expect(await prisma.user.findUnique({ where: { email: DEMO_OWNER_EMAIL } })).toBeNull()
    expect(await prisma.affiliate.findUnique({ where: { code: 'GDOC20' } })).toBeNull()

    // Which is the point: the next install has a clean run at it.
    const again = await installDemoData()
    expect(again.status).toBe('installed')
  })

  it('does nothing when there is no demo company to remove', async () => {
    await removeDemoData()
    const organizations = await prisma.organization.count()

    const { removed } = await removeDemoData()

    expect(removed).toBe(false)
    expect(await prisma.organization.count()).toBe(organizations)
  })
})
