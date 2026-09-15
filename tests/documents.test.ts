import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import { buildEstimateDocument, buildInvoiceDocument } from '@/server/documents/build'
import { renderEstimatePdf, renderInvoicePdf } from '@/server/documents/pdf/documents'
import { addAllRemediesToEstimate, ensureDraftEstimate } from '@/server/estimates/builder'
import { sendEstimate, signEstimate } from '@/server/estimates/lifecycle'
import { startInspection } from '@/server/inspections/service'
import { completeJob } from '@/server/jobs/completion'
import { createTestCompany, createTestDoor, createTestJob, skuId, stockTruck } from './helpers'

/**
 * PDF source correctness.
 *
 * The rule this file exists to protect: a signed estimate renders from the
 * frozen version the customer approved, never from current mutable rows.
 */

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let session: AppSession
let estimateId: string
let jobId: string
let signedTotalCents = 0

beforeAll(async () => {
  process.env.STORAGE_DRIVER = 'local'
  const company = await createTestCompany({ taxRateBps: 725 })
  session = company.session

  await prisma.organization.update({
    where: { id: session.organizationId },
    data: {
      addressLine1: '1 Shop Road',
      city: 'Charlotte',
      state: 'NC',
      postalCode: '28206',
      phone: '(555) 000-1111',
      estimateTermsText: 'Work warranted for 12 months.',
      invoiceTermsText: 'Payment due on receipt.',
    },
  })

  const { customer, property, door } = await createTestDoor(session)
  const job = await createTestJob(session, {
    customerId: customer.id,
    propertyId: property.id,
    doorId: door.id,
  })
  jobId = job.id

  await stockTruck(session, [
    { sku: 'TS-2250-200-270-L25', quantity: 4 },
    { sku: 'TS-2250-200-270-R25', quantity: 4 },
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
  estimateId = estimate.id
  await sendEstimate(session, estimateId)

  const better = await prisma.estimateOption.findFirstOrThrow({
    where: { estimateId, tier: 'BETTER' },
  })
  signedTotalCents = better.totalCents

  await signEstimate(session, {
    approvalMethod: 'REMOTE_LINK',
    estimateId,
    optionId: better.id,
    signerName: 'Sam Tester',
    signatureDataUrl: PNG,
  })
})

describe('estimate documents', () => {
  it('marks a never-sent estimate as a draft', async () => {
    const other = await createTestJob(session, {
      customerId: (await prisma.estimate.findUniqueOrThrow({ where: { id: estimateId } }))
        .customerId,
      propertyId: (
        await prisma.job.findUniqueOrThrow({ where: { id: jobId }, select: { propertyId: true } })
      ).propertyId,
    })
    const draft = await ensureDraftEstimate(session, other.id)

    const doc = await buildEstimateDocument({
      organizationId: session.organizationId,
      estimateId: draft.id,
    })
    expect(doc?.isDraft).toBe(true)
    expect(doc?.versionNumber).toBeNull()
  })

  it('renders a signed estimate from its frozen version', async () => {
    const doc = await buildEstimateDocument({
      organizationId: session.organizationId,
      estimateId,
    })

    expect(doc?.isDraft).toBe(false)
    expect(doc?.versionNumber).not.toBeNull()
    expect(doc?.signature?.signerName).toBe('Sam Tester')
    expect(doc?.signature?.documentHash).toMatch(/^[0-9a-f]{64}$/)

    const selected = doc!.options.find((option) => option.isSelected)
    expect(selected?.tier).toBe('BETTER')
    expect(selected?.totalCents).toBe(signedTotalCents)

    // Carries the company and service details the customer saw.
    expect(doc!.company.name).toBe(session.organizationName)
    expect(doc!.serviceAddress?.length).toBeGreaterThan(0)
    expect(doc!.doorLine).toBeTruthy()
    expect(doc!.termsText).toContain('12 months')
  })

  it('keeps rendering the signed numbers after the price book changes', async () => {
    const spring = await prisma.priceBookItem.findFirstOrThrow({
      where: { organizationId: session.organizationId, sku: 'TS-2250-200-270-L25' },
    })
    await prisma.priceBookItem.update({
      where: { id: spring.id },
      data: { priceCents: spring.priceCents * 5 },
    })

    // And even if someone edits the live option rows directly.
    await prisma.estimateOption.updateMany({
      where: { estimateId, tier: 'BETTER' },
      data: { totalCents: 1 },
    })

    const doc = await buildEstimateDocument({
      organizationId: session.organizationId,
      estimateId,
    })
    const selected = doc!.options.find((option) => option.isSelected)
    expect(selected?.totalCents).toBe(signedTotalCents)
    expect(selected?.totalCents).not.toBe(1)
  })

  it('produces a real PDF', async () => {
    const doc = await buildEstimateDocument({
      organizationId: session.organizationId,
      estimateId,
    })
    const pdf = await renderEstimatePdf(doc!)

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(2000)
  })

  it('does not build a document for another organization estimate', async () => {
    const other = await createTestCompany()
    const doc = await buildEstimateDocument({
      organizationId: other.session.organizationId,
      estimateId,
    })
    expect(doc).toBeNull()
  })
})

describe('invoice documents', () => {
  it('renders the invoice from its own snapshotted lines', async () => {
    const leftId = await skuId(session.organizationId, 'TS-2250-200-270-L25')
    const rightId = await skuId(session.organizationId, 'TS-2250-200-270-R25')

    const completion = await completeJob(session, {
      jobId,
      partsUsed: [
        { priceBookItemId: leftId, quantity: 1 },
        { priceBookItemId: rightId, quantity: 1 },
      ],
      createInvoice: true,
      sendInvoice: true,
    })

    const doc = await buildInvoiceDocument({
      organizationId: session.organizationId,
      invoiceId: completion.invoiceId!,
    })

    expect(doc?.totalCents).toBe(signedTotalCents)
    expect(doc?.balanceCents).toBe(signedTotalCents)
    expect(doc?.lines.length).toBeGreaterThan(0)
    expect(doc?.termsText).toContain('due on receipt')
    expect(doc?.estimateReference).toBeTruthy()

    const pdf = await renderInvoicePdf(doc!)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
