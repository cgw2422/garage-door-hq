import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import type { AppSession } from '@/lib/session'
import {
  badgeFor,
  estimateKindForJobType,
  layoutFor,
  optionsHeading,
  primaryChannel,
} from '@/lib/estimate-presentation'
import { ensureDraftEstimate } from '@/server/estimates/builder'
import { signEstimate } from '@/server/estimates/lifecycle'
import { createTestCompany, createTestDoor, createTestJob } from './helpers'

/**
 * Presenting whatever the technician actually built.
 *
 * Good/Better/Best is one way a garage door company sells, not the way. A
 * technician who quotes one repair should get a screen that presents one
 * repair well — not a lone card labelled "GOOD" with two empty slots beside
 * it implying they forgot something.
 *
 * So these tests pin down two things. The shape of the presentation follows
 * the number of options, and tier labels appear only when a company asked for
 * them. And the two ways a customer can approve — the technician's device and
 * a link sent to their phone — produce the same document, the same frozen
 * version and the same signature guarantees, differing only in what gets
 * recorded about which screen they were looking at.
 */

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function option(
  overrides: Partial<{
    id: string
    name: string
    description: string | null
    tier: 'GOOD' | 'BETTER' | 'BEST' | 'STANDARD' | null
    isRecommended: boolean
    totalCents: number
  }> = {},
) {
  return {
    id: 'o1',
    name: 'Replace Both Springs',
    description: null,
    tier: null,
    isRecommended: false,
    totalCents: 49900,
    ...overrides,
  }
}

describe('the shape of the presentation follows the work', () => {
  it('reads one option as a recommendation, never as a tier', () => {
    const one = [option()]
    expect(layoutFor(one, 'PLAIN')).toBe('single')
    expect(optionsHeading('single', 1)).toBe('Recommended repair')
    expect(badgeFor(one[0]!, 'single')).toBeNull()
  })

  // The failure mode this whole change exists to prevent.
  it('never labels a lone option "Good"', () => {
    const lone = [option({ tier: 'GOOD' })]
    expect(layoutFor(lone, 'GOOD_BETTER_BEST')).toBe('single')
    expect(badgeFor(lone[0]!, 'single')).toBeNull()
  })

  it('reads two options as a choice between them', () => {
    const two = [option({ id: 'a' }), option({ id: 'b', name: 'Springs + Rollers' })]
    expect(layoutFor(two, 'PLAIN')).toBe('choices')
    expect(optionsHeading('choices', 2)).toBe('Choose one of two options')
  })

  it('counts four options honestly rather than squeezing them into three tiers', () => {
    const four = ['a', 'b', 'c', 'd'].map((id) => option({ id }))
    expect(layoutFor(four, 'PLAIN')).toBe('choices')
    expect(optionsHeading('choices', 4)).toBe('Choose one of 4 options')
  })

  it('shows Good/Better/Best only when a company asked for it', () => {
    const three = [
      option({ id: 'a', tier: 'GOOD' }),
      option({ id: 'b', tier: 'BETTER' }),
      option({ id: 'c', tier: 'BEST' }),
    ]
    // The same three options, presented either way. The difference is the
    // company's choice, not something inferred from the count.
    expect(layoutFor(three, 'PLAIN')).toBe('choices')
    expect(layoutFor(three, 'GOOD_BETTER_BEST')).toBe('tiered')
    expect(badgeFor(three[1]!, 'tiered')).toEqual({ text: 'Better', tone: 'tier' })
    expect(badgeFor(three[1]!, 'choices')).toBeNull()
  })

  it('falls back to a plain comparison when a tier label went missing', () => {
    const ragged = [option({ id: 'a', tier: 'GOOD' }), option({ id: 'b', tier: null })]
    // Better a straight comparison than a heading with nothing under it.
    expect(layoutFor(ragged, 'GOOD_BETTER_BEST')).toBe('choices')
  })

  it('allows "Recommended" without requiring it', () => {
    const two = [
      option({ id: 'a', isRecommended: true }),
      option({ id: 'b', name: 'Springs + Rollers' }),
    ]
    expect(badgeFor(two[0]!, 'choices')).toEqual({ text: 'Recommended', tone: 'recommended' })
    expect(badgeFor(two[1]!, 'choices')).toBeNull()
  })
})

describe('which channel leads', () => {
  it('presents a repair on the technician’s own device', () => {
    expect(primaryChannel('REPAIR')).toBe('present')
  })

  it('sends a new installation, because that decision is not made in a driveway', () => {
    expect(primaryChannel('INSTALLATION')).toBe('send')
  })

  it('reads the kind from the job rather than asking', () => {
    expect(estimateKindForJobType('door-installation')).toBe('INSTALLATION')
    expect(estimateKindForJobType('opener-installation')).toBe('INSTALLATION')
    expect(estimateKindForJobType('broken-spring')).toBe('REPAIR')
    expect(estimateKindForJobType(null)).toBe('REPAIR')
  })
})

describe('an estimate built from a job', () => {
  let session: AppSession

  beforeAll(async () => {
    process.env.STORAGE_DRIVER = 'local'
    session = (await createTestCompany({ taxRateBps: 725 })).session
  })

  async function draftWith(names: string[], jobTypeSlug?: string) {
    const { customer, property, door } = await createTestDoor(session)
    const jobType = jobTypeSlug
      ? await prisma.jobType.findFirst({
          where: { organizationId: session.organizationId, slug: jobTypeSlug },
        })
      : null
    const job = await createTestJob(session, {
      customerId: customer.id,
      propertyId: property.id,
      doorId: door.id,
    })
    if (jobType) {
      await prisma.job.update({ where: { id: job.id }, data: { jobTypeId: jobType.id } })
    }

    const estimate = await ensureDraftEstimate(session, job.id)
    for (const [index, name] of names.entries()) {
      await prisma.estimateOption.create({
        data: {
          estimateId: estimate.id,
          name,
          sortOrder: index,
          subtotalCents: 49900,
          taxCents: 0,
          totalCents: 49900,
          items: {
            create: {
              kind: 'SERVICE_CALL',
              name,
              quantity: 1,
              unitPriceCents: 49900,
              sortOrder: 0,
            },
          },
        },
      })
    }
    return { job, estimateId: estimate.id }
  }

  it('does not invent a tier for a single-option repair', async () => {
    const { estimateId } = await draftWith(['Replace Both Springs'])
    const estimate = await prisma.estimate.findUniqueOrThrow({
      where: { id: estimateId },
      include: { options: true },
    })

    expect(estimate.presentation).toBe('PLAIN')
    expect(estimate.options).toHaveLength(1)
    expect(estimate.options[0]!.tier).toBeNull()
    expect(layoutFor(estimate.options, estimate.presentation)).toBe('single')
  })

  it('marks an installation job so it leads with sending', async () => {
    const { estimateId } = await draftWith(['16x7 Steel Door'], 'door-installation')
    const estimate = await prisma.estimate.findUniqueOrThrow({ where: { id: estimateId } })

    expect(estimate.kind).toBe('INSTALLATION')
    expect(primaryChannel(estimate.kind)).toBe('send')
  })

  /**
   * The point of §6: the channel is the screen, not the deal.
   *
   * Two estimates with the same contents, one approved on the technician's
   * phone and one through a link, have to produce the same frozen document.
   * If they did not, "which screen did you sign on?" would become a question
   * with legal weight.
   */
  it('produces the same signed document whichever channel approved it', async () => {
    const inPerson = await draftWith(['Replace Both Springs'])
    const remote = await draftWith(['Replace Both Springs'])

    const results = []
    for (const [{ estimateId }, approvalMethod] of [
      [inPerson, 'IN_PERSON_DEVICE'],
      [remote, 'REMOTE_LINK'],
    ] as const) {
      const option = await prisma.estimateOption.findFirstOrThrow({ where: { estimateId } })
      results.push(
        await signEstimate(session, {
          estimateId,
          optionId: option.id,
          signerName: 'Sam Tester',
          signatureDataUrl: PNG,
          approvalMethod,
        }),
      )
    }

    const [device, link] = results
    expect(device!.estimate.status).toBe('ACCEPTED')
    expect(link!.estimate.status).toBe('ACCEPTED')

    // The same content, frozen the same way. Everything a customer is agreeing
    // to — the options, the itemized lines, the prices, the tax and the terms
    // — has to be identical; only the two documents' own numbers and ids are
    // allowed to differ.
    const agreedTerms = (snapshot: unknown) => {
      const document = snapshot as Record<string, unknown>
      return JSON.parse(
        JSON.stringify({
          title: document.title,
          taxRateBps: document.taxRateBps,
          termsText: document.termsText,
          customerMessage: document.customerMessage,
          options: document.options,
        }).replace(/"[0-9a-f]{8}-[0-9a-f-]{27}"/g, '"id"'),
      )
    }
    expect(agreedTerms(device!.version.snapshot)).toEqual(agreedTerms(link!.version.snapshot))

    // And the record of which screen it was, on both the signature and the
    // estimate, because the history has to be able to say.
    expect(device!.signature.approvalMethod).toBe('IN_PERSON_DEVICE')
    expect(device!.estimate.approvalMethod).toBe('IN_PERSON_DEVICE')
    expect(link!.signature.approvalMethod).toBe('REMOTE_LINK')
    expect(link!.estimate.approvalMethod).toBe('REMOTE_LINK')

    // Both are immutable from here: a hash over the version that was signed.
    for (const result of results) {
      expect(result!.signature.documentHash).toBe(result!.version.contentHash)
    }
  })

  it('does not claim an estimate was sent when it was approved in the driveway', async () => {
    const { estimateId } = await draftWith(['Replace Both Springs'])
    const option = await prisma.estimateOption.findFirstOrThrow({ where: { estimateId } })

    const { estimate } = await signEstimate(session, {
      estimateId,
      optionId: option.id,
      signerName: 'Sam Tester',
      signatureDataUrl: PNG,
      approvalMethod: 'IN_PERSON_DEVICE',
    })

    expect(estimate.sentAt).toBeNull()
    expect(estimate.acceptedAt).not.toBeNull()
  })

  it('refuses a second signature, whichever channel tries', async () => {
    const { estimateId } = await draftWith(['Replace Both Springs'])
    const option = await prisma.estimateOption.findFirstOrThrow({ where: { estimateId } })

    await signEstimate(session, {
      estimateId,
      optionId: option.id,
      signerName: 'Sam Tester',
      signatureDataUrl: PNG,
      approvalMethod: 'IN_PERSON_DEVICE',
    })

    await expect(
      signEstimate(session, {
        estimateId,
        optionId: option.id,
        signerName: 'Someone Else',
        signatureDataUrl: PNG,
        approvalMethod: 'REMOTE_LINK',
      }),
    ).rejects.toThrow(/already been signed/)
  })
})
