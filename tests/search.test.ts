import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import { parseQuery, search } from '@/server/search/service'
import { createTestCompany, createTestDoor, skuId, uniqueNumber } from './helpers'

/**
 * Global search.
 *
 * Two things are being tested: that a technician's actual typing finds the
 * right thing, and that no amount of typing reaches another company's data.
 */

async function customerNamed(
  session: AppSession,
  input: { firstName: string; lastName: string; phone?: string; email?: string },
) {
  const number = uniqueNumber()
  return prisma.customer.create({
    data: {
      organizationId: session.organizationId,
      number,
      displayNumber: `C-${number}`,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      email: input.email ?? null,
      properties: {
        create: {
          organizationId: session.organizationId,
          line1: '88 Maple Ridge Road',
          city: 'Concord',
          state: 'NC',
          postalCode: '28027',
        },
      },
    },
  })
}

function hitIds(groups: Awaited<ReturnType<typeof search>>['groups'], key: string) {
  return groups.find((group) => group.key === key)?.hits.map((hit) => hit.id) ?? []
}

describe('reading the query', () => {
  it('recognises a phone number however it is punctuated', () => {
    for (const input of ['330-555-1212', '(330) 555 1212', '3305551212', '330.555.1212']) {
      expect(parseQuery(input).phoneDigits).toBe('3305551212')
    }
  })

  it('does not mistake a short number for a phone number', () => {
    expect(parseQuery('1043').phoneDigits).toBeNull()
  })

  it('recognises a document number with and without its prefix', () => {
    expect(parseQuery('INV-1043').documentNumber).toBe(1043)
    expect(parseQuery('INV-1043').documentPrefix).toBe('INV')
    expect(parseQuery('#1043').documentNumber).toBe(1043)
    expect(parseQuery('1043').documentPrefix).toBeNull()
  })

  it('recognises spring measurements however a technician writes them', () => {
    for (const input of ['.225 2 27', '.225x2x27', '0.225 × 2 × 27']) {
      const parsed = parseQuery(input)
      expect(parsed.springDimensions).not.toBeNull()
      expect(parsed.springDimensions![0]).toBeCloseTo(0.225, 3)
    }
  })

  it('does not read an address as spring measurements', () => {
    expect(parseQuery('410 Sycamore Ave').springDimensions).toBeNull()
  })
})

describe('finding things', () => {
  it('finds a customer by phone number typed any way', async () => {
    const { session } = await createTestCompany()
    const customer = await customerNamed(session, {
      firstName: 'Rachel',
      lastName: 'Okafor',
      phone: '(330) 555-1212',
    })

    for (const query of ['330-555-1212', '3305551212', '(330) 555 1212']) {
      const outcome = await search(session, query)
      expect(hitIds(outcome.groups, 'customers')).toContain(customer.id)
    }
  })

  it('finds a customer by name and by email', async () => {
    const { session } = await createTestCompany()
    const customer = await customerNamed(session, {
      firstName: 'Priya',
      lastName: 'Raman',
      email: 'priya@example.test',
    })

    expect(hitIds((await search(session, 'Raman')).groups, 'customers')).toContain(customer.id)
    expect(hitIds((await search(session, 'priya@example')).groups, 'customers')).toContain(
      customer.id,
    )
  })

  it('finds a property by street', async () => {
    const { session } = await createTestCompany()
    await customerNamed(session, { firstName: 'Sam', lastName: 'Tester' })

    const outcome = await search(session, 'Maple Ridge')
    expect(hitIds(outcome.groups, 'properties').length).toBeGreaterThan(0)
  })

  it('finds a door by its opener', async () => {
    const { session } = await createTestCompany()
    const { door } = await createTestDoor(session)

    await prisma.opener.create({
      data: {
        organizationId: session.organizationId,
        doorId: door.id,
        manufacturer: 'LiftMaster',
        model: '87504',
        isCurrent: true,
      },
    })

    const outcome = await search(session, 'LiftMaster 87504')
    expect(hitIds(outcome.groups, 'doors')).toContain(door.id)
  })

  it('finds a spring by its measurements', async () => {
    const { session } = await createTestCompany()
    const itemId = await skuId(session.organizationId, 'TS-2250-200-270-L')

    const outcome = await search(session, '.225 2 27')
    expect(hitIds(outcome.groups, 'inventory')).toContain(itemId)
    expect(outcome.interpretation).toContain('spring measurements')
  })

  it('finds an invoice by its number', async () => {
    const { session } = await createTestCompany()
    const customer = await customerNamed(session, { firstName: 'Dana', lastName: 'Ruiz' })

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: session.organizationId,
        number: 1043,
        displayNumber: 'INV-1043',
        customerId: customer.id,
        status: 'SENT',
        subtotalCents: 10000,
        taxCents: 0,
        totalCents: 10000,
        balanceCents: 10000,
      },
    })

    expect(hitIds((await search(session, 'INV-1043')).groups, 'invoices')).toContain(invoice.id)
    expect(hitIds((await search(session, '1043')).groups, 'invoices')).toContain(invoice.id)
  })

  it('does not let INV-1043 match estimate 1043', async () => {
    const { session } = await createTestCompany()
    const customer = await customerNamed(session, { firstName: 'Dana', lastName: 'Ruiz' })

    const estimate = await prisma.estimate.create({
      data: {
        organizationId: session.organizationId,
        number: 2043,
        displayNumber: 'EST-2043',
        customerId: customer.id,
        status: 'DRAFT',
        taxRateBps: 0,
      },
    })

    // The prefix is part of the identifier, not decoration.
    expect(hitIds((await search(session, 'INV-2043')).groups, 'estimates')).not.toContain(
      estimate.id,
    )
    expect(hitIds((await search(session, 'EST-2043')).groups, 'estimates')).toContain(
      estimate.id,
    )
  })

  it('finds a part by SKU and by name', async () => {
    const { session } = await createTestCompany()
    const itemId = await skuId(session.organizationId, 'RLR-NYL-13')

    expect(hitIds((await search(session, 'RLR-NYL')).groups, 'inventory')).toContain(itemId)
    expect(hitIds((await search(session, 'nylon roller')).groups, 'inventory')).toContain(itemId)
  })

  it('says nothing for a single character', async () => {
    const { session } = await createTestCompany()
    const outcome = await search(session, 'a')
    expect(outcome.total).toBe(0)
    expect(outcome.groups).toEqual([])
  })
})

describe('tenant isolation', () => {
  it('never returns another company’s customer', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()

    const theirs = await customerNamed(b, {
      firstName: 'Confidential',
      lastName: 'Person',
      phone: '(330) 555-9999',
      email: 'secret@theirs.test',
    })

    for (const query of ['Confidential', 'Person', '3305559999', 'secret@theirs.test']) {
      const outcome = await search(a, query)
      const everyId = outcome.groups.flatMap((group) => group.hits.map((hit) => hit.id))
      expect(everyId).not.toContain(theirs.id)
    }
  })

  it('never returns another company’s documents', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()
    const customer = await customerNamed(b, { firstName: 'Their', lastName: 'Customer' })

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: b.organizationId,
        number: 7777,
        displayNumber: 'INV-7777',
        customerId: customer.id,
        status: 'SENT',
        subtotalCents: 1000,
        taxCents: 0,
        totalCents: 1000,
        balanceCents: 1000,
      },
    })

    const outcome = await search(a, 'INV-7777')
    expect(hitIds(outcome.groups, 'invoices')).not.toContain(invoice.id)
  })

  it('never returns another company’s inventory', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()

    const theirItem = await prisma.priceBookItem.create({
      data: {
        organizationId: b.organizationId,
        category: 'HARDWARE',
        name: 'Distinctive Widget Of Theirs',
        sku: `THEIRS-${Date.now()}`,
        costCents: 100,
        priceCents: 200,
      },
    })

    const outcome = await search(a, 'Distinctive Widget')
    expect(hitIds(outcome.groups, 'inventory')).not.toContain(theirItem.id)
  })

  it('does not leak through a spring-measurement search either', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()

    const outcome = await search(a, '.225 2 27')
    const ids = hitIds(outcome.groups, 'inventory')

    const theirs = await prisma.priceBookItem.findMany({
      where: { organizationId: b.organizationId },
      select: { id: true },
    })
    for (const item of theirs) expect(ids).not.toContain(item.id)
  })
})
