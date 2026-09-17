import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import { createProperty, updateCustomer, archiveCustomer, updateProperty, archiveProperty } from '@/server/customers/service'
import { createDoor, updateDoor, archiveDoor } from '@/server/doors/service'
import { createJob, advanceJobStatus } from '@/server/jobs/service'
import { assignJob, rescheduleJob } from '@/server/schedule/service'
import { startInspection, setItemNote, setItemStatus, loadQuoteState } from '@/server/inspections/service'
import {
  addCatalogItemToEstimate,
  addPackageToEstimate,
  addRemedyToEstimate,
  ensureDraftEstimate,
  removeEstimateItem,
  removeEstimateOption,
  removeRemedyFromEstimate,
  setEstimateTaxRate,
  setRecommendedOption,
  updateEstimateItemQuantity,
} from '@/server/estimates/builder'
import { sendEstimate, signEstimate, declineEstimate } from '@/server/estimates/lifecycle'
import { completeJob } from '@/server/jobs/completion'
import { recordPayment, markInvoiceSent } from '@/server/invoices/service'
import { adjustStock, transferStock, addStockedItem, setMinimum } from '@/server/inventory/management'
import { archiveItem, duplicateItem, updateItem, updatePackage } from '@/server/pricebook/service'
import { updateMember, resendInvitation, revokeInvitation } from '@/server/team/service'
import { issuePortalLink, revokePortalLink, resolvePortalToken } from '@/server/portal/service'
import { beginPhotoUpload, deletePhoto, resolveReadablePhoto } from '@/server/media/photos'
import { createTestCompany, createTestDoor, createTestJob, skuId, stockTruck, uniqueNumber } from './helpers'

/**
 * Company A against Company B.
 *
 * Every one of these runs the real service function the app runs, with a real
 * session for one company and a real id belonging to another. The assertion is
 * always the same: it either throws or it finds nothing. Anything that reads,
 * writes or even acknowledges the other company's row is a failure.
 *
 * The ids are handed over directly, which is the point — this is what an
 * attacker has after reading a URL, a page source or a server-action payload.
 * A test that only drives the UI proves the UI hides things, not that the
 * server refuses them.
 */

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

interface Fixture {
  session: AppSession
  customerId: string
  propertyId: string
  doorId: string
  jobId: string
  inspectionId: string
  inspectionItemId: string
  estimateId: string
  optionId: string
  itemId: string
  invoiceId: string
  photoId: string
  locationId: string
  priceBookItemId: string
  packageId: string
  membershipId: string
  jobTypeId: string
  portalLinkId: string
  portalToken: string
  noteId: string
}

/** One company with one of everything, built through the real code paths. */
async function buildCompany(): Promise<Fixture> {
  const { session } = await createTestCompany({ taxRateBps: 725 })
  const { customer, property, door } = await createTestDoor(session)
  const job = await createTestJob(session, {
    customerId: customer.id,
    propertyId: property.id,
    doorId: door.id,
  })

  const inspection = await startInspection(session, job.id)
  const inspectionItem = await prisma.inspectionItem.findFirstOrThrow({
    where: { inspectionId: inspection.id, componentKey: 'rollers' },
  })

  const priceBookItemId = await skuId(session.organizationId, 'RLR-NYL-13')
  const estimate = await ensureDraftEstimate(session, job.id)
  await addCatalogItemToEstimate(session, {
    estimateId: estimate.id,
    priceBookItemId,
    quantity: 2,
  })
  const option = await prisma.estimateOption.findFirstOrThrow({
    where: { estimateId: estimate.id },
    include: { items: true },
  })

  const pkg = await prisma.priceBookPackage.findFirstOrThrow({
    where: { organizationId: session.organizationId },
  })
  const location = await prisma.inventoryLocation.findFirstOrThrow({
    where: { organizationId: session.organizationId },
  })
  const jobType = await prisma.jobType.findFirstOrThrow({
    where: { organizationId: session.organizationId },
  })
  const membership = await prisma.membership.findFirstOrThrow({
    where: { organizationId: session.organizationId },
  })

  // An invoice, made the way the product makes one.
  const invoice = await prisma.invoice.create({
    data: {
      organizationId: session.organizationId,
      number: uniqueNumber(),
      customerId: customer.id,
      jobId: job.id,
      status: 'SENT',
      subtotalCents: 49900,
      taxCents: 0,
      totalCents: 49900,
      paidCents: 0,
      balanceCents: 49900,
    },
  })

  const photo = await prisma.photo.create({
    data: {
      organizationId: session.organizationId,
      kind: 'BEFORE',
      jobId: job.id,
      storageKey: `org/${session.organizationId}/photos/test/${job.id}.jpg`,
      contentType: 'image/jpeg',
      byteSize: 1024,
      uploadStatus: 'READY',
    },
  })

  const note = await prisma.note.create({
    data: {
      organizationId: session.organizationId,
      jobId: job.id,
      body: 'Gate code is 4417.',
      authorId: session.userId,
    },
  })

  const link = await issuePortalLink(session, { target: 'ESTIMATE', estimateId: estimate.id })
  const portalLink = await prisma.portalLink.findFirstOrThrow({
    where: { organizationId: session.organizationId, estimateId: estimate.id },
  })

  await stockTruck(session, [{ sku: 'RLR-NYL-13', quantity: 20 }])

  return {
    session,
    customerId: customer.id,
    propertyId: property.id,
    doorId: door.id,
    jobId: job.id,
    inspectionId: inspection.id,
    inspectionItemId: inspectionItem.id,
    estimateId: estimate.id,
    optionId: option.id,
    itemId: option.items[0]!.id,
    invoiceId: invoice.id,
    photoId: photo.id,
    locationId: location.id,
    priceBookItemId,
    packageId: pkg.id,
    membershipId: membership.id,
    jobTypeId: jobType.id,
    portalLinkId: portalLink.id,
    portalToken: link.token,
    noteId: note.id,
  }
}

let A: Fixture
let B: Fixture

beforeAll(async () => {
  process.env.STORAGE_DRIVER = 'local'
  A = await buildCompany()
  B = await buildCompany()
}, 120_000)

/**
 * The only acceptable outcomes: it threw, or it found nothing.
 *
 * Returning a row — or silently doing the write and returning it — is the
 * failure this whole file is looking for.
 */
async function deniedOrEmpty(label: string, attempt: () => Promise<unknown>) {
  try {
    const value = await attempt()
    if (value === null || value === undefined) return
    if (Array.isArray(value) && value.length === 0) return
    throw new Error(`${label}: expected a refusal, got ${JSON.stringify(value).slice(0, 200)}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${label}: expected a refusal`)) {
      throw error
    }
    // Any other throw is the refusal we wanted.
  }
}

describe('reading another company’s records', () => {
  it('finds nothing for any organization-owned model', async () => {
    const db = A.session.db
    expect(await db.customer.findUnique({ where: { id: B.customerId } })).toBeNull()
    expect(await db.property.findUnique({ where: { id: B.propertyId } })).toBeNull()
    expect(await db.door.findUnique({ where: { id: B.doorId } })).toBeNull()
    expect(await db.job.findUnique({ where: { id: B.jobId } })).toBeNull()
    expect(await db.inspection.findUnique({ where: { id: B.inspectionId } })).toBeNull()
    expect(await db.estimate.findUnique({ where: { id: B.estimateId } })).toBeNull()
    expect(await db.invoice.findUnique({ where: { id: B.invoiceId } })).toBeNull()
    expect(await db.photo.findUnique({ where: { id: B.photoId } })).toBeNull()
    expect(await db.note.findUnique({ where: { id: B.noteId } })).toBeNull()
    expect(await db.priceBookItem.findUnique({ where: { id: B.priceBookItemId } })).toBeNull()
    expect(await db.priceBookPackage.findUnique({ where: { id: B.packageId } })).toBeNull()
    expect(await db.inventoryLocation.findUnique({ where: { id: B.locationId } })).toBeNull()
    expect(await db.membership.findUnique({ where: { id: B.membershipId } })).toBeNull()
    expect(await db.jobType.findUnique({ where: { id: B.jobTypeId } })).toBeNull()
    expect(await db.portalLink.findUnique({ where: { id: B.portalLinkId } })).toBeNull()
    expect(await db.organization.findUnique({ where: { id: B.session.organizationId } })).toBeNull()
  })

  it('lists nothing belonging to the other company', async () => {
    const db = A.session.db
    const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id)
    expect(ids(await db.customer.findMany())).not.toContain(B.customerId)
    expect(ids(await db.job.findMany())).not.toContain(B.jobId)
    expect(ids(await db.estimate.findMany())).not.toContain(B.estimateId)
    expect(ids(await db.invoice.findMany())).not.toContain(B.invoiceId)
    expect(ids(await db.photo.findMany())).not.toContain(B.photoId)
    expect(ids(await db.inventoryTransaction.findMany())).not.toHaveLength(0) // A has its own
    expect(
      (await db.inventoryTransaction.findMany()).every(
        (row) => row.organizationId === A.session.organizationId,
      ),
    ).toBe(true)
  })

  it('counts and aggregates only its own rows', async () => {
    const db = A.session.db
    expect(await db.customer.count({ where: { id: B.customerId } })).toBe(0)
    const totals = await db.invoice.aggregate({ _sum: { totalCents: true } })
    const mine = await prisma.invoice.aggregate({
      _sum: { totalCents: true },
      where: { organizationId: A.session.organizationId },
    })
    expect(totals._sum.totalCents ?? 0).toBe(mine._sum.totalCents ?? 0)
  })

  it('refuses a photo read through the brokered route resolver', async () => {
    expect(await resolveReadablePhoto(A.session, B.photoId)).toBeNull()
  })
})

describe('writing to another company’s records', () => {
  it('cannot update or archive a customer, property or door', async () => {
    await deniedOrEmpty('updateCustomer', () =>
      updateCustomer(A.session, B.customerId, {
        firstName: 'Pwned',
        lastName: 'Pwned',
        phone: '(555) 000-0000',
      }),
    )
    await deniedOrEmpty('archiveCustomer', () => archiveCustomer(A.session, B.customerId))
    await deniedOrEmpty('updateProperty', () =>
      updateProperty(A.session, B.propertyId, {
        line1: 'Pwned',
        city: 'X',
        state: 'NC',
        postalCode: '28202',
      }),
    )
    await deniedOrEmpty('archiveProperty', () => archiveProperty(A.session, B.propertyId))
    await deniedOrEmpty('updateDoor', () => updateDoor(A.session, B.doorId, { nickname: 'Pwned' }))
    await deniedOrEmpty('archiveDoor', () => archiveDoor(A.session, B.doorId))

    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: B.customerId } })
    expect(customer.firstName).not.toBe('Pwned')
    expect(customer.archivedAt).toBeNull()
    const door = await prisma.door.findUniqueOrThrow({ where: { id: B.doorId } })
    expect(door.nickname).not.toBe('Pwned')
  })

  it('cannot move, assign or advance another company’s job', async () => {
    await deniedOrEmpty('advanceJobStatus', () =>
      advanceJobStatus(A.session, B.jobId, 'CANCELLED'),
    )
    await deniedOrEmpty('rescheduleJob', () =>
      rescheduleJob(A.session, { jobId: B.jobId, date: '2030-01-01', time: '09:00' }),
    )
    await deniedOrEmpty('assignJob', () => assignJob(A.session, B.jobId, A.session.userId))

    const job = await prisma.job.findUniqueOrThrow({ where: { id: B.jobId } })
    expect(job.status).not.toBe('CANCELLED')
    expect(job.assignedToId).not.toBe(A.session.userId)
  })

  it('cannot build a job out of another company’s customer, address or door', async () => {
    await deniedOrEmpty('createJob (B customer)', () =>
      createJob(A.session, { customerId: B.customerId, propertyId: B.propertyId }),
    )
    // Mixing one's own customer with the other company's address is the
    // interesting case: the parent check passes, the child must still fail.
    await deniedOrEmpty('createJob (A customer, B property)', () =>
      createJob(A.session, { customerId: A.customerId, propertyId: B.propertyId }),
    )
    await deniedOrEmpty('createJob (A property, B door)', () =>
      createJob(A.session, {
        customerId: A.customerId,
        propertyId: A.propertyId,
        doorId: B.doorId,
      }),
    )
  })

  /**
   * The ids that are not the obvious ones.
   *
   * A job's customer, address and door are checked because they are what the
   * form asks for. Its job type and its assignee are just as much foreign keys
   * arriving from a payload, and a job that points at another company's row
   * puts that company's words on this company's screen.
   */
  it('cannot point a new job at another company’s job type or technician', async () => {
    await deniedOrEmpty('createJob (B jobType)', () =>
      createJob(A.session, {
        customerId: A.customerId,
        propertyId: A.propertyId,
        jobTypeId: B.jobTypeId,
      }),
    )
    await deniedOrEmpty('createJob (B technician)', () =>
      createJob(A.session, {
        customerId: A.customerId,
        propertyId: A.propertyId,
        assignedToId: B.session.userId,
      }),
    )

    const strays = await prisma.job.findMany({
      where: {
        organizationId: A.session.organizationId,
        OR: [{ jobTypeId: B.jobTypeId }, { assignedToId: B.session.userId }],
      },
    })
    expect(strays, 'a job was created pointing at another company’s rows').toHaveLength(0)
  })

  it('cannot hang a property or door off another company’s parent', async () => {
    await deniedOrEmpty('createProperty on B customer', () =>
      createProperty(A.session, B.customerId, {
        line1: '1 Pwned Way',
        city: 'Charlotte',
        state: 'NC',
        postalCode: '28202',
      }),
    )
    await deniedOrEmpty('createDoor on B property', () =>
      createDoor(A.session, B.propertyId, { widthInches: 192, heightInches: 84 }),
    )
  })

  it('cannot touch another company’s inspection', async () => {
    await deniedOrEmpty('startInspection', () => startInspection(A.session, B.jobId))
    await deniedOrEmpty('setItemStatus', () =>
      setItemStatus(A.session, { itemId: B.inspectionItemId, status: 'FAILED' }),
    )
    await deniedOrEmpty('setItemNote', () =>
      setItemNote(A.session, { itemId: B.inspectionItemId, note: 'pwned' }),
    )

    const item = await prisma.inspectionItem.findUniqueOrThrow({ where: { id: B.inspectionItemId } })
    expect(item.status).toBe('NOT_CHECKED')
    expect(item.note).toBeNull()
  })

  it('cannot edit another company’s estimate, option or line', async () => {
    await deniedOrEmpty('ensureDraftEstimate', () => ensureDraftEstimate(A.session, B.jobId))
    await deniedOrEmpty('removeEstimateItem', () => removeEstimateItem(A.session, B.itemId))
    await deniedOrEmpty('removeEstimateOption', () => removeEstimateOption(A.session, B.optionId))
    await deniedOrEmpty('setRecommendedOption', () => setRecommendedOption(A.session, B.optionId))
    await deniedOrEmpty('updateEstimateItemQuantity', () =>
      updateEstimateItemQuantity(A.session, { itemId: B.itemId, quantity: 999 }),
    )
    await deniedOrEmpty('setEstimateTaxRate', () =>
      setEstimateTaxRate(A.session, { estimateId: B.estimateId, taxRateBps: 0 }),
    )
    await deniedOrEmpty('addCatalogItemToEstimate (B estimate)', () =>
      addCatalogItemToEstimate(A.session, {
        estimateId: B.estimateId,
        priceBookItemId: A.priceBookItemId,
        quantity: 1,
      }),
    )
    await deniedOrEmpty('addPackageToEstimate (B estimate)', () =>
      addPackageToEstimate(A.session, { estimateId: B.estimateId, packageId: A.packageId }),
    )

    const option = await prisma.estimateOption.findUniqueOrThrow({
      where: { id: B.optionId },
      include: { items: true },
    })
    expect(option.items).toHaveLength(1)
    expect(Number(option.items[0]!.quantity.toString())).toBe(2)
  })

  /**
   * The nested-relationship case the brief calls out by name.
   *
   * The estimate is the attacker's own, so the parent check passes. The
   * catalog id is the other company's. Nothing about a valid parent makes an
   * arbitrary child id safe.
   */
  it('cannot pull another company’s catalog line onto its own estimate', async () => {
    await deniedOrEmpty('addCatalogItemToEstimate (B price book item)', () =>
      addCatalogItemToEstimate(A.session, {
        estimateId: A.estimateId,
        priceBookItemId: B.priceBookItemId,
        quantity: 1,
      }),
    )

    const lines = await prisma.estimateItem.findMany({
      where: { option: { estimateId: A.estimateId } },
    })
    expect(
      lines.some((line) => line.priceBookItemId === B.priceBookItemId),
      'a line priced from another company’s price book landed on the estimate',
    ).toBe(false)
  })

  it('cannot add another company’s package to its own estimate', async () => {
    await deniedOrEmpty('addPackageToEstimate (B package)', () =>
      addPackageToEstimate(A.session, { estimateId: A.estimateId, packageId: B.packageId }),
    )
  })

  it('cannot add another company’s remedy to its own job', async () => {
    const remedy = await prisma.inspectionRemedy.findFirstOrThrow({
      where: { organizationId: B.session.organizationId },
    })
    await deniedOrEmpty('addRemedyToEstimate (B remedy)', () =>
      addRemedyToEstimate(A.session, { jobId: A.jobId, remedyId: remedy.id }),
    )
    await deniedOrEmpty('removeRemedyFromEstimate (B remedy)', () =>
      removeRemedyFromEstimate(A.session, { jobId: A.jobId, remedyId: remedy.id }),
    )
  })

  it('cannot send, sign or decline another company’s estimate', async () => {
    await deniedOrEmpty('sendEstimate', () => sendEstimate(A.session, B.estimateId))
    await deniedOrEmpty('declineEstimate', () => declineEstimate(A.session, B.estimateId))
    await deniedOrEmpty('signEstimate', () =>
      signEstimate(A.session, {
        estimateId: B.estimateId,
        optionId: B.optionId,
        signerName: 'Attacker',
        signatureDataUrl: PNG,
        approvalMethod: 'IN_PERSON_DEVICE',
      }),
    )

    const estimate = await prisma.estimate.findUniqueOrThrow({ where: { id: B.estimateId } })
    expect(estimate.status).toBe('DRAFT')
    expect(
      await prisma.signature.count({ where: { estimateId: B.estimateId } }),
    ).toBe(0)
  })

  it('cannot complete another company’s job', async () => {
    await deniedOrEmpty('completeJob', () =>
      completeJob(A.session, { jobId: B.jobId, partsUsed: [], workSummary: 'pwned' }),
    )
    const job = await prisma.job.findUniqueOrThrow({ where: { id: B.jobId } })
    expect(job.status).not.toBe('COMPLETED')
  })

  it('cannot record a payment against another company’s invoice', async () => {
    await deniedOrEmpty('recordPayment', () =>
      recordPayment(A.session, { invoiceId: B.invoiceId, amountCents: 1, method: 'CASH' }),
    )
    await deniedOrEmpty('markInvoiceSent', () => markInvoiceSent(A.session, B.invoiceId))

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: B.invoiceId } })
    expect(invoice.paidCents).toBe(0)
    expect(await prisma.payment.count({ where: { invoiceId: B.invoiceId } })).toBe(0)
  })

  it('cannot edit or archive another company’s price book', async () => {
    await deniedOrEmpty('updateItem', () =>
      updateItem(A.session, B.priceBookItemId, {
        name: 'Pwned',
        category: 'ROLLERS',
        priceCents: 1,
        costCents: 0,
        taxable: false,
        trackInventory: false,
      }),
    )
    await deniedOrEmpty('archiveItem', () => archiveItem(A.session, B.priceBookItemId))
    await deniedOrEmpty('duplicateItem', () => duplicateItem(A.session, B.priceBookItemId))
    await deniedOrEmpty('updatePackage', () =>
      updatePackage(A.session, B.packageId, {
        name: 'Pwned',
        isRecommendedDefault: false,
        lines: [],
      }),
    )

    const item = await prisma.priceBookItem.findUniqueOrThrow({ where: { id: B.priceBookItemId } })
    expect(item.name).not.toBe('Pwned')
    expect(item.archivedAt).toBeNull()
  })

  it('cannot move stock in or out of another company’s location', async () => {
    const before = await prisma.stockLevel.findMany({
      where: { organizationId: B.session.organizationId },
    })

    // Both directions. An outbound move happens to be stopped by the stock
    // check — there is nothing of A's at B's truck to take — so the inbound
    // one is what actually proves the location is validated rather than
    // accidentally unreachable.
    await deniedOrEmpty('adjustStock (B location, outbound)', () =>
      adjustStock(A.session, {
        locationId: B.locationId,
        priceBookItemId: A.priceBookItemId,
        quantity: 5,
        reason: 'DAMAGED',
      }),
    )
    await deniedOrEmpty('adjustStock (B location, inbound)', () =>
      adjustStock(A.session, {
        locationId: B.locationId,
        priceBookItemId: A.priceBookItemId,
        quantity: 5,
        reason: 'RECEIVED',
      }),
    )
    await deniedOrEmpty('adjustStock (B item)', () =>
      adjustStock(A.session, {
        locationId: A.locationId,
        priceBookItemId: B.priceBookItemId,
        quantity: 5,
        reason: 'DAMAGED',
      }),
    )
    await deniedOrEmpty('transferStock (B location)', () =>
      transferStock(A.session, {
        fromLocationId: A.locationId,
        toLocationId: B.locationId,
        priceBookItemId: A.priceBookItemId,
        quantity: 1,
      }),
    )
    await deniedOrEmpty('addStockedItem (B location)', () =>
      addStockedItem(A.session, {
        priceBookItemId: A.priceBookItemId,
        locationId: B.locationId,
        minQuantity: 1,
      }),
    )
    await deniedOrEmpty('setMinimum (B location)', () =>
      setMinimum(A.session, {
        locationId: B.locationId,
        priceBookItemId: B.priceBookItemId,
        minQuantity: 99,
      }),
    )

    const after = await prisma.stockLevel.findMany({
      where: { organizationId: B.session.organizationId },
    })
    expect(after.map((row) => row.quantity.toString())).toEqual(
      before.map((row) => row.quantity.toString()),
    )
    // And no row was invented against the other company's location.
    const strays = await prisma.stockLevel.findMany({
      where: { locationId: B.locationId, organizationId: A.session.organizationId },
    })
    expect(strays, 'a stock row was created against another company’s location').toHaveLength(0)
    const strayTxns = await prisma.inventoryTransaction.findMany({
      where: {
        organizationId: A.session.organizationId,
        OR: [{ fromLocationId: B.locationId }, { toLocationId: B.locationId }],
      },
    })
    expect(strayTxns, 'a ledger move was posted against another company’s location').toHaveLength(0)
  })

  it('cannot complete its own job against another company’s location or catalog', async () => {
    await deniedOrEmpty('completeJob (B location)', () =>
      completeJob(A.session, {
        jobId: A.jobId,
        partsUsed: [{ priceBookItemId: A.priceBookItemId, quantity: 1 }],
        inventoryLocationId: B.locationId,
        workSummary: 'x',
      }),
    )
    await deniedOrEmpty('completeJob (B catalog)', () =>
      completeJob(A.session, {
        jobId: A.jobId,
        partsUsed: [{ priceBookItemId: B.priceBookItemId, quantity: 1 }],
        workSummary: 'x',
      }),
    )

    const strays = await prisma.inventoryTransaction.findMany({
      where: {
        organizationId: A.session.organizationId,
        OR: [{ fromLocationId: B.locationId }, { toLocationId: B.locationId }],
      },
    })
    expect(strays).toHaveLength(0)
    const job = await prisma.job.findUniqueOrThrow({ where: { id: A.jobId } })
    expect(job.status).not.toBe('COMPLETED')
  })

  it('cannot change another company’s team', async () => {
    await deniedOrEmpty('updateMember', () =>
      updateMember(A.session, { membershipId: B.membershipId, role: 'TECHNICIAN' }),
    )
    await deniedOrEmpty('updateMember (deactivate)', () =>
      updateMember(A.session, { membershipId: B.membershipId, isActive: false }),
    )

    const membership = await prisma.membership.findUniqueOrThrow({ where: { id: B.membershipId } })
    expect(membership.role).toBe('OWNER')
    expect(membership.isActive).toBe(true)
  })

  it('cannot issue or revoke a link for another company’s document', async () => {
    await deniedOrEmpty('issuePortalLink (B estimate)', () =>
      issuePortalLink(A.session, { target: 'ESTIMATE', estimateId: B.estimateId }),
    )
    await deniedOrEmpty('revokePortalLink (B link)', () =>
      revokePortalLink(A.session, B.portalLinkId),
    )

    const link = await prisma.portalLink.findUniqueOrThrow({ where: { id: B.portalLinkId } })
    expect(link.revokedAt).toBeNull()
    expect(
      await prisma.portalLink.count({
        where: { organizationId: A.session.organizationId, estimateId: B.estimateId },
      }),
    ).toBe(0)
  })

  it('cannot attach a photo to another company’s record, or delete one', async () => {
    for (const target of [
      { jobId: B.jobId },
      { customerId: B.customerId },
      { propertyId: B.propertyId },
      { doorId: B.doorId },
      { estimateId: B.estimateId },
      { invoiceId: B.invoiceId },
      { inspectionItemId: B.inspectionItemId },
      { priceBookItemId: B.priceBookItemId },
    ]) {
      await deniedOrEmpty(`beginPhotoUpload ${JSON.stringify(target)}`, () =>
        beginPhotoUpload(A.session, {
          target,
          kind: 'BEFORE',
          contentType: 'image/jpeg',
          byteSize: 1024,
        }),
      )
    }

    await deletePhoto(A.session, B.photoId)
    expect(
      await prisma.photo.findUnique({ where: { id: B.photoId } }),
      'another company’s photo was deleted',
    ).not.toBeNull()

    const strays = await prisma.photo.findMany({
      where: {
        organizationId: A.session.organizationId,
        OR: [{ jobId: B.jobId }, { customerId: B.customerId }, { doorId: B.doorId }],
      },
    })
    expect(strays).toHaveLength(0)
  })

  it('cannot resend or revoke another company’s invitation', async () => {
    const invitation = await prisma.invitation.create({
      data: {
        organizationId: B.session.organizationId,
        email: 'invitee@b.test',
        role: 'TECHNICIAN',
        tokenHash: 'not-a-real-hash-b',
        invitedById: B.session.userId,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    })
    await deniedOrEmpty('resendInvitation', () => resendInvitation(A.session, invitation.id))
    await deniedOrEmpty('revokeInvitation', () => revokeInvitation(A.session, invitation.id))
    const after = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })
    expect(after.revokedAt).toBeNull()
  })
})

describe('a customer link is bound to one document', () => {
  it('resolves only to its own estimate, in its own organization', async () => {
    const link = await resolvePortalToken(B.portalToken, { countView: false })
    expect(link?.organizationId).toBe(B.session.organizationId)
    expect(link?.estimateId).toBe(B.estimateId)
    // And its tenant context cannot see the other company.
    expect(await link!.context.db.estimate.findUnique({ where: { id: A.estimateId } })).toBeNull()
    expect(await link!.context.db.customer.findUnique({ where: { id: A.customerId } })).toBeNull()
    expect(await link!.context.db.invoice.findMany()).toHaveLength(1)
  })

  it('cannot be swapped for another company’s document', async () => {
    const { selectEstimateOption } = await import('@/server/estimates/lifecycle')
    const link = await resolvePortalToken(B.portalToken, { countView: false })
    // The estimate comes from the link; the option id is the attacker's.
    await deniedOrEmpty('selectEstimateOption (foreign option)', () =>
      selectEstimateOption(link!.context, {
        estimateId: link!.estimateId!,
        optionId: A.optionId,
      }),
    )
    await deniedOrEmpty('signEstimate (foreign option)', () =>
      signEstimate(link!.context, {
        estimateId: link!.estimateId!,
        optionId: A.optionId,
        signerName: 'Attacker',
        signatureDataUrl: PNG,
        approvalMethod: 'REMOTE_LINK',
      }),
    )
    const estimate = await prisma.estimate.findUniqueOrThrow({ where: { id: B.estimateId } })
    expect(estimate.selectedOptionId).not.toBe(A.optionId)
    expect(estimate.status).toBe('DRAFT')
  })

  it('does not resolve a revoked or expired token', async () => {
    const issued = await issuePortalLink(A.session, {
      target: 'ESTIMATE',
      estimateId: A.estimateId,
    })
    expect(await resolvePortalToken(issued.token, { countView: false })).not.toBeNull()

    const row = await prisma.portalLink.findFirstOrThrow({
      where: { organizationId: A.session.organizationId, estimateId: A.estimateId, revokedAt: null },
    })
    await revokePortalLink(A.session, row.id)
    expect(await resolvePortalToken(issued.token, { countView: false })).toBeNull()

    const expired = await issuePortalLink(A.session, {
      target: 'ESTIMATE',
      estimateId: A.estimateId,
      ttlDays: 1,
    })
    await prisma.portalLink.updateMany({
      where: { organizationId: A.session.organizationId, revokedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect(await resolvePortalToken(expired.token, { countView: false })).toBeNull()
  })

  it('issuing a new link revokes the old one', async () => {
    const first = await issuePortalLink(A.session, {
      target: 'ESTIMATE',
      estimateId: A.estimateId,
    })
    const second = await issuePortalLink(A.session, {
      target: 'ESTIMATE',
      estimateId: A.estimateId,
    })
    expect(await resolvePortalToken(first.token, { countView: false })).toBeNull()
    expect(await resolvePortalToken(second.token, { countView: false })).not.toBeNull()
  })

  it('stores only a hash, so a database dump yields no working links', async () => {
    const issued = await issuePortalLink(A.session, {
      target: 'ESTIMATE',
      estimateId: A.estimateId,
    })
    const rows = await prisma.portalLink.findMany({
      where: { organizationId: A.session.organizationId },
    })
    expect(rows.some((row) => row.tokenHash === issued.token)).toBe(false)
    expect(rows.every((row) => /^[0-9a-f]{64}$/.test(row.tokenHash))).toBe(true)
    // 256 bits, base64url.
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('never resolves a guessed or malformed token', async () => {
    for (const token of ['', 'x', 'a'.repeat(43), '../../etc/passwd', 'null', '%00']) {
      expect(await resolvePortalToken(token, { countView: false })).toBeNull()
    }
  })
})

describe('the quote state a technician sees', () => {
  it('never reflects another company’s estimate', async () => {
    const state = await loadQuoteState(A.session, B.jobId)
    expect(state.estimate).toBeNull()
    expect(state.quoted).toHaveLength(0)
  })
})
