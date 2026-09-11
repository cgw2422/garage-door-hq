import { describe, expect, it } from 'vitest'
import { formatCents, parseDollarsToCents, taxCentsFor } from '@/lib/money'
import { computeTotals, hashDocument } from '@/server/estimates/documents'

describe('money', () => {
  it('formats cents without floating point drift', () => {
    expect(formatCents(124700)).toBe('$1,247.00')
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(-5099)).toBe('-$50.99')
  })

  it('parses typed dollars into integer cents', () => {
    expect(parseDollarsToCents('$1,247.00')).toBe(124700)
    expect(parseDollarsToCents('329')).toBe(32900)
    expect(parseDollarsToCents('0.1')).toBe(10)
    expect(parseDollarsToCents('abc')).toBeNull()
  })

  it('computes tax from basis points exactly', () => {
    // 7.25% of $429.00 is $31.10 to the cent.
    expect(taxCentsFor(42900, 725)).toBe(3110)
  })
})

describe('estimate totals', () => {
  it('taxes only taxable lines and reports discounts separately', () => {
    const totals = computeTotals(
      [
        { quantity: 2, unitPriceCents: 13900, taxable: true }, // springs
        { quantity: 1, unitPriceCents: 14900, taxable: false }, // labor
        { quantity: 1, unitPriceCents: -2500, taxable: false }, // discount
      ],
      725,
    )

    expect(totals.subtotalCents).toBe(27800 + 14900 - 2500)
    expect(totals.discountCents).toBe(2500)
    expect(totals.taxCents).toBe(taxCentsFor(27800, 725))
    expect(totals.totalCents).toBe(totals.subtotalCents + totals.taxCents)
  })

  it('hashes documents independently of key order', () => {
    const a = { name: 'Spring Replacement', totalCents: 42900, items: [{ sku: 'X', qty: 2 }] }
    const b = { items: [{ qty: 2, sku: 'X' }], totalCents: 42900, name: 'Spring Replacement' }
    expect(hashDocument(a)).toBe(hashDocument(b))
  })

  it('produces a different hash when a price changes', () => {
    const before = { totalCents: 42900 }
    const after = { totalCents: 43900 }
    expect(hashDocument(before)).not.toBe(hashDocument(after))
  })
})
