import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import {
  addAllRemediesToEstimate,
  addRemedyToEstimate,
  ensureDraftEstimate,
  setEstimateTaxRate,
} from '@/server/estimates/builder'
import { sendEstimate, signEstimate } from '@/server/estimates/lifecycle'
import { startInspection } from '@/server/inspections/service'
import { hashDocument } from '@/server/estimates/documents'
import { createTestCompany, createTestDoor, createTestJob } from './helpers'

/**
 * The inspection-to-estimate path and the guarantees that make a signed
 * estimate trustworthy.
 */

let session: AppSession
let jobId: string
let inspectionId: string
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

beforeAll(async () => {
  process.env.STORAGE_DRIVER = 'local'
  const company = await createTestCompany({ taxRateBps: 725 })
  session = company.session

  const { customer, property, door } = await createTestDoor(session)
  const job = await createTestJob(session, {
    customerId: customer.id,
    propertyId: property.id,
    doorId: door.id,
  })
  jobId = job.id

  const inspection = await startInspection(session, jobId)
  inspectionId = inspection.id
})

async function itemFor(componentKey: string) {
  return prisma.inspectionItem.findFirstOrThrow({
    where: { inspectionId, componentKey },
  })
}

async function remedyFor(componentKey: string, name: string) {
  return prisma.inspectionRemedy.findFirstOrThrow({
    where: { organizationId: session.organizationId, componentKey, name },
  })
}

describe('inspection findings become estimate lines', () => {
  it('adds a package as itemized lines on the right tier', async () => {
    const rollers = await itemFor('rollers')
    await prisma.inspectionItem.update({ where: { id: rollers.id }, data: { status: 'WORN' } })

    const remedy = await remedyFor('rollers', 'Nylon Roller Upgrade')
    const result = await addRemedyToEstimate(session, {
      jobId,
      inspectionItemId: rollers.id,
      remedyId: remedy.id,
    })

    const option = await prisma.estimateOption.findUniqueOrThrow({
      where: { id: result.optionId },
      include: { items: true },
    })

    // The customer sees the rollers and the labor as separate priced lines,
    // not one opaque "package" line.
    expect(option.items.length).toBeGreaterThan(1)
    expect(option.items.map((item) => item.sku)).toContain('RLR-NYL-13')
    expect(option.items.map((item) => item.sku)).toContain('LBR-ROLLER')
    expect(option.totalCents).toBeGreaterThan(0)

    const linked = await prisma.inspectionItem.findUniqueOrThrow({ where: { id: rollers.id } })
    expect(linked.estimateItemId).not.toBeNull()
  })

  it('prices the option from stored line values, not the live price book', async () => {
    const option = await prisma.estimateOption.findFirstOrThrow({
      where: { estimate: { jobId } },
      include: { items: true },
    })
    const expectedSubtotal = option.items.reduce(
      (sum, item) => sum + Math.round(Number(item.quantity.toString()) * item.unitPriceCents),
      0,
    )
    expect(option.subtotalCents).toBe(expectedSubtotal)
  })

  it('puts Good, Better and Best on the estimate in one action', async () => {
    const springs = await itemFor('springs')
    await prisma.inspectionItem.update({ where: { id: springs.id }, data: { status: 'FAILED' } })

    const result = await addAllRemediesToEstimate(session, {
      jobId,
      inspectionItemId: springs.id,
      componentKey: 'springs',
    })

    const options = await prisma.estimateOption.findMany({
      where: { estimateId: result.estimateId },
      include: { items: true },
    })
    const tiers = options.map((option) => option.tier)

    expect(tiers).toContain('GOOD')
    expect(tiers).toContain('BETTER')
    expect(tiers).toContain('BEST')
    // Exactly one recommendation, and it is the middle tier by default.
    expect(options.filter((option) => option.isRecommended)).toHaveLength(1)
    expect(options.find((option) => option.isRecommended)?.tier).toBe('BETTER')

    const best = options.find((option) => option.tier === 'BEST')!
    const good = options.find((option) => option.tier === 'GOOD')!
    expect(best.totalCents).toBeGreaterThan(good.totalCents)
  })

  it('merges a repeat add instead of listing the same part twice', async () => {
    const rollers = await itemFor('rollers')
    const remedy = await remedyFor('rollers', 'Nylon Roller Upgrade')
    const before = await prisma.estimateItem.findFirstOrThrow({
      where: { option: { estimate: { jobId } }, sku: 'RLR-NYL-13' },
    })

    await addRemedyToEstimate(session, { jobId, inspectionItemId: rollers.id, remedyId: remedy.id })

    const lines = await prisma.estimateItem.findMany({
      where: { optionId: before.optionId, sku: 'RLR-NYL-13' },
    })
    expect(lines).toHaveLength(1)
    expect(Number(lines[0]!.quantity.toString())).toBe(
      Number(before.quantity.toString()) * 2,
    )
  })
})

describe('per-document tax', () => {
  it('seeds from the company default and can be overridden without changing it', async () => {
    const estimate = await ensureDraftEstimate(session, jobId)
    expect(estimate.taxRateBps).toBe(725)

    const updated = await setEstimateTaxRate(session, {
      estimateId: estimate.id,
      taxRateBps: 900,
      jurisdiction: 'Mecklenburg County',
    })

    expect(updated.taxRateBps).toBe(900)
    expect(updated.taxRateOverridden).toBe(true)
    expect(updated.taxJurisdiction).toBe('Mecklenburg County')

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: session.organizationId },
    })
    expect(organization.defaultTaxRateBps).toBe(725)

    // Every option is recalculated at the new rate.
    const options = await prisma.estimateOption.findMany({ where: { estimateId: estimate.id } })
    for (const option of options) {
      expect(option.totalCents).toBe(option.subtotalCents + option.taxCents)
    }
  })
})

describe('signing freezes the document', () => {
  it('records a version whose hash matches its snapshot, and locks the estimate', async () => {
    const estimate = await ensureDraftEstimate(session, jobId)
    await sendEstimate(session, estimate.id)

    const better = await prisma.estimateOption.findFirstOrThrow({
      where: { estimateId: estimate.id, tier: 'BETTER' },
    })

    const { signature, version } = await signEstimate(session, {
      estimateId: estimate.id,
      optionId: better.id,
      signerName: 'Sam Tester',
      signatureDataUrl: PNG,
    })

    expect(signature.documentHash).toBe(version.contentHash)
    expect(hashDocument(version.snapshot)).toBe(version.contentHash)
    expect(signature.estimateVersionId).toBe(version.id)

    const accepted = await prisma.estimate.findUniqueOrThrow({ where: { id: estimate.id } })
    expect(accepted.status).toBe('ACCEPTED')
    expect(accepted.selectedOptionId).toBe(better.id)

    // The snapshot carries the option totals the customer actually saw.
    const snapshot = version.snapshot as { options: Array<{ tier: string; totalCents: number }> }
    const signedOption = snapshot.options.find((option) => option.tier === 'BETTER')
    expect(signedOption?.totalCents).toBe(better.totalCents)
  })

  it('refuses to edit an accepted estimate', async () => {
    const estimate = await prisma.estimate.findFirstOrThrow({
      where: { jobId, status: 'ACCEPTED' },
    })
    await expect(
      setEstimateTaxRate(session, { estimateId: estimate.id, taxRateBps: 100 }),
    ).rejects.toThrow(/accepted and signed/i)
  })

  it('refuses to sign the same estimate twice', async () => {
    const estimate = await prisma.estimate.findFirstOrThrow({
      where: { jobId, status: 'ACCEPTED' },
      include: { options: true },
    })
    await expect(
      signEstimate(session, {
        estimateId: estimate.id,
        optionId: estimate.options[0]!.id,
        signerName: 'Someone Else',
        signatureDataUrl: PNG,
      }),
    ).rejects.toThrow(/already been signed/i)
  })
})
