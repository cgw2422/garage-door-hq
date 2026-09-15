import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import {
  activeLinkFor,
  issuePortalLink,
  loadPortalEstimate,
  loadPortalInvoice,
  PortalError,
  resolvePortalToken,
  revokePortalLink,
} from '@/server/portal/service'
import { addAllRemediesToEstimate, ensureDraftEstimate, setEstimateTaxRate } from '@/server/estimates/builder'
import { sendEstimate, signEstimate } from '@/server/estimates/lifecycle'
import { startInspection } from '@/server/inspections/service'
import { createTestCompany, createTestDoor, createTestJob } from './helpers'

/**
 * Customer link security.
 *
 * A token is the entire credential, so these tests are about what a token
 * cannot do as much as what it can.
 */

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let session: AppSession
let estimateId: string
let otherEstimateId: string

beforeAll(async () => {
  process.env.STORAGE_DRIVER = 'local'
  const company = await createTestCompany({ taxRateBps: 700 })
  session = company.session

  const { customer, property, door } = await createTestDoor(session)
  const job = await createTestJob(session, {
    customerId: customer.id,
    propertyId: property.id,
    doorId: door.id,
  })

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
  estimateId = estimate.id

  const second = await createTestJob(session, {
    customerId: customer.id,
    propertyId: property.id,
  })
  const secondEstimate = await ensureDraftEstimate(session, second.id)
  otherEstimateId = secondEstimate.id
})

describe('issuing links', () => {
  it('produces an opaque token and stores only its hash', async () => {
    const link = await issuePortalLink(session, { target: 'ESTIMATE', estimateId })

    expect(link.token.length).toBeGreaterThan(40)
    expect(link.url).toContain(`/p/e/${link.token}`)
    // No identifiers of any kind travel in the customer's URL.
    expect(link.url).not.toContain(session.organizationId)
    expect(link.url).not.toContain(estimateId)

    const stored = await prisma.portalLink.findFirstOrThrow({
      where: { estimateId, revokedAt: null },
    })
    expect(stored.tokenHash).not.toBe(link.token)
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('revokes the previous link when a new one is issued', async () => {
    const first = await issuePortalLink(session, { target: 'ESTIMATE', estimateId })
    const second = await issuePortalLink(session, { target: 'ESTIMATE', estimateId })

    expect(await resolvePortalToken(first.token)).toBeNull()
    expect(await resolvePortalToken(second.token)).not.toBeNull()
  })

  it('refuses to issue a link for another organization document', async () => {
    const other = await createTestCompany()
    await expect(
      issuePortalLink(other.session, { target: 'ESTIMATE', estimateId }),
    ).rejects.toBeInstanceOf(PortalError)
  })
})

describe('resolving tokens', () => {
  it('rejects unknown, malformed, revoked and expired tokens the same way', async () => {
    expect(await resolvePortalToken('')).toBeNull()
    expect(await resolvePortalToken('short')).toBeNull()
    expect(await resolvePortalToken('x'.repeat(64))).toBeNull()

    const revoked = await issuePortalLink(session, { target: 'ESTIMATE', estimateId })
    const link = await activeLinkFor(session, { estimateId })
    await revokePortalLink(session, link!.id)
    expect(await resolvePortalToken(revoked.token)).toBeNull()

    const expiring = await issuePortalLink(session, { target: 'ESTIMATE', estimateId })
    const row = await activeLinkFor(session, { estimateId })
    await prisma.portalLink.update({
      where: { id: row!.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect(await resolvePortalToken(expiring.token)).toBeNull()
  })

  it('resolves to exactly one document and nothing else', async () => {
    const link = await issuePortalLink(session, { target: 'ESTIMATE', estimateId })
    const resolved = await resolvePortalToken(link.token)

    expect(resolved?.estimateId).toBe(estimateId)
    expect(resolved?.invoiceId).toBeNull()
    expect(resolved?.target).toBe('ESTIMATE')

    // The context is scoped to the company, so even a bug downstream cannot
    // reach another tenant's data.
    const reachable = await resolved!.context.db.estimate.findMany()
    expect(reachable.every((row) => row.organizationId === session.organizationId)).toBe(true)

    // But an estimate link cannot be pointed at a different estimate.
    const loaded = await loadPortalEstimate(resolved!)
    expect(loaded?.estimate.id).toBe(estimateId)
    expect(loaded?.estimate.id).not.toBe(otherEstimateId)
  })

  it('refuses to serve an invoice through an estimate link', async () => {
    const link = await issuePortalLink(session, { target: 'ESTIMATE', estimateId })
    const resolved = await resolvePortalToken(link.token)
    expect(await loadPortalInvoice(resolved!)).toBeNull()
  })

  it('counts views so a company can see whether the customer opened it', async () => {
    const link = await issuePortalLink(session, { target: 'ESTIMATE', estimateId })
    await resolvePortalToken(link.token)
    await resolvePortalToken(link.token)

    const row = await activeLinkFor(session, { estimateId })
    expect(row!.viewCount).toBe(2)
    expect(row!.lastViewedAt).not.toBeNull()
  })
})

describe('what the customer receives', () => {
  it('exposes the document and no internal fields', async () => {
    const link = await issuePortalLink(session, { target: 'ESTIMATE', estimateId })
    const resolved = await resolvePortalToken(link.token)
    const loaded = await loadPortalEstimate(resolved!)

    const serialized = JSON.stringify(loaded)
    expect(serialized).not.toContain('organizationId')
    expect(serialized).not.toContain('unitCostCents')
    expect(serialized).not.toContain('internalNotes')

    // What they do get is enough to choose.
    expect(loaded!.estimate.options.length).toBeGreaterThan(1)
    expect(loaded!.estimate.options[0]!.items.length).toBeGreaterThan(0)
    expect(loaded!.organization.name).toBe(session.organizationName)
  })
})

describe('signing through a link', () => {
  it('accepts the estimate and freezes the version, with no user attached', async () => {
    const link = await issuePortalLink(session, { target: 'ESTIMATE', estimateId })
    const resolved = await resolvePortalToken(link.token)

    const better = await prisma.estimateOption.findFirstOrThrow({
      where: { estimateId, tier: 'BETTER' },
    })

    const result = await signEstimate(resolved!.context, {
    approvalMethod: 'REMOTE_LINK',
      estimateId,
      optionId: better.id,
      signerName: 'Customer On Phone',
      signatureDataUrl: PNG,
    })

    expect(result.estimate.status).toBe('ACCEPTED')
    expect(result.signature.documentHash).toBe(result.version.contentHash)
    // A customer is not a user of the system, and the record says so.
    expect(result.version.createdById).toBeNull()

    // And the estimate is now locked, even to staff.
    await expect(
      setEstimateTaxRate(session, { estimateId, taxRateBps: 100 }),
    ).rejects.toThrow(/accepted and signed/i)
  })
})
