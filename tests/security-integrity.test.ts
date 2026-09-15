import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import {
  addCatalogItemToEstimate,
  ensureDraftEstimate,
  setEstimateTaxRate,
  updateEstimateItemQuantity,
} from '@/server/estimates/builder'
import { signEstimate } from '@/server/estimates/lifecycle'
import { completeJob } from '@/server/jobs/completion'
import { recordPayment } from '@/server/invoices/service'
import { updateItem } from '@/server/pricebook/service'
import { buildEstimateDocument } from '@/server/documents/build'
import { createTestCompany, createTestDoor, createTestJob, skuId, stockTruck } from './helpers'

/**
 * Money and stock, under a hostile payload.
 *
 * The arithmetic itself is covered elsewhere. What this file is for is the
 * assumption underneath it: that nothing a browser sends is ever treated as a
 * price, a total or a balance. A technician editing a request should be able
 * to change *what* is on an estimate and never *what it costs*.
 */

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let session: AppSession
let rollerId: string

beforeAll(async () => {
  process.env.STORAGE_DRIVER = 'local'
  session = (await createTestCompany({ taxRateBps: 725 })).session
  rollerId = await skuId(session.organizationId, 'RLR-NYL-13')
}, 60_000)

async function freshEstimate() {
  const { customer, property, door } = await createTestDoor(session)
  const job = await createTestJob(session, {
    customerId: customer.id,
    propertyId: property.id,
    doorId: door.id,
  })
  const estimate = await ensureDraftEstimate(session, job.id)
  return { jobId: job.id, estimateId: estimate.id }
}

describe('the price comes from the price book, never from the request', () => {
  it('ignores any price, cost or total a caller tries to supply', async () => {
    const { estimateId } = await freshEstimate()
    const catalog = await prisma.priceBookItem.findUniqueOrThrow({ where: { id: rollerId } })

    // Everything an attacker would try to smuggle in alongside the item.
    await addCatalogItemToEstimate(session, {
      estimateId,
      priceBookItemId: rollerId,
      quantity: 1,
      ...({
        unitPriceCents: 1,
        priceCents: 1,
        lineCents: 1,
        totalCents: 1,
        unitCostCents: 999_999,
      } as unknown as Record<string, never>),
    })

    const line = await prisma.estimateItem.findFirstOrThrow({
      where: { option: { estimateId } },
    })
    expect(line.unitPriceCents).toBe(catalog.priceCents)
    expect(line.unitCostCents).toBe(catalog.costCents)

    const option = await prisma.estimateOption.findFirstOrThrow({ where: { estimateId } })
    expect(option.subtotalCents).toBe(catalog.priceCents)
    expect(option.totalCents).toBe(
      catalog.priceCents + Math.round((catalog.priceCents * 725) / 10_000),
    )
  })

  it('recomputes the option total from its own lines after every change', async () => {
    const { estimateId } = await freshEstimate()
    await addCatalogItemToEstimate(session, { estimateId, priceBookItemId: rollerId, quantity: 3 })

    const option = await prisma.estimateOption.findFirstOrThrow({
      where: { estimateId },
      include: { items: true },
    })
    const expected = option.items.reduce(
      (sum, item) => sum + Math.round(Number(item.quantity.toString()) * item.unitPriceCents),
      0,
    )
    expect(option.subtotalCents).toBe(expected)
    expect(option.totalCents).toBe(expected + option.taxCents)

    // Tamper with the stored total directly, then make any edit: the server's
    // own arithmetic must win.
    await prisma.estimateOption.update({
      where: { id: option.id },
      data: { subtotalCents: 1, totalCents: 1 },
    })
    await updateEstimateItemQuantity(session, { itemId: option.items[0]!.id, quantity: 3 })

    const after = await prisma.estimateOption.findUniqueOrThrow({ where: { id: option.id } })
    expect(after.subtotalCents).toBe(expected)
  })
})

describe('quantities', () => {
  it('refuses zero, negative, infinite and absurd quantities', async () => {
    const { estimateId } = await freshEstimate()
    for (const quantity of [0, -1, -0.5, Number.NaN, Number.POSITIVE_INFINITY, 1e15, 10_000]) {
      await expect(
        addCatalogItemToEstimate(session, { estimateId, priceBookItemId: rollerId, quantity }),
        `quantity ${quantity} was accepted`,
      ).rejects.toThrow()
    }
    expect(await prisma.estimateItem.count({ where: { option: { estimateId } } })).toBe(0)
  })

  it('refuses the same values on an existing line', async () => {
    const { estimateId } = await freshEstimate()
    await addCatalogItemToEstimate(session, { estimateId, priceBookItemId: rollerId, quantity: 1 })
    const line = await prisma.estimateItem.findFirstOrThrow({ where: { option: { estimateId } } })

    for (const quantity of [0, -5, Number.POSITIVE_INFINITY, 1e15]) {
      await expect(
        updateEstimateItemQuantity(session, { itemId: line.id, quantity }),
      ).rejects.toThrow()
    }
    const after = await prisma.estimateItem.findUniqueOrThrow({ where: { id: line.id } })
    expect(Number(after.quantity.toString())).toBe(1)
  })
})

describe('tax', () => {
  it('refuses a negative rate or one above the legal ceiling', async () => {
    const { estimateId } = await freshEstimate()
    for (const taxRateBps of [-1, -10_000, 5001, 1_000_000]) {
      await expect(setEstimateTaxRate(session, { estimateId, taxRateBps })).rejects.toThrow()
    }
    const estimate = await prisma.estimate.findUniqueOrThrow({ where: { id: estimateId } })
    expect(estimate.taxRateBps).toBe(725)
  })

  it('is applied by the server, not carried in from the line', async () => {
    const { estimateId } = await freshEstimate()
    await addCatalogItemToEstimate(session, { estimateId, priceBookItemId: rollerId, quantity: 2 })
    await setEstimateTaxRate(session, { estimateId, taxRateBps: 1000 })

    const option = await prisma.estimateOption.findFirstOrThrow({ where: { estimateId } })
    expect(option.taxCents).toBe(Math.round((option.subtotalCents * 1000) / 10_000))
    expect(option.totalCents).toBe(option.subtotalCents + option.taxCents)
  })
})

describe('a signed estimate', () => {
  it('keeps its own numbers when the price book moves underneath it', async () => {
    const { estimateId } = await freshEstimate()
    await addCatalogItemToEstimate(session, { estimateId, priceBookItemId: rollerId, quantity: 2 })
    const option = await prisma.estimateOption.findFirstOrThrow({ where: { estimateId } })

    const { version, signature } = await signEstimate(session, {
      estimateId,
      optionId: option.id,
      signerName: 'Sam Tester',
      signatureDataUrl: PNG,
      approvalMethod: 'IN_PERSON_DEVICE',
    })
    const signedTotal = option.totalCents

    // Ten times the price, after the fact.
    const catalog = await prisma.priceBookItem.findUniqueOrThrow({ where: { id: rollerId } })
    await updateItem(session, rollerId, {
      name: catalog.name,
      category: catalog.category,
      sku: catalog.sku,
      costCents: catalog.costCents,
      priceCents: catalog.priceCents * 10,
      taxable: catalog.taxable,
      trackInventory: catalog.trackInventory,
    })

    const document = await buildEstimateDocument({
      organizationId: session.organizationId,
      estimateId,
    })
    const rendered = document!.options.find((entry) => entry.name === option.name)
    expect(rendered?.totalCents, 'the signed document followed the new price').toBe(signedTotal)

    // And the signature still matches the version it was taken over.
    expect(signature.documentHash).toBe(version.contentHash)
    const stored = await prisma.estimateVersion.findUniqueOrThrow({ where: { id: version.id } })
    expect(stored.contentHash).toBe(signature.documentHash)
  })

  it('cannot be edited at all after acceptance', async () => {
    const { estimateId } = await freshEstimate()
    await addCatalogItemToEstimate(session, { estimateId, priceBookItemId: rollerId, quantity: 1 })
    const option = await prisma.estimateOption.findFirstOrThrow({
      where: { estimateId },
      include: { items: true },
    })
    await signEstimate(session, {
      estimateId,
      optionId: option.id,
      signerName: 'Sam Tester',
      signatureDataUrl: PNG,
      approvalMethod: 'REMOTE_LINK',
    })

    await expect(
      addCatalogItemToEstimate(session, { estimateId, priceBookItemId: rollerId, quantity: 1 }),
    ).rejects.toThrow()
    await expect(
      updateEstimateItemQuantity(session, { itemId: option.items[0]!.id, quantity: 5 }),
    ).rejects.toThrow()
    await expect(setEstimateTaxRate(session, { estimateId, taxRateBps: 0 })).rejects.toThrow()
  })
})

describe('payments', () => {
  it('refuses a zero, negative or overpaying amount', async () => {
    const { customer } = await createTestDoor(session)
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: session.organizationId,
        number: Math.floor(Math.random() * 100_000),
        customerId: customer.id,
        status: 'SENT',
        subtotalCents: 10_000,
        taxCents: 0,
        totalCents: 10_000,
        paidCents: 0,
        balanceCents: 10_000,
      },
    })

    for (const amountCents of [0, -1, -100_000]) {
      await expect(
        recordPayment(session, { invoiceId: invoice.id, amountCents, method: 'CASH' }),
      ).rejects.toThrow()
    }
    await expect(
      recordPayment(session, { invoiceId: invoice.id, amountCents: 10_001, method: 'CASH' }),
    ).rejects.toThrow()

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(after.paidCents).toBe(0)
    expect(after.balanceCents).toBe(10_000)
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(0)
  })

  it('keeps the balance equal to total minus paid, always', async () => {
    const { customer } = await createTestDoor(session)
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: session.organizationId,
        number: Math.floor(Math.random() * 100_000),
        customerId: customer.id,
        status: 'SENT',
        subtotalCents: 10_000,
        taxCents: 0,
        totalCents: 10_000,
        paidCents: 0,
        balanceCents: 10_000,
      },
    })

    await recordPayment(session, { invoiceId: invoice.id, amountCents: 4_000, method: 'CASH' })
    let row = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(row.paidCents).toBe(4_000)
    expect(row.balanceCents).toBe(row.totalCents - row.paidCents)
    expect(row.status).toBe('PARTIAL')

    await recordPayment(session, { invoiceId: invoice.id, amountCents: 6_000, method: 'CASH' })
    row = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(row.balanceCents).toBe(0)
    expect(row.status).toBe('PAID')
  })

  it('stores no card number anywhere, whatever it is handed', async () => {
    const { customer } = await createTestDoor(session)
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: session.organizationId,
        number: Math.floor(Math.random() * 100_000),
        customerId: customer.id,
        status: 'SENT',
        subtotalCents: 1_000,
        taxCents: 0,
        totalCents: 1_000,
        paidCents: 0,
        balanceCents: 1_000,
      },
    })

    await recordPayment(session, {
      invoiceId: invoice.id,
      amountCents: 1_000,
      method: 'CARD',
      reference: '4111111111111111',
    })

    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id } })
    // The schema has no column a PAN could live in. `reference` is a free-text
    // field a person types, so the check is that nothing *else* captured it.
    const columns = Object.entries(payment).filter(([key]) => key !== 'reference')
    expect(
      columns.some(([, value]) => typeof value === 'string' && /\d{13,19}/.test(value)),
      'something that looks like a card number was stored',
    ).toBe(false)
    expect(payment.providerPaymentId).toBeNull()
  })
})

describe('completing a job', () => {
  it('deducts each part exactly once, even when the request arrives twice at once', async () => {
    const { customer, property, door } = await createTestDoor(session)
    const job = await createTestJob(session, {
      customerId: customer.id,
      propertyId: property.id,
      doorId: door.id,
    })
    await stockTruck(session, [{ sku: 'RLR-NYL-13', quantity: 20 }])

    const before = await prisma.stockLevel.findFirstOrThrow({
      where: { organizationId: session.organizationId, priceBookItemId: rollerId },
    })

    // Two identical completions racing, which is what a double tap on a phone
    // with a slow connection actually produces.
    const results = await Promise.allSettled([
      completeJob(session, {
        jobId: job.id,
        partsUsed: [{ priceBookItemId: rollerId, quantity: 4 }],
        workSummary: 'first',
      }),
      completeJob(session, {
        jobId: job.id,
        partsUsed: [{ priceBookItemId: rollerId, quantity: 4 }],
        workSummary: 'second',
      }),
    ])

    const succeeded = results.filter((result) => result.status === 'fulfilled')
    expect(succeeded, 'both completions were accepted').toHaveLength(1)

    const after = await prisma.stockLevel.findFirstOrThrow({
      where: { organizationId: session.organizationId, priceBookItemId: rollerId },
    })
    expect(
      Number(before.quantity.toString()) - Number(after.quantity.toString()),
      'stock moved more than once for one job',
    ).toBe(4)

    expect(await prisma.invoice.count({ where: { jobId: job.id } })).toBe(1)
    expect(
      await prisma.inventoryTransaction.count({
        where: { jobId: job.id, priceBookItemId: rollerId },
      }),
    ).toBe(1)
  }, 60_000)

  it('never drives a location negative', async () => {
    const { customer, property, door } = await createTestDoor(session)
    const job = await createTestJob(session, {
      customerId: customer.id,
      propertyId: property.id,
      doorId: door.id,
    })

    const before = await prisma.stockLevel.findFirstOrThrow({
      where: { organizationId: session.organizationId, priceBookItemId: rollerId },
    })

    await expect(
      completeJob(session, {
        jobId: job.id,
        partsUsed: [{ priceBookItemId: rollerId, quantity: 100_000 }],
        workSummary: 'more than exists',
      }),
    ).rejects.toThrow()

    const after = await prisma.stockLevel.findFirstOrThrow({
      where: { organizationId: session.organizationId, priceBookItemId: rollerId },
    })
    expect(after.quantity.toString()).toBe(before.quantity.toString())
    expect(await prisma.invoice.count({ where: { jobId: job.id } })).toBe(0)
    const reloaded = await prisma.job.findUniqueOrThrow({ where: { id: job.id } })
    expect(reloaded.status).not.toBe('COMPLETED')
  })
})
