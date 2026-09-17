import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import { hashPassword } from '@/lib/password'
import {
  PresentationError,
  endPresentation,
  loadPresentation,
  markPresentationSigned,
  presentablePhoto,
  presentationLockFor,
  resolvePresentationToken,
  startPresentation,
  sweepPresentations,
} from '@/server/presentations/service'
import { addCatalogItemToEstimate, ensureDraftEstimate } from '@/server/estimates/builder'
import { signEstimate } from '@/server/estimates/lifecycle'
import { startInspection, setItemStatus } from '@/server/inspections/service'
import { createTestCompany, createTestDoor, createTestJob, skuId } from './helpers'

/**
 * Handing someone else's phone to a stranger.
 *
 * For two minutes a homeowner is holding a device signed in as a technician,
 * with every customer that company has ever had one typed URL away. Hiding the
 * navigation does nothing about that. These tests are about the thing that
 * does: a separate, short-lived context that names one estimate, and a lock on
 * the technician's session that a person holding the phone cannot lift.
 *
 * The browser half — typing `/today` into the address bar and watching it
 * bounce — is in scripts/adversarial.mjs. This half is the server's own rules,
 * tested without a browser in the way.
 */

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const PASSWORD = 'a-real-technician-password'

let session: AppSession
let otherSession: AppSession
let rollerId: string

beforeAll(async () => {
  process.env.STORAGE_DRIVER = 'local'
  session = (await createTestCompany({ taxRateBps: 725 })).session
  otherSession = (await createTestCompany()).session
  rollerId = await skuId(session.organizationId, 'RLR-NYL-13')

  // The exit needs a password that can actually be verified.
  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: await hashPassword(PASSWORD) },
  })
}, 90_000)

async function estimateWith(optionCount: number, on = session) {
  const { customer, property, door } = await createTestDoor(on)
  const job = await createTestJob(on, {
    customerId: customer.id,
    propertyId: property.id,
    doorId: door.id,
  })
  const estimate = await ensureDraftEstimate(on, job.id)
  const item = await skuId(on.organizationId, 'RLR-NYL-13')

  for (let index = 0; index < optionCount; index += 1) {
    const option = await prisma.estimateOption.create({
      data: {
        estimateId: estimate.id,
        name: `Option ${index + 1}`,
        sortOrder: index,
        subtotalCents: 0,
        taxCents: 0,
        totalCents: 0,
      },
    })
    await addCatalogItemToEstimate(on, {
      estimateId: estimate.id,
      optionId: option.id,
      priceBookItemId: item,
      quantity: index + 1,
    })
  }

  return { jobId: job.id, estimateId: estimate.id, customerId: customer.id, doorId: door.id }
}

describe('opening a presentation', () => {
  it('needs an estimate of its own, with work on it', async () => {
    const mine = await estimateWith(1)
    const theirs = await estimateWith(1, otherSession)

    // Another company's estimate simply is not found.
    await expect(
      startPresentation(session, { estimateId: theirs.estimateId }),
    ).rejects.toThrow(PresentationError)

    // An empty one has nothing to present.
    const { customer, property } = await createTestDoor(session)
    const job = await createTestJob(session, {
      customerId: customer.id,
      propertyId: property.id,
    })
    const empty = await ensureDraftEstimate(session, job.id)
    await expect(
      startPresentation(session, { estimateId: empty.id }),
    ).rejects.toThrow(/before presenting/i)

    // And a real one works.
    const started = await startPresentation(session, { estimateId: mine.estimateId })
    expect(started.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(started.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('stores only a hash, so a database dump yields no working presentation', async () => {
    const mine = await estimateWith(1)
    const started = await startPresentation(session, { estimateId: mine.estimateId })

    const rows = await prisma.presentationSession.findMany({
      where: { technicianUserId: session.userId },
    })
    expect(rows.some((row) => row.tokenHash === started.token)).toBe(false)
    expect(rows.every((row) => /^[0-9a-f]{64}$/.test(row.tokenHash))).toBe(true)
  })

  it('expires on its own, in minutes rather than hours', async () => {
    const mine = await estimateWith(1)
    const started = await startPresentation(session, { estimateId: mine.estimateId })
    const minutes = (started.expiresAt.getTime() - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(5)
    expect(minutes).toBeLessThanOrEqual(60)
  })

  it('supersedes a forgotten one, so a technician cannot lock themselves out', async () => {
    const first = await estimateWith(1)
    const second = await estimateWith(1)

    const one = await startPresentation(session, { estimateId: first.estimateId })
    const two = await startPresentation(session, { estimateId: second.estimateId })

    expect(await resolvePresentationToken(one.token)).toBeNull()
    expect((await resolvePresentationToken(two.token))?.estimateId).toBe(second.estimateId)

    const superseded = await prisma.presentationSession.findFirst({
      where: { estimateId: first.estimateId },
    })
    expect(superseded?.endedReason).toBe('SUPERSEDED')
  })
})

describe('the lock on the technician’s session', () => {
  it('is on while a presentation is live, and keyed on the person rather than a cookie', async () => {
    // Earlier tests leave presentations open on purpose; this one is about the
    // transition, so it starts from a known-clear state.
    await prisma.presentationSession.updateMany({
      where: { technicianUserId: session.userId, endedAt: null },
      data: { endedAt: new Date(), endedReason: 'SUPERSEDED' },
    })

    const mine = await estimateWith(1)
    expect(await presentationLockFor(session.userId)).toBeNull()

    const started = await startPresentation(session, { estimateId: mine.estimateId })

    // This is the answer `requireSession()` reads. It comes from the row, so
    // clearing the presentation cookie — the obvious escape — does not lift it.
    expect(await presentationLockFor(session.userId)).not.toBeNull()

    // And it is this technician's lock, not everyone's.
    expect(await presentationLockFor(otherSession.userId)).toBeNull()

    await endPresentation({ token: started.token, password: PASSWORD })
    expect(await presentationLockFor(session.userId)).toBeNull()
  })

  it('lifts when the presentation times out, without anyone doing anything', async () => {
    const mine = await estimateWith(1)
    await startPresentation(session, { estimateId: mine.estimateId })
    expect(await presentationLockFor(session.userId)).not.toBeNull()

    await prisma.presentationSession.updateMany({
      where: { technicianUserId: session.userId, endedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    // A phone left in a pocket does not lock an account out for ever.
    expect(await presentationLockFor(session.userId)).toBeNull()
  })

  it('closes expired rows when swept, for the audit trail', async () => {
    const mine = await estimateWith(1)
    await startPresentation(session, { estimateId: mine.estimateId })
    await prisma.presentationSession.updateMany({
      where: { technicianUserId: session.userId, endedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    expect(await sweepPresentations()).toBeGreaterThanOrEqual(1)
    const row = await prisma.presentationSession.findFirst({
      where: { estimateId: mine.estimateId },
    })
    expect(row?.endedReason).toBe('EXPIRED')
  })
})

describe('the token', () => {
  it('resolves to exactly one estimate, and to a context that sees nothing else', async () => {
    const mine = await estimateWith(2)
    const theirs = await estimateWith(1, otherSession)
    const started = await startPresentation(session, { estimateId: mine.estimateId })

    const presentation = await resolvePresentationToken(started.token)
    expect(presentation?.estimateId).toBe(mine.estimateId)
    expect(presentation?.organizationId).toBe(session.organizationId)

    // Its tenant context is scoped to the presenting company…
    const db = presentation!.context.db
    expect(await db.estimate.findUnique({ where: { id: theirs.estimateId } })).toBeNull()
    expect(await db.customer.findUnique({ where: { id: theirs.customerId } })).toBeNull()

    // …and carries no user, so nothing can mistake it for the technician.
    expect(presentation!.context.userId).toBeNull()
  })

  it('refuses anything that is not a live token, identically', async () => {
    for (const token of [
      '',
      'x',
      'a'.repeat(43),
      '../../../etc/passwd',
      'null',
      undefined,
      null,
    ]) {
      expect(await resolvePresentationToken(token)).toBeNull()
    }
  })

  it('stops resolving the moment the presentation ends', async () => {
    const mine = await estimateWith(1)
    const started = await startPresentation(session, { estimateId: mine.estimateId })
    expect(await resolvePresentationToken(started.token)).not.toBeNull()

    await endPresentation({ token: started.token, password: PASSWORD })
    expect(await resolvePresentationToken(started.token)).toBeNull()
  })
})

describe('what the customer can see', () => {
  it('is the estimate and nothing that belongs to the business', async () => {
    const mine = await estimateWith(2)
    const started = await startPresentation(session, { estimateId: mine.estimateId })
    const presentation = await resolvePresentationToken(started.token)
    const loaded = await loadPresentation(presentation!)

    expect(loaded).not.toBeNull()
    const serialized = JSON.stringify(loaded)

    // The fields that would give away the company's numbers are not merely
    // hidden — they were never selected, so they are not in the payload the
    // browser receives.
    for (const field of [
      'unitCostCents',
      'costCents',
      'sku',
      'internalNotes',
      'trackInventory',
      'quantityOnHand',
      'laborCostPerHourCents',
    ]) {
      expect(serialized, `${field} reached the customer's device`).not.toContain(field)
    }

    // What it does carry is the conversation.
    expect(loaded!.organization.name).toBeTruthy()
    expect(loaded!.estimate.options).toHaveLength(2)
    expect(loaded!.estimate.options[0]!.items.length).toBeGreaterThan(0)
  })

  it('carries the note on a finding no further than the office', async () => {
    const { customer, property, door } = await createTestDoor(session)
    const job = await createTestJob(session, {
      customerId: customer.id,
      propertyId: property.id,
      doorId: door.id,
    })
    const inspection = await startInspection(session, job.id)
    const item = await prisma.inspectionItem.findFirstOrThrow({
      where: { inspectionId: inspection.id, componentKey: 'rollers' },
    })
    await setItemStatus(session, { itemId: item.id, status: 'WORN' })
    await prisma.inspectionItem.update({
      where: { id: item.id },
      data: { note: 'Customer is cheap, push the best package' },
    })

    const estimate = await ensureDraftEstimate(session, job.id)
    await addCatalogItemToEstimate(session, {
      estimateId: estimate.id,
      priceBookItemId: rollerId,
      quantity: 1,
    })

    const started = await startPresentation(session, { estimateId: estimate.id })
    const presentation = await resolvePresentationToken(started.token)
    const loaded = await loadPresentation(presentation!)

    expect(JSON.stringify(loaded)).not.toContain('push the best package')
  })

  it('serves only the photographs of this estimate’s own findings', async () => {
    const { customer, property, door } = await createTestDoor(session)
    const job = await createTestJob(session, {
      customerId: customer.id,
      propertyId: property.id,
      doorId: door.id,
    })
    const inspection = await startInspection(session, job.id)
    const item = await prisma.inspectionItem.findFirstOrThrow({
      where: { inspectionId: inspection.id, componentKey: 'rollers' },
    })

    const mine = await prisma.photo.create({
      data: {
        organizationId: session.organizationId,
        kind: 'DAMAGE',
        inspectionItemId: item.id,
        storageKey: `test/${item.id}.jpg`,
        contentType: 'image/jpeg',
        byteSize: 10,
        uploadStatus: 'READY',
      },
    })

    // A photo from a different job at the same company — the case that makes
    // this narrower than "is it ours".
    const elsewhere = await prisma.photo.create({
      data: {
        organizationId: session.organizationId,
        kind: 'DAMAGE',
        storageKey: 'test/elsewhere.jpg',
        contentType: 'image/jpeg',
        byteSize: 10,
        uploadStatus: 'READY',
      },
    })

    // And one from another company entirely.
    const theirs = await prisma.photo.create({
      data: {
        organizationId: otherSession.organizationId,
        kind: 'DAMAGE',
        storageKey: 'test/theirs.jpg',
        contentType: 'image/jpeg',
        byteSize: 10,
        uploadStatus: 'READY',
      },
    })

    const estimate = await ensureDraftEstimate(session, job.id)
    await addCatalogItemToEstimate(session, {
      estimateId: estimate.id,
      priceBookItemId: rollerId,
      quantity: 1,
    })
    const started = await startPresentation(session, { estimateId: estimate.id })
    const presentation = await resolvePresentationToken(started.token)

    expect(await presentablePhoto(presentation!, mine.id)).not.toBeNull()
    expect(
      await presentablePhoto(presentation!, elsewhere.id),
      'a photo from another job was served to a customer',
    ).toBeNull()
    expect(await presentablePhoto(presentation!, theirs.id)).toBeNull()
  })
})

describe('signing, from inside a presentation', () => {
  it('produces the same immutable document the emailed link does', async () => {
    const mine = await estimateWith(2)
    const started = await startPresentation(session, { estimateId: mine.estimateId })
    const presentation = await resolvePresentationToken(started.token)
    const option = await prisma.estimateOption.findFirstOrThrow({
      where: { estimateId: mine.estimateId },
    })

    const { signature, version, estimate } = await signEstimate(presentation!.context, {
      estimateId: presentation!.estimateId,
      optionId: option.id,
      signerName: 'Sam Homeowner',
      signatureDataUrl: PNG,
      approvalMethod: 'IN_PERSON_DEVICE',
    })

    expect(estimate.status).toBe('ACCEPTED')
    expect(signature.documentHash).toBe(version.contentHash)
    expect(signature.approvalMethod).toBe('IN_PERSON_DEVICE')
    // Signed on the technician's own phone, so nothing was ever sent.
    expect(estimate.sentAt).toBeNull()

    await markPresentationSigned({ presentationId: presentation!.id, optionId: option.id })
    const row = await prisma.presentationSession.findUniqueOrThrow({
      where: { id: presentation!.id },
    })
    expect(row.signedAt).not.toBeNull()
    expect(row.signedOptionId).toBe(option.id)
  })

  it('cannot be pointed at another company’s option', async () => {
    const mine = await estimateWith(1)
    const theirs = await estimateWith(1, otherSession)
    const started = await startPresentation(session, { estimateId: mine.estimateId })
    const presentation = await resolvePresentationToken(started.token)
    const foreign = await prisma.estimateOption.findFirstOrThrow({
      where: { estimateId: theirs.estimateId },
    })

    await expect(
      signEstimate(presentation!.context, {
        estimateId: presentation!.estimateId,
        optionId: foreign.id,
        signerName: 'Attacker',
        signatureDataUrl: PNG,
        approvalMethod: 'IN_PERSON_DEVICE',
      }),
    ).rejects.toThrow()
  })
})

describe('leaving', () => {
  it('takes the technician’s password, not a tap', async () => {
    const mine = await estimateWith(1)
    const started = await startPresentation(session, { estimateId: mine.estimateId })

    for (const guess of ['', 'password', 'GarageDoorHQ2026!', PASSWORD.toUpperCase()]) {
      await expect(
        endPresentation({ token: started.token, password: guess }),
        `"${guess}" ended the presentation`,
      ).rejects.toThrow(PresentationError)
    }

    // Still live after every wrong guess.
    expect(await resolvePresentationToken(started.token)).not.toBeNull()
    expect(await presentationLockFor(session.userId)).not.toBeNull()

    const result = await endPresentation({ token: started.token, password: PASSWORD })
    expect(result.jobId).toBe(mine.jobId)
    expect(await presentationLockFor(session.userId)).toBeNull()
  })

  it('will not accept another member’s password', async () => {
    const mine = await estimateWith(1)
    const started = await startPresentation(session, { estimateId: mine.estimateId })

    const intruderPassword = 'somebody-elses-password'
    await prisma.user.update({
      where: { id: otherSession.userId },
      data: { passwordHash: await hashPassword(intruderPassword) },
    })

    await expect(
      endPresentation({ token: started.token, password: intruderPassword }),
    ).rejects.toThrow(PresentationError)

    await endPresentation({ token: started.token, password: PASSWORD })
  })

  it('cannot be ended twice, and says nothing different the second time', async () => {
    const mine = await estimateWith(1)
    const started = await startPresentation(session, { estimateId: mine.estimateId })
    await endPresentation({ token: started.token, password: PASSWORD })

    await expect(
      endPresentation({ token: started.token, password: PASSWORD }),
    ).rejects.toThrow(/already ended/i)
  })

  it('records both ends of it in the audit log', async () => {
    const mine = await estimateWith(1)
    const started = await startPresentation(session, { estimateId: mine.estimateId })
    await endPresentation({ token: started.token, password: PASSWORD })

    const actions = (
      await prisma.auditLog.findMany({
        where: { organizationId: session.organizationId, entityId: mine.estimateId },
        select: { action: true },
      })
    ).map((row) => row.action)

    expect(actions).toContain('presentation.started')
    expect(actions).toContain('presentation.ended')
  })
})

/**
 * Good/Better/Best is one way a company sells, not a shape the product
 * imposes. A technician with one repair to quote must never be asked to invent
 * two more to get past this screen.
 */
describe('however many options there are', () => {
  it('presents one, two, three or four without complaint', async () => {
    for (const count of [1, 2, 3, 4]) {
      const mine = await estimateWith(count)
      const started = await startPresentation(session, { estimateId: mine.estimateId })
      const presentation = await resolvePresentationToken(started.token)
      const loaded = await loadPresentation(presentation!)

      expect(loaded!.estimate.options, `${count} option(s)`).toHaveLength(count)
      // Untiered, because nothing asked for tiers.
      expect(loaded!.estimate.options.every((option) => option.tier === null)).toBe(true)
      expect(loaded!.estimate.presentation).toBe('PLAIN')

      await endPresentation({ token: started.token, password: PASSWORD })
    }
  }, 60_000)
})
