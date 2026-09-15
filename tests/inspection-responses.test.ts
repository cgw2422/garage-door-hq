import { describe, expect, it } from 'vitest'
import type { InspectionItemStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  RESIDENTIAL_INSPECTION,
  RESPONSE_SETS,
  STATUS_LABELS,
  STATUS_LABELS_COMPACT,
  isActionable,
  isValidResponse,
  severityOf,
} from '@/lib/inspection-template'
import {
  InspectionError,
  remedyApplies,
  setItemStatus,
  startInspection,
} from '@/server/inspections/service'
import { createTestCompany, createTestDoor, createTestJob } from './helpers'

/**
 * Asking each component the question it actually asks.
 *
 * One universal Good/Worn/Failed scale produced sentences no garage door
 * technician would say — "Door Balance — Worn", "Lubrication — Good" — so the
 * first thing these tests pin down is that those combinations can no longer
 * be written, from the UI or from anywhere else.
 *
 * The second is that nothing downstream noticed. Severity is the contract:
 * Good and Pass are both healthy, Failed and Fail are both critical, and the
 * estimate remedies work from that rather than from the words.
 */

describe('the answer sets', () => {
  it('offers what the trade actually says', () => {
    expect(RESPONSE_SETS.CONDITION).toEqual([
      'GOOD',
      'WORN',
      'NEEDS_ATTENTION',
      'FAILED',
      'NOT_APPLICABLE',
    ])
    expect(RESPONSE_SETS.FUNCTION_TEST).toEqual([
      'PASS',
      'NEEDS_ATTENTION',
      'FAIL',
      'NOT_APPLICABLE',
    ])
    expect(RESPONSE_SETS.MAINTENANCE).toEqual(['COMPLETE', 'NEEDED', 'NOT_APPLICABLE'])
    expect(RESPONSE_SETS.NOISE).toEqual(['NORMAL', 'EXCESSIVE', 'NOT_APPLICABLE'])
    expect(RESPONSE_SETS.BALANCE).toEqual([
      'BALANCED',
      'NEEDS_ADJUSTMENT',
      'UNABLE_TO_TEST',
      'NOT_APPLICABLE',
    ])
    expect(RESPONSE_SETS.SAFETY_TEST).toEqual([
      'PASS',
      'FAIL',
      'UNABLE_TO_TEST',
      'NOT_APPLICABLE',
    ])
    expect(RESPONSE_SETS.ALIGNMENT).toEqual([
      'WORKING',
      'NEEDS_ADJUSTMENT',
      'FAILED',
      'NOT_APPLICABLE',
    ])
  })

  // The words the spec asked for, component by component, so a rename has to
  // be deliberate rather than a side effect of touching the enum.
  it('asks each question in that question’s own words', () => {
    expect(RESPONSE_SETS.BALANCE.map((status) => STATUS_LABELS[status])).toEqual([
      'Balanced',
      'Needs Adjustment',
      'Unable to Test',
      'N/A',
    ])
    expect(RESPONSE_SETS.SAFETY_TEST.map((status) => STATUS_LABELS[status])).toEqual([
      'Pass',
      'Fail',
      'Unable to Test',
      'N/A',
    ])
    expect(RESPONSE_SETS.ALIGNMENT.map((status) => STATUS_LABELS[status])).toEqual([
      'Working',
      'Needs Adjustment',
      'Failed',
      'N/A',
    ])
    expect(RESPONSE_SETS.NOISE.map((status) => STATUS_LABELS[status])).toEqual([
      'Normal',
      'Excessive',
      'N/A',
    ])
  })

  it('ends every set with N/A, and never offers more than five', () => {
    for (const [type, choices] of Object.entries(RESPONSE_SETS)) {
      expect(choices.at(-1), type).toBe('NOT_APPLICABLE')
      expect(choices.length, type).toBeLessThanOrEqual(5)
      expect(choices.length, type).toBeGreaterThanOrEqual(3)
      expect(new Set(choices).size, type).toBe(choices.length)
    }
  })

  it('gives every answer a severity, so nothing falls through', () => {
    for (const choices of Object.values(RESPONSE_SETS)) {
      for (const choice of choices) {
        expect(severityOf(choice), choice).toBeDefined()
      }
    }
    expect(severityOf('NOT_CHECKED')).toBe('NONE')
  })
})

describe('the wording', () => {
  it('never abbreviates to "Attn"', () => {
    const words = [...Object.values(STATUS_LABELS), ...Object.values(STATUS_LABELS_COMPACT)]
    expect(words).not.toContain('Attn')
    expect(STATUS_LABELS.NEEDS_ATTENTION).toBe('Needs Attention')
    // Shortened on a narrow phone, and still a word rather than a form field.
    expect(STATUS_LABELS_COMPACT.NEEDS_ATTENTION).toBe('Attention')
  })

  it('shortens only the answers that do not fit a phone', () => {
    const shortened = (Object.keys(STATUS_LABELS) as InspectionItemStatus[]).filter(
      (status) => STATUS_LABELS[status] !== STATUS_LABELS_COMPACT[status],
    )
    // Three long answers, and every shortening is still something a person
    // would say out loud.
    expect(new Set(shortened)).toEqual(
      new Set(['NEEDS_ATTENTION', 'NEEDS_ADJUSTMENT', 'UNABLE_TO_TEST']),
    )
    expect(STATUS_LABELS_COMPACT.NEEDS_ADJUSTMENT).toBe('Adjust')
    expect(STATUS_LABELS_COMPACT.UNABLE_TO_TEST).toBe("Can't Test")
  })
})

describe('the default template', () => {
  it('asks physical parts about condition', () => {
    for (const key of [
      'springs',
      'cables',
      'drums',
      'bearings',
      'rollers',
      'hinges',
      'tracks',
      'brackets',
      'bottom-fixtures',
      'bottom-seal',
      'weather-stripping',
      'panels',
    ]) {
      const component = RESIDENTIAL_INSPECTION.find((entry) => entry.key === key)
      expect(component?.responseType, key).toBe('CONDITION')
    }
  })

  it('asks tests whether they passed', () => {
    for (const key of ['manual-release', 'wall-control', 'remotes', 'keypad', 'opener']) {
      const component = RESIDENTIAL_INSPECTION.find((entry) => entry.key === key)
      expect(component?.responseType, key).toBe('FUNCTION_TEST')
    }
  })

  it('asks the three checks nobody calls a pass in their own words', () => {
    const byKey = new Map(RESIDENTIAL_INSPECTION.map((entry) => [entry.key, entry]))
    expect(byKey.get('door-balance')?.responseType).toBe('BALANCE')
    expect(byKey.get('auto-reverse')?.responseType).toBe('SAFETY_TEST')
    expect(byKey.get('photo-eyes')?.responseType).toBe('ALIGNMENT')
  })

  it('asks maintenance whether it was done, and noise how loud', () => {
    expect(
      RESIDENTIAL_INSPECTION.find((entry) => entry.key === 'lubrication')?.responseType,
    ).toBe('MAINTENANCE')
    expect(
      RESIDENTIAL_INSPECTION.find((entry) => entry.key === 'noise-vibration')?.responseType,
    ).toBe('NOISE')
  })

  // The sentences that started this.
  it('cannot describe a balance test as worn, or lubrication as good', () => {
    expect(isValidResponse('BALANCE', 'WORN')).toBe(false)
    expect(isValidResponse('MAINTENANCE', 'GOOD')).toBe(false)
    expect(isValidResponse('NOISE', 'FAILED')).toBe(false)
    expect(isValidResponse('CONDITION', 'PASS')).toBe(false)
    // A door is balanced or it is not; it does not "pass".
    expect(isValidResponse('BALANCE', 'PASS')).toBe(false)
    // And a spring cannot be "unable to test" — you can see it.
    expect(isValidResponse('CONDITION', 'UNABLE_TO_TEST')).toBe(false)
  })
})

describe('severity, which is the only thing anything downstream sees', () => {
  it('treats every healthy answer alike', () => {
    const healthy = ['GOOD', 'PASS', 'COMPLETE', 'NORMAL', 'BALANCED', 'WORKING']
    for (const status of healthy as InspectionItemStatus[]) {
      expect(severityOf(status), status).toBe('OK')
      expect(isActionable(status), status).toBe(false)
    }
  })

  it('treats every failure alike', () => {
    for (const status of ['FAILED', 'FAIL', 'EXCESSIVE'] as InspectionItemStatus[]) {
      expect(severityOf(status), status).toBe('CRITICAL')
      expect(isActionable(status), status).toBe(true)
    }
  })

  it('quotes nothing for an answer that is not a finding', () => {
    // A test nobody could run is not a finding and not a clean bill of health.
    for (const status of [
      'NOT_CHECKED',
      'NOT_APPLICABLE',
      'UNABLE_TO_TEST',
    ] as InspectionItemStatus[]) {
      expect(isActionable(status), status).toBe(false)
      expect(severityOf(status), status).toBe('NONE')
    }
  })

  it('treats every "sort this out" answer alike', () => {
    for (const status of [
      'NEEDS_ATTENTION',
      'NEEDED',
      'NEEDS_ADJUSTMENT',
    ] as InspectionItemStatus[]) {
      expect(severityOf(status), status).toBe('ATTENTION')
      expect(isActionable(status), status).toBe(true)
    }
  })
})

describe('remedies', () => {
  // The reason severity exists. A remedy written years ago for a FAILED spring
  // has to keep selling when a photo eye does not pass, without anyone
  // remembering to add the word FAIL to it.
  it('offers a remedy written for FAILED to a test that failed', () => {
    expect(remedyApplies(['FAILED', 'NEEDS_ATTENTION'], 'FAIL')).toBe(true)
    expect(remedyApplies(['FAIL'], 'FAILED')).toBe(true)
    expect(remedyApplies(['FAILED'], 'EXCESSIVE')).toBe(true)
    // Words the remedy's author never saw, selling anyway.
    expect(remedyApplies(['NEEDS_ATTENTION'], 'NEEDS_ADJUSTMENT')).toBe(true)
  })

  it('still respects a remedy that named a narrower finding', () => {
    expect(remedyApplies(['FAILED'], 'WORN')).toBe(false)
    expect(remedyApplies(['WORN'], 'FAIL')).toBe(false)
  })

  it('offers an unrestricted remedy for any finding, and for nothing healthy', () => {
    expect(remedyApplies([], 'NEEDED')).toBe(true)
    expect(remedyApplies([], 'EXCESSIVE')).toBe(true)
    expect(remedyApplies([], 'PASS')).toBe(false)
    expect(remedyApplies([], 'BALANCED')).toBe(false)
    expect(remedyApplies([], 'NOT_APPLICABLE')).toBe(false)
    expect(remedyApplies([], 'UNABLE_TO_TEST')).toBe(false)
  })
})

describe('a real inspection', () => {
  it('carries each component’s response type from the template', async () => {
    const { session } = await createTestCompany()
    const { customer, property, door } = await createTestDoor(session)
    const job = await createTestJob(session, {
      customerId: customer.id,
      propertyId: property.id,
      doorId: door.id,
    })
    const inspection = await startInspection(session, job.id)
    const items = await prisma.inspectionItem.findMany({
      where: { inspectionId: inspection.id },
    })

    const byKey = new Map(items.map((item) => [item.componentKey, item]))
    expect(byKey.get('springs')?.responseType).toBe('CONDITION')
    expect(byKey.get('door-balance')?.responseType).toBe('BALANCE')
    expect(byKey.get('lubrication')?.responseType).toBe('MAINTENANCE')
    expect(byKey.get('noise-vibration')?.responseType).toBe('NOISE')

    // And accepts only the answers that component takes.
    const balance = byKey.get('door-balance')!
    await expect(
      setItemStatus(session, { itemId: balance.id, status: 'WORN' }),
    ).rejects.toThrow(InspectionError)

    await expect(
      setItemStatus(session, { itemId: balance.id, status: 'PASS' }),
    ).rejects.toThrow(InspectionError)

    await setItemStatus(session, { itemId: balance.id, status: 'BALANCED' })
    expect(
      (await prisma.inspectionItem.findUniqueOrThrow({ where: { id: balance.id } })).status,
    ).toBe('BALANCED')

    const lubrication = byKey.get('lubrication')!
    await expect(
      setItemStatus(session, { itemId: lubrication.id, status: 'GOOD' }),
    ).rejects.toThrow(InspectionError)
    await setItemStatus(session, { itemId: lubrication.id, status: 'NEEDED' })
  })
})
