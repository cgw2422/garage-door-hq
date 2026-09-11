import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import { completeJob } from '@/server/jobs/completion'
import { addAllRemediesToEstimate, ensureDraftEstimate } from '@/server/estimates/builder'
import { sendEstimate, signEstimate } from '@/server/estimates/lifecycle'
import { startInspection } from '@/server/inspections/service'
import { recordPayment } from '@/server/invoices/service'
import {
  createTestCompany,
  createTestDoor,
  createTestJob,
  skuId,
  stockOf,
  stockTruck,
} from './helpers'

/**
 * Job completion is the one operation that moves inventory, the Door Passport
 * and money together. These tests exist to prove it is all-or-nothing, and that
 * the passport keeps its history when springs are replaced.
 */

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let session: AppSession
let locationId: string

beforeAll(async () => {
  process.env.STORAGE_DRIVER = 'local'
  const company = await createTestCompany({ taxRateBps: 725 })
  session = company.session
  locationId = company.locationId!
})

/** A door, a job, stocked springs, and a signed Better option ready to fit. */
async function setupSignedSpringJob() {
  const { customer, property, door } = await createTestDoor(session)
  const job = await createTestJob(session, {
    customerId: customer.id,
    propertyId: property.id,
    doorId: door.id,
  })

  await stockTruck(session, [
    { sku: 'TS-2250-200-270-L25', quantity: 4 },
    { sku: 'TS-2250-200-270-R25', quantity: 4 },
    { sku: 'RLR-NYL-13', quantity: 40 },
  ])

  const inspection = await startInspection(session, job.id)
  const springs = await prisma.inspectionItem.findFirstOrThrow({
    where: { inspectionId: inspection.id, componentKey: 'springs' },
  })
  await prisma.inspectionItem.update({ where: { id: springs.id }, data: { status: 'FAILED' } })

  await addAllRemediesToEstimate(session, {
    jobId: job.id,
    inspectionItemId: springs.id,
    componentKey: 'springs',
  })

  const estimate = await ensureDraftEstimate(session, job.id)
  await sendEstimate(session, estimate.id)

  const better = await prisma.estimateOption.findFirstOrThrow({
    where: { estimateId: estimate.id, tier: 'BETTER' },
  })
  await signEstimate(session, {
    estimateId: estimate.id,
    optionId: better.id,
    signerName: 'Sam Tester',
    signatureDataUrl: PNG,
  })

  return { job, door, customer, estimate, option: better }
}

describe('completing a job', () => {
  it('deducts inventory, updates the passport and invoices the signed option', async () => {
    const { job, door, option } = await setupSignedSpringJob()

    const leftId = await skuId(session.organizationId, 'TS-2250-200-270-L25')
    const rightId = await skuId(session.organizationId, 'TS-2250-200-270-R25')
    const stockBefore = await stockOf(locationId, leftId)

    const result = await completeJob(session, {
      jobId: job.id,
      partsUsed: [
        { priceBookItemId: leftId, quantity: 1 },
        { priceBookItemId: rightId, quantity: 1 },
      ],
      workSummary: 'Replaced both torsion springs and balanced the door.',
      createInvoice: true,
      sendInvoice: true,
      signature: { signerName: 'Sam Tester', dataUrl: PNG },
      requestReview: false,
    })

    // Inventory
    expect(await stockOf(locationId, leftId)).toBe(stockBefore - 1)
    const consumption = await prisma.inventoryTransaction.findMany({
      where: { jobId: job.id, kind: 'CONSUMPTION' },
    })
    expect(consumption).toHaveLength(2)
    expect(consumption.every((txn) => txn.fromLocationId === locationId)).toBe(true)

    // Door Passport
    expect(result.springSystemReplaced).toBe(true)
    const systems = await prisma.springSystem.findMany({
      where: { doorId: door.id },
      orderBy: { createdAt: 'asc' },
      include: { springs: true },
    })
    expect(systems).toHaveLength(2)
    expect(systems[0]!.isCurrent).toBe(false)
    expect(systems[0]!.replacedAt).not.toBeNull()
    expect(systems[1]!.isCurrent).toBe(true)
    // The new configuration is the 25,000-cycle pair that was fitted.
    expect(systems[1]!.springs.every((spring) => spring.cycleRating === 25000)).toBe(true)
    expect(systems[0]!.springs.every((spring) => spring.cycleRating === 10000)).toBe(true)

    const events = await prisma.doorEvent.findMany({
      where: { doorId: door.id },
      orderBy: { occurredAt: 'asc' },
    })
    const springEvent = events.find((event) => event.kind === 'SPRING_REPLACED')
    expect(springEvent).toBeTruthy()
    // The timeline says what changed, both sides of it.
    expect(springEvent!.detail).toContain('→')
    expect(springEvent!.detail).toContain('10,000 cycle')
    expect(springEvent!.detail).toContain('25,000 cycle')
    expect(springEvent!.jobId).toBe(job.id)

    // Invoice matches the signed option exactly.
    expect(result.invoiceId).toBeTruthy()
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: result.invoiceId! },
      include: { items: true },
    })
    expect(invoice.totalCents).toBe(option.totalCents)
    expect(invoice.balanceCents).toBe(option.totalCents)
    expect(invoice.status).toBe('SENT')
    expect(invoice.items.length).toBeGreaterThan(0)

    // Job state and costing
    const completed = await prisma.job.findUniqueOrThrow({ where: { id: job.id } })
    expect(completed.status).toBe('COMPLETED')
    expect(completed.completedAt).not.toBeNull()
    expect(completed.revenueCents).toBe(option.totalCents)
    expect(completed.partsCostCents).toBeGreaterThan(0)

    // Completion signature
    const signature = await prisma.signature.findFirstOrThrow({
      where: { jobId: job.id, kind: 'JOB_COMPLETION' },
    })
    expect(signature.signerName).toBe('Sam Tester')
  })

  it('refuses to complete twice', async () => {
    const job = await prisma.job.findFirstOrThrow({
      where: { organizationId: session.organizationId, status: 'COMPLETED' },
    })
    await expect(completeJob(session, { jobId: job.id, partsUsed: [] })).rejects.toThrow(
      /already completed/i,
    )
  })
})

describe('completion is all or nothing', () => {
  it('writes nothing when a part exceeds what is on the truck', async () => {
    const { job, door } = await setupSignedSpringJob()
    const leftId = await skuId(session.organizationId, 'TS-2250-200-270-L25')

    const stockBefore = await stockOf(locationId, leftId)
    const invoicesBefore = await prisma.invoice.count({ where: { jobId: job.id } })
    const eventsBefore = await prisma.doorEvent.count({ where: { doorId: door.id } })
    const partsBefore = await prisma.jobPart.count({ where: { jobId: job.id } })

    await expect(
      completeJob(session, {
        jobId: job.id,
        // Far more than the four on the truck.
        partsUsed: [{ priceBookItemId: leftId, quantity: 99 }],
        createInvoice: true,
      }),
    ).rejects.toThrow(/not enough stock/i)

    // Every side effect rolled back together.
    expect(await stockOf(locationId, leftId)).toBe(stockBefore)
    expect(await prisma.invoice.count({ where: { jobId: job.id } })).toBe(invoicesBefore)
    expect(await prisma.doorEvent.count({ where: { doorId: door.id } })).toBe(eventsBefore)
    expect(await prisma.jobPart.count({ where: { jobId: job.id } })).toBe(partsBefore)
    expect(
      await prisma.inventoryTransaction.count({ where: { jobId: job.id, kind: 'CONSUMPTION' } }),
    ).toBe(0)

    const stillOpen = await prisma.job.findUniqueOrThrow({ where: { id: job.id } })
    expect(stillOpen.status).not.toBe('COMPLETED')
    expect(stillOpen.completedAt).toBeNull()

    // The spring system is untouched: still one, still current.
    const systems = await prisma.springSystem.findMany({ where: { doorId: door.id } })
    expect(systems).toHaveLength(1)
    expect(systems[0]!.isCurrent).toBe(true)
  })

  it('rejects a part that is not in the price book before touching anything', async () => {
    const { job } = await setupSignedSpringJob()
    await expect(
      completeJob(session, {
        jobId: job.id,
        partsUsed: [{ priceBookItemId: '00000000-0000-4000-8000-000000000000', quantity: 1 }],
      }),
    ).rejects.toThrow(/no longer in your price book/i)

    const stillOpen = await prisma.job.findUniqueOrThrow({ where: { id: job.id } })
    expect(stillOpen.status).not.toBe('COMPLETED')
  })
})

describe('job without an estimate', () => {
  it('invoices the parts actually used', async () => {
    const { customer, property } = await createTestDoor(session)
    const job = await createTestJob(session, {
      customerId: customer.id,
      propertyId: property.id,
    })
    await stockTruck(session, [{ sku: 'RLR-NYL-13', quantity: 20 }])
    const rollerId = await skuId(session.organizationId, 'RLR-NYL-13')

    const result = await completeJob(session, {
      jobId: job.id,
      partsUsed: [{ priceBookItemId: rollerId, quantity: 10 }],
      createInvoice: true,
    })

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: result.invoiceId! },
      include: { items: true },
    })
    expect(invoice.items).toHaveLength(1)
    expect(invoice.items[0]!.sku).toBe('RLR-NYL-13')
    expect(Number(invoice.items[0]!.quantity.toString())).toBe(10)
    expect(invoice.totalCents).toBeGreaterThan(0)
  })
})

describe('payments', () => {
  it('updates the balance, the status and the job costing together', async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { organizationId: session.organizationId, balanceCents: { gt: 0 }, jobId: { not: null } },
      orderBy: { createdAt: 'desc' },
    })

    const half = Math.floor(invoice.totalCents / 2)
    await recordPayment(session, {
      invoiceId: invoice.id,
      method: 'CARD',
      amountCents: half,
      feeCents: 300,
    })

    const partial = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(partial.status).toBe('PARTIAL')
    expect(partial.balanceCents).toBe(invoice.totalCents - half)

    const job = await prisma.job.findUniqueOrThrow({ where: { id: invoice.jobId! } })
    expect(job.processingFeeCents).toBe(300)

    await recordPayment(session, {
      invoiceId: invoice.id,
      method: 'CASH',
      amountCents: invoice.totalCents - half,
    })

    const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(paid.status).toBe('PAID')
    expect(paid.balanceCents).toBe(0)
    expect(paid.paidAt).not.toBeNull()
  })

  it('refuses to overpay an invoice', async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { organizationId: session.organizationId, status: 'PAID' },
    })
    await expect(
      recordPayment(session, { invoiceId: invoice.id, method: 'CASH', amountCents: 1000 }),
    ).rejects.toThrow(/outstanding/i)
  })
})
