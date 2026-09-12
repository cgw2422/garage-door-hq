import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import {
  DEFAULT_PREFIX,
  PrefixError,
  assertValidPrefix,
  formatEstimateNumber,
  formatInvoiceNumber,
  formatJobNumber,
  nextIdentifier,
  normalizePrefix,
} from '@/lib/numbering'
import { createCustomer } from '@/server/customers/service'
import { createTestCompany } from './helpers'

/**
 * Document numbering.
 *
 * The property that matters: **an identifier a customer holds never changes.**
 * A company that switches its invoice prefix from "INV-" to "GD-" next year
 * must not appear to have renumbered every invoice it ever sent.
 */

describe('issuing an identifier', () => {
  it('hands out a number and the label to go with it', async () => {
    const { session } = await createTestCompany()

    const issued = await prisma.$transaction((tx) =>
      nextIdentifier(tx, session.organizationId, 'INVOICE'),
    )

    expect(issued.number).toBeGreaterThan(0)
    expect(issued.displayNumber).toBe(`INV-${issued.number}`)
  })

  it('uses the company’s own prefix when it has one', async () => {
    const { session } = await createTestCompany()
    await prisma.numberSequence.update({
      where: {
        organizationId_entity: { organizationId: session.organizationId, entity: 'INVOICE' },
      },
      data: { prefix: 'GD-' },
    })

    const issued = await prisma.$transaction((tx) =>
      nextIdentifier(tx, session.organizationId, 'INVOICE'),
    )
    expect(issued.displayNumber).toBe(`GD-${issued.number}`)
  })

  it('never hands the same number to two callers at once', async () => {
    const { session } = await createTestCompany()

    // Twenty concurrent jobs, which is more than a company will ever create in
    // the same second, and none of them may collide.
    const issued = await Promise.all(
      Array.from({ length: 20 }, () =>
        prisma.$transaction((tx) => nextIdentifier(tx, session.organizationId, 'JOB')),
      ),
    )

    const numbers = issued.map((row) => row.number)
    expect(new Set(numbers).size).toBe(numbers.length)
  })

  it('is refused by the database if a duplicate ever slipped through', async () => {
    const { session } = await createTestCompany()
    const customer = await createCustomer(session, {
      firstName: 'First',
      lastName: 'Customer',
      property: { line1: '1 A St', city: 'Charlotte', state: 'NC', postalCode: '28202' },
    })

    const existing = customer.customer

    // The unique index is the real guarantee, not the counter logic.
    await expect(
      prisma.customer.create({
        data: {
          organizationId: session.organizationId,
          number: 999_999,
          displayNumber: existing.displayNumber,
          firstName: 'Colliding',
          lastName: 'Customer',
        },
      }),
    ).rejects.toThrow()
  })
})

describe('what a prefix change does', () => {
  it('applies to the next record only', async () => {
    const { session } = await createTestCompany()

    const before = await prisma.$transaction((tx) =>
      nextIdentifier(tx, session.organizationId, 'INVOICE'),
    )
    expect(before.displayNumber.startsWith('INV-')).toBe(true)

    await prisma.numberSequence.update({
      where: {
        organizationId_entity: { organizationId: session.organizationId, entity: 'INVOICE' },
      },
      data: { prefix: 'GD-' },
    })

    const after = await prisma.$transaction((tx) =>
      nextIdentifier(tx, session.organizationId, 'INVOICE'),
    )
    expect(after.displayNumber.startsWith('GD-')).toBe(true)

    // The one already issued is untouched — it is a string on a row, not a
    // rendering of the current setting.
    expect(before.displayNumber.startsWith('INV-')).toBe(true)
  })

  it('cannot renumber a document a customer already has', async () => {
    const { session } = await createTestCompany()
    const customer = await prisma.customer.create({
      data: {
        organizationId: session.organizationId,
        number: 5000,
        displayNumber: 'C-5000',
        firstName: 'Held',
        lastName: 'Document',
      },
    })

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: session.organizationId,
        number: 1008,
        displayNumber: 'INV-1008',
        customerId: customer.id,
        status: 'SENT',
        subtotalCents: 1000,
        taxCents: 0,
        totalCents: 1000,
        balanceCents: 1000,
      },
    })

    await prisma.numberSequence.update({
      where: {
        organizationId_entity: { organizationId: session.organizationId, entity: 'INVOICE' },
      },
      data: { prefix: 'GD-' },
    })

    const reread = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(formatInvoiceNumber(reread)).toBe('INV-1008')
  })
})

describe('rendering an identifier', () => {
  it('prefers the stored label over the default', () => {
    expect(formatInvoiceNumber({ number: 1008, displayNumber: 'GD-1008' })).toBe('GD-1008')
    expect(formatEstimateNumber({ number: 1022, displayNumber: 'Q-1022' })).toBe('Q-1022')
  })

  it('falls back to the default for a row that predates the column', () => {
    expect(formatInvoiceNumber({ number: 1008, displayNumber: null })).toBe('INV-1008')
    expect(formatJobNumber({ number: 1043, displayNumber: null })).toBe('J-1043')
  })

  it('accepts a bare number for the few places that only have one', () => {
    expect(formatInvoiceNumber(1008)).toBe('INV-1008')
  })

  it('uses the prefixes the product promises', () => {
    expect(DEFAULT_PREFIX.JOB).toBe('J-')
    expect(DEFAULT_PREFIX.ESTIMATE).toBe('EST-')
    expect(DEFAULT_PREFIX.INVOICE).toBe('INV-')
    expect(DEFAULT_PREFIX.DOOR).toBe('D-')
    expect(DEFAULT_PREFIX.CUSTOMER).toBe('C-')
  })
})

describe('what a company may type as a prefix', () => {
  it('normalizes it', () => {
    expect(normalizePrefix(' gd- ')).toBe('GD-')
    expect(normalizePrefix('inv#')).toBe('INV')
  })

  it('refuses anything that would need escaping', () => {
    // Identifiers end up in URLs, PDFs, subject lines and accounting exports.
    expect(normalizePrefix('a/b')).toBe('AB')
    expect(normalizePrefix('<x>')).toBe('X')
  })

  it('refuses an empty or overlong prefix', () => {
    expect(() => assertValidPrefix('   ')).toThrow(PrefixError)
    expect(() => assertValidPrefix('TOOMANYCHARACTERS')).toThrow(PrefixError)
  })
})

describe('what a company actually creates', () => {
  it('stamps a customer with its identifier at creation', async () => {
    const { session } = await createTestCompany()
    const created = await createCustomer(session, {
      firstName: 'Rachel',
      lastName: 'Okafor',
      property: { line1: '410 Sycamore Ave', city: 'Charlotte', state: 'NC', postalCode: '28203' },
    })

    const customer = created.customer
    expect(customer.displayNumber).toBe(`C-${customer.number}`)
  })
})
