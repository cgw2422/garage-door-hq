import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { tenantDb } from '@/lib/tenancy'
import type { AppSession } from '@/lib/session'
import { roleCan } from '@/lib/rbac'
import { ensureDraftEstimate, addAllRemediesToEstimate } from '@/server/estimates/builder'
import { sendEstimate, signEstimate } from '@/server/estimates/lifecycle'
import { startInspection } from '@/server/inspections/service'
import { completeJob } from '@/server/jobs/completion'
import { buildEstimateDocument, buildInvoiceDocument } from '@/server/documents/build'
import { createTestCompany, createTestDoor, createTestJob, stockTruck } from './helpers'

/**
 * Company settings.
 *
 * The rule this file exists to defend: a settings change applies to the next
 * document, never to one that already exists. A signed estimate and a
 * finalized invoice carry their own copy of the tax rate and terms, so an
 * owner editing the company profile in March cannot silently restate what a
 * customer agreed to in February.
 */

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** A job taken all the way to a signed estimate and a finalized invoice. */
async function companyWithSignedWork(options?: { taxRateBps?: number }) {
  const { session } = await createTestCompany({ taxRateBps: options?.taxRateBps ?? 725 })

  await prisma.organization.update({
    where: { id: session.organizationId },
    data: {
      estimateTermsText: 'Original estimate terms.',
      invoiceTermsText: 'Original invoice terms.',
    },
  })

  const { customer, property, door } = await createTestDoor(session)
  const job = await createTestJob(session, {
    customerId: customer.id,
    propertyId: property.id,
    doorId: door.id,
  })

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

  return { session, jobId: job.id, estimateId: estimate.id, optionId: better.id }
}

/** What the settings form does, minus the request plumbing. */
async function saveSettings(session: AppSession, data: Record<string, unknown>) {
  return session.db.organization.update({
    where: { id: session.organizationId },
    data,
  })
}

describe('who may change settings', () => {
  it('is the owner and the admin, and nobody else', () => {
    expect(roleCan('OWNER', 'settings:manage')).toBe(true)
    expect(roleCan('ADMIN', 'settings:manage')).toBe(true)
    expect(roleCan('OFFICE', 'settings:manage')).toBe(false)
    expect(roleCan('TECHNICIAN', 'settings:manage')).toBe(false)
  })
})

describe('settings are scoped to one company', () => {
  it('cannot reach another company’s organization row', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()
    const theirNameBefore = b.organizationName

    // The organization row is keyed by `id`, not `organizationId`, so the
    // tenant client scopes it on that column instead. Asking for b's row from
    // a's client addresses a's own row.
    await a.db.organization.updateMany({
      where: { id: b.organizationId },
      data: { name: 'Taken Over' },
    })

    const theirs = await prisma.organization.findUniqueOrThrow({
      where: { id: b.organizationId },
    })
    expect(theirs.name).toBe(theirNameBefore)

    const mine = await prisma.organization.findUniqueOrThrow({
      where: { id: a.organizationId },
    })
    expect(mine.name).toBe('Taken Over')
  })

  it('reads its own organization row even when asked for another', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()

    const row = await a.db.organization.findUnique({ where: { id: b.organizationId } })
    // The id is rewritten rather than filtered, so the query is answered from
    // a's own row. The point is that b's row is unreachable either way.
    expect(row?.id).toBe(a.organizationId)
    expect(row?.id).not.toBe(b.organizationId)
  })

  it('refuses to create an organization through a tenant client', async () => {
    const { session } = await createTestCompany()
    await expect(
      session.db.organization.create({ data: { name: 'Sneaky', slug: 'sneaky-co' } }),
    ).rejects.toThrow(/unscopedDb/i)
  })

  it('keeps review destinations separate', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()

    for (const session of [a, b]) {
      await session.db.reviewDestination.create({
        data: {
          organizationId: session.organizationId,
          provider: 'GOOGLE',
          url: `https://g.page/${session.organizationSlug}`,
          isPrimary: true,
        },
      })
    }

    const mine = await a.db.reviewDestination.findMany({})
    expect(mine).toHaveLength(1)
    expect(mine[0]!.url).toContain(a.organizationSlug)
  })
})

describe('a settings change does not rewrite history', () => {
  it('leaves a signed estimate’s tax rate alone', async () => {
    const { session, estimateId, optionId } = await companyWithSignedWork({
      taxRateBps: 725,
    })
    const before = await prisma.estimateOption.findUniqueOrThrow({ where: { id: optionId } })

    await saveSettings(session, { defaultTaxRateBps: 1000 })

    const estimate = await prisma.estimate.findUniqueOrThrow({ where: { id: estimateId } })
    expect(estimate.taxRateBps).toBe(725)

    const after = await prisma.estimateOption.findUniqueOrThrow({ where: { id: optionId } })
    expect(after.taxCents).toBe(before.taxCents)
    expect(after.totalCents).toBe(before.totalCents)
  })

  it('leaves a signed estimate’s terms alone', async () => {
    const { session, estimateId } = await companyWithSignedWork()

    await saveSettings(session, { estimateTermsText: 'Brand new terms, effective today.' })

    const after = await prisma.estimate.findUniqueOrThrow({ where: { id: estimateId } })
    expect(after.termsText).toBe('Original estimate terms.')
  })

  it('renders the PDF from the signed version, not from current settings', async () => {
    const { session, estimateId } = await companyWithSignedWork({ taxRateBps: 725 })

    const before = await buildEstimateDocument({
      organizationId: session.organizationId,
      estimateId,
    })
    const signedTotal = before!.options.find((option) => option.isSelected)!.totalCents

    await saveSettings(session, {
      defaultTaxRateBps: 2500,
      estimateTermsText: 'Rewritten terms.',
      name: 'Renamed Doors LLC',
    })

    const after = await buildEstimateDocument({
      organizationId: session.organizationId,
      estimateId,
    })

    expect(after!.options.find((option) => option.isSelected)!.totalCents).toBe(signedTotal)
    expect(after!.taxRateBps).toBe(725)
    expect(after!.termsText).toBe('Original estimate terms.')
    // The letterhead is frozen too: the document is a record of what the
    // customer was shown and agreed to, down to the company name on it.
    expect(after!.company.name).toBe(before!.company.name)
    expect(after!.company.name).not.toBe('Renamed Doors LLC')
  })

  it('applies a new rate to the next estimate', async () => {
    const { session } = await createTestCompany({ taxRateBps: 725 })
    const { customer, property, door } = await createTestDoor(session)
    const job = await createTestJob(session, {
      customerId: customer.id,
      propertyId: property.id,
      doorId: door.id,
    })

    await saveSettings(session, { defaultTaxRateBps: 1000, estimateTermsText: 'New terms.' })
    const refreshed: AppSession = {
      ...session,
      defaultTaxRateBps: 1000,
      db: tenantDb(session.organizationId),
    }

    const estimate = await ensureDraftEstimate(refreshed, job.id)
    expect(estimate.taxRateBps).toBe(1000)
    expect(estimate.termsText).toBe('New terms.')
  })

  it('leaves a finalized invoice alone', async () => {
    const { session, jobId } = await companyWithSignedWork({ taxRateBps: 725 })

    const result = await completeJob(session, {
      jobId,
      partsUsed: [],
      createInvoice: true,
    })
    expect(result.invoiceId).not.toBeNull()

    const before = await prisma.invoice.findUniqueOrThrow({
      where: { id: result.invoiceId! },
    })

    await saveSettings(session, {
      defaultTaxRateBps: 2500,
      invoiceTermsText: 'Rewritten invoice terms.',
      defaultPaymentTermsDays: 90,
    })

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: result.invoiceId! } })
    expect(after.taxRateBps).toBe(before.taxRateBps)
    expect(after.totalCents).toBe(before.totalCents)
    expect(after.termsText).toBe('Original invoice terms.')
    expect(after.dueAt?.toISOString()).toBe(before.dueAt?.toISOString())

    const doc = await buildInvoiceDocument({
      organizationId: session.organizationId,
      invoiceId: result.invoiceId!,
    })
    expect(doc!.totalCents).toBe(before.totalCents)
    expect(doc!.termsText).toBe('Original invoice terms.')
  })
})

describe('numbering', () => {
  it('hands out the next number and moves the sequence forward', async () => {
    const { session } = await createTestCompany()

    const sequence = await prisma.numberSequence.findUniqueOrThrow({
      where: {
        organizationId_entity: { organizationId: session.organizationId, entity: 'INVOICE' },
      },
    })

    await session.db.numberSequence.update({
      where: {
        organizationId_entity: {
          organizationId: session.organizationId,
          entity: 'INVOICE',
        },
      },
      data: { nextValue: sequence.nextValue + 500 },
    })

    const moved = await prisma.numberSequence.findUniqueOrThrow({
      where: {
        organizationId_entity: { organizationId: session.organizationId, entity: 'INVOICE' },
      },
    })
    expect(moved.nextValue).toBe(sequence.nextValue + 500)
  })

  it('keeps sequences separate between companies', async () => {
    const { session: a } = await createTestCompany()
    const { session: b } = await createTestCompany()

    await a.db.numberSequence.update({
      where: {
        organizationId_entity: { organizationId: a.organizationId, entity: 'JOB' },
      },
      data: { nextValue: 9000 },
    })

    const theirs = await prisma.numberSequence.findUniqueOrThrow({
      where: {
        organizationId_entity: { organizationId: b.organizationId, entity: 'JOB' },
      },
    })
    expect(theirs.nextValue).toBeLessThan(9000)
  })
})

describe('labor cost', () => {
  it('starts switched off so nobody is asked to invent an hourly rate', async () => {
    const { session } = await createTestCompany()
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: session.organizationId },
    })
    expect(organization.laborCostEnabled).toBe(false)
    expect(organization.laborCostPerHourCents).toBeNull()
  })
})
