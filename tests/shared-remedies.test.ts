import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import {
  isRemedyQuoted,
  loadQuotedServices,
  loadRemedies,
  quotedKey,
  startInspection,
  type RemedyOption,
} from '@/server/inspections/service'
import { addRemedyToEstimate, removeEstimateItem } from '@/server/estimates/builder'
import type { AppSession } from '@/lib/session'
import { createTestCompany, createTestDoor, createTestJob, skuId } from './helpers'

/**
 * One service, offered under several findings.
 *
 * A roller swap hangs off Rollers, off Lubrication and off Noise, because all
 * three are reasons to do it. It is still one service and one line on the
 * estimate. What these tests pin down is that the answer to "is this already
 * quoted?" comes from the estimate rather than from which button was tapped —
 * so the state is shared, the total does not move on a second tap, and taking
 * the line off puts every button back.
 */

async function setUp() {
  const { session } = await createTestCompany()
  const { customer, property, door } = await createTestDoor(session)
  const job = await createTestJob(session, {
    customerId: customer.id,
    propertyId: property.id,
    doorId: door.id,
  })
  const inspection = await startInspection(session, job.id)
  const items = await prisma.inspectionItem.findMany({ where: { inspectionId: inspection.id } })
  return { session, job, itemsByKey: new Map(items.map((item) => [item.componentKey, item])) }
}

/**
 * One catalog line offered under two different components, which is the shape
 * the starter catalog already has for the roller upgrade and a tune-up.
 */
async function offerSameServiceTwice(session: AppSession, componentKeys: string[]) {
  const rollerId = await skuId(session.organizationId, 'RLR-NYL-13')
  for (const componentKey of componentKeys) {
    await prisma.inspectionRemedy.create({
      data: {
        organizationId: session.organizationId,
        componentKey,
        name: 'Roller Swap + Tune-Up',
        priceBookItemId: rollerId,
        quantity: 10,
        sortOrder: 99,
      },
    })
  }
  return rollerId
}

function remedyFor(remedies: Map<string, RemedyOption[]>, componentKey: string, name: string) {
  const option = (remedies.get(componentKey) ?? []).find((entry) => entry.name === name)
  if (!option) throw new Error(`No ${name} remedy under ${componentKey}`)
  return option
}

describe('a service offered under more than one finding', () => {
  it('is one line on the estimate, however many times it is tapped', async () => {
    const { session, job, itemsByKey } = await setUp()
    const rollerId = await offerSameServiceTwice(session, ['rollers', 'lubrication'])

    const first = await addRemedyToEstimate(session, {
      jobId: job.id,
      inspectionItemId: itemsByKey.get('rollers')!.id,
      remedyId: (await loadRemedies(session).then((all) =>
        remedyFor(all, 'rollers', 'Roller Swap + Tune-Up'),
      )).id,
    })

    const afterFirst = await prisma.estimateOption.findMany({
      where: { estimateId: first.estimateId },
      include: { items: true },
    })
    const totalAfterFirst = afterFirst.reduce((sum, option) => sum + option.totalCents, 0)

    // The same service, tapped from a different section of the checklist.
    await addRemedyToEstimate(session, {
      jobId: job.id,
      inspectionItemId: itemsByKey.get('lubrication')!.id,
      remedyId: (await loadRemedies(session).then((all) =>
        remedyFor(all, 'lubrication', 'Roller Swap + Tune-Up'),
      )).id,
    })

    const afterSecond = await prisma.estimateOption.findMany({
      where: { estimateId: first.estimateId },
      include: { items: true },
    })

    const lines = afterSecond.flatMap((option) =>
      option.items.filter((item) => item.priceBookItemId === rollerId),
    )
    expect(lines).toHaveLength(1)
    expect(Number(lines[0]!.quantity.toString())).toBe(10)

    const totalAfterSecond = afterSecond.reduce((sum, option) => sum + option.totalCents, 0)
    expect(totalAfterSecond).toBe(totalAfterFirst)
  })

  it('reports itself quoted under every finding that offers it', async () => {
    const { session, job, itemsByKey } = await setUp()
    await offerSameServiceTwice(session, ['rollers', 'lubrication', 'noise-vibration'])

    const before = new Set(await loadQuotedServices(session, job.id))
    const remedies = await loadRemedies(session)
    for (const key of ['rollers', 'lubrication', 'noise-vibration']) {
      expect(isRemedyQuoted(remedyFor(remedies, key, 'Roller Swap + Tune-Up'), before), key).toBe(
        false,
      )
    }

    // Added once, under one of them.
    await addRemedyToEstimate(session, {
      jobId: job.id,
      inspectionItemId: itemsByKey.get('rollers')!.id,
      remedyId: remedyFor(remedies, 'rollers', 'Roller Swap + Tune-Up').id,
    })

    const after = new Set(await loadQuotedServices(session, job.id))
    for (const key of ['rollers', 'lubrication', 'noise-vibration']) {
      expect(isRemedyQuoted(remedyFor(remedies, key, 'Roller Swap + Tune-Up'), after), key).toBe(
        true,
      )
    }
  })

  it('goes back to unquoted everywhere when the line is removed', async () => {
    const { session, job, itemsByKey } = await setUp()
    const rollerId = await offerSameServiceTwice(session, ['rollers', 'lubrication'])
    const remedies = await loadRemedies(session)

    const added = await addRemedyToEstimate(session, {
      jobId: job.id,
      inspectionItemId: itemsByKey.get('rollers')!.id,
      remedyId: remedyFor(remedies, 'rollers', 'Roller Swap + Tune-Up').id,
    })

    const line = await prisma.estimateItem.findFirstOrThrow({
      where: { option: { estimateId: added.estimateId }, priceBookItemId: rollerId },
    })
    await removeEstimateItem(session, line.id)

    const after = new Set(await loadQuotedServices(session, job.id))
    for (const key of ['rollers', 'lubrication']) {
      expect(isRemedyQuoted(remedyFor(remedies, key, 'Roller Swap + Tune-Up'), after), key).toBe(
        false,
      )
    }
  })

  // Deliberately not shared across tiers. GOOD, BETTER and BEST are
  // alternatives the customer picks between, so a roller swap inside the BEST
  // package is a different offer from a roller swap on its own — treating them
  // as the same would quietly drop a line from whichever one was chosen.
  it('does not treat the same part in two tiers as one offer', async () => {
    const { session } = await createTestCompany()
    const rollerId = await skuId(session.organizationId, 'RLR-NYL-13')

    const standalone: RemedyOption = {
      id: 'a',
      name: 'Roller Upgrade',
      description: null,
      priceCents: 12000,
      tier: 'STANDARD',
      isPackage: false,
      forStatuses: [],
      targetItemIds: [rollerId],
    }
    const insideBest: RemedyOption = { ...standalone, id: 'b', tier: 'BEST', isPackage: true }

    const quoted = new Set([quotedKey('BEST', rollerId)])
    expect(isRemedyQuoted(insideBest, quoted)).toBe(true)
    expect(isRemedyQuoted(standalone, quoted)).toBe(false)
  })

  it('is never quoted when it sells nothing', async () => {
    const empty: RemedyOption = {
      id: 'c',
      name: 'Nothing priced yet',
      description: null,
      priceCents: 0,
      tier: 'STANDARD',
      isPackage: false,
      forStatuses: [],
      targetItemIds: [],
    }
    expect(isRemedyQuoted(empty, new Set())).toBe(false)
  })

  it('needs every line of a package before it counts as added', async () => {
    const { session } = await createTestCompany()
    const roller = await skuId(session.organizationId, 'RLR-NYL-13')
    const labor = await skuId(session.organizationId, 'LBR-TUNEUP')

    const pkg: RemedyOption = {
      id: 'd',
      name: 'Roller Swap + Tune-Up',
      description: null,
      priceCents: 20000,
      tier: 'STANDARD',
      isPackage: true,
      forStatuses: [],
      targetItemIds: [roller, labor],
    }

    expect(isRemedyQuoted(pkg, new Set([quotedKey('STANDARD', roller)]))).toBe(false)
    expect(
      isRemedyQuoted(
        pkg,
        new Set([quotedKey('STANDARD', roller), quotedKey('STANDARD', labor)]),
      ),
    ).toBe(true)
  })
})
