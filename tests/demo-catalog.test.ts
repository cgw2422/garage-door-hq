import { describe, expect, it } from 'vitest'
import { DEMO_CATALOG, DEMO_PACKAGES, DEMO_PRICE, DEMO_SERVICES } from '@/server/demo/catalog'

/**
 * The demo company's flat-rate menu, as the operator wrote it.
 *
 * Reproduced here from the source rather than from the code under test, so
 * that editing one number in catalog.ts without meaning to fails loudly. The
 * costs matter as much as the prices: the "My Cost" column is the whole point
 * of showing a garage door owner what the product knows about their margin.
 */
const MENU: Array<[name: string, price: number, cost: number]> = [
  ['Roller Swap + Tuneup', 12900, 2500],
  ['Cable Reset', 15900, 0],
  ['Single Spring Change', 34900, 3700],
  ['Double Spring Change', 49900, 8000],
  ['Chain Opener', 49900, 20000],
  ['Belt Opener', 55000, 24900],
  ['Camera Belt Opener', 74900, 33000],
  ['2 Sensors', 12900, 2000],
  ['WD Torsion Spring', 54900, 10000],
  ['Cables', 7900, 1500],
  ['Customer provided Opener', 30000, 0],
]

describe('the flat-rate menu', () => {
  it('is exactly the eleven services, at the stated prices and costs', () => {
    expect(DEMO_SERVICES.map((s) => [s.name, s.priceCents, s.costCents])).toEqual(MENU)
  })

  it('keeps the operator’s own wording', () => {
    // "Tuneup", "2 Sensors", "WD" — their sheet, not a tidied-up version of it.
    const names = DEMO_SERVICES.map((service) => service.name)
    expect(names).toContain('Roller Swap + Tuneup')
    expect(names).toContain('WD Torsion Spring')
    expect(names).toContain('Customer provided Opener')
  })

  // Flat rate means the number quoted is the number paid. Tax added at the
  // bottom of the page would make the menu a lie.
  it('bills flat, so nothing is added at the bottom of the estimate', () => {
    for (const service of DEMO_SERVICES) {
      expect(service.taxable, service.name).toBe(false)
    }
  })

  // The service is not stock; the parts it consumes are. That is what keeps
  // the ledger, the restock list and the margin figure all meaningful.
  it('is not stocked, while the parts behind it still are', () => {
    for (const service of DEMO_SERVICES) {
      expect(service.trackInventory, service.name).toBe(false)
    }
    const rollers = DEMO_CATALOG.parts.find((part) => part.sku === 'RLR-NYL-13')
    expect(rollers?.trackInventory ?? true).toBe(true)
  })

  it('never sells the same thing twice, as a part and as a job', () => {
    const skus = DEMO_CATALOG.parts.map((part) => part.sku)
    expect(skus).not.toContain('OPN-BELT-STD')
    expect(skus).not.toContain('OPN-WALL-MNT')
    expect(skus).not.toContain('EYE-PAIR')
  })

  it('makes money on every job that has a cost', () => {
    for (const service of DEMO_SERVICES) {
      expect(service.priceCents, service.name).toBeGreaterThan(service.costCents)
    }
  })
})

describe('what the technician can offer', () => {
  it('prices every package line from the menu', () => {
    const known = new Set(Object.keys(DEMO_PRICE))
    for (const pkg of DEMO_PACKAGES) {
      for (const line of pkg.lines) {
        expect(known, `${pkg.name} → ${line.sku}`).toContain(line.sku)
      }
    }
  })

  it('gives a broken spring a good, a better and a best', () => {
    const single = DEMO_PRICE['FR-SPRING-1']!.priceCents
    const double = DEMO_PRICE['FR-SPRING-2']!.priceCents
    const rollers = DEMO_PRICE['FR-ROLLER-TUNE']!.priceCents

    expect(single).toBe(34900)
    expect(double).toBe(49900)
    expect(double + rollers).toBe(62800)

    const tiers = DEMO_PACKAGES.filter((pkg) => pkg.key.startsWith('spring-')).map(
      (pkg) => pkg.defaultTier,
    )
    expect(tiers).toEqual(['GOOD', 'BETTER', 'BEST'])
  })

  it('points every remedy at something that exists', () => {
    const skus = new Set(DEMO_CATALOG.parts.map((part) => part.sku))
    const packageKeys = new Set(DEMO_PACKAGES.map((pkg) => pkg.key))

    for (const remedy of DEMO_CATALOG.remedies) {
      if (remedy.packageKey) {
        expect(packageKeys, remedy.name).toContain(remedy.packageKey)
      } else {
        expect(skus, remedy.name).toContain(remedy.sku)
      }
    }
  })

  it('offers nothing for a component the menu has no price for', () => {
    // A flat-rate shop quoting a bent track from a generic hourly rate it does
    // not publish would be guessing. The technician adds those by hand.
    const covered = new Set(DEMO_CATALOG.remedies.map((remedy) => remedy.componentKey))
    expect(covered.has('tracks')).toBe(false)
    expect(covered.has('panels')).toBe(false)
  })
})
