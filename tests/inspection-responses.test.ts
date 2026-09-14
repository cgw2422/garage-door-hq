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
    expect(RESPONSE_SETS.NOISE).toEqual([
      'NORMAL',
      'NOTICEABLE',
      'EXCESSIVE',
      'NOT_APPLICABLE',
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
    // The one shortening, and it is still a word.
    expect(STATUS_LABELS_COMPACT.NEEDS_ATTENTION).toBe('Attention')
  })

  it('shortens exactly one answer, because only one does not fit', () => {
    const shortened = (Object.keys(STATUS_LABELS) as InspectionItemStatus[]).filter(
      (status) => STATUS_LABELS[status] !== STATUS_LABELS_COMPACT[status],
    )
    expect(shortened).toEqual(['NEEDS_ATTENTION'])
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
    for (const key of [
      'door-balance',
      'photo-eyes',
      'auto-reverse',
      'manual-release',
      'wall-control',
      'remotes',
      'keypad',
      'opener',
    ]) {
      const component = RESIDENTIAL_INSPECTION.find((entry) => entry.key === key)
      expect(component?.responseType, key).toBe('FUNCTION_TEST')
    }
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
    expect(isValidResponse('FUNCTION_TEST', 'WORN')).toBe(false)
    expect(isValidResponse('MAINTENANCE', 'GOOD')).toBe(false)
    expect(isValidResponse('NOISE', 'FAILED')).toBe(false)
    expect(isValidResponse('CONDITION', 'PASS')).toBe(false)
  })
})

describe('severity, which is the only thing anything downstream sees', () => {
  it('treats every healthy answer alike', () => {
    for (const status of ['GOOD', 'PASS', 'COMPLETE', 'NORMAL'] as InspectionItemStatus[]) {
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
    for (const status of ['NOT_CHECKED', 'NOT_APPLICABLE'] as InspectionItemStatus[]) {
      expect(isActionable(status), status).toBe(false)
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
  })

  it('still respects a remedy that named a narrower finding', () => {
    expect(remedyApplies(['FAILED'], 'WORN')).toBe(false)
    expect(remedyApplies(['WORN'], 'FAIL')).toBe(false)
  })

  it('offers an unrestricted remedy for any finding, and for nothing healthy', () => {
    expect(remedyApplies([], 'NEEDED')).toBe(true)
    expect(remedyApplies([], 'NOTICEABLE')).toBe(true)
    expect(remedyApplies([], 'PASS')).toBe(false)
    expect(remedyApplies([], 'NOT_APPLICABLE')).toBe(false)
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
    expect(byKey.get('door-balance')?.responseType).toBe('FUNCTION_TEST')
    expect(byKey.get('lubrication')?.responseType).toBe('MAINTENANCE')
    expect(byKey.get('noise-vibration')?.responseType).toBe('NOISE')

    // And accepts only the answers that component takes.
    const balance = byKey.get('door-balance')!
    await expect(
      setItemStatus(session, { itemId: balance.id, status: 'WORN' }),
    ).rejects.toThrow(InspectionError)

    await setItemStatus(session, { itemId: balance.id, status: 'PASS' })
    expect(
      (await prisma.inspectionItem.findUniqueOrThrow({ where: { id: balance.id } })).status,
    ).toBe('PASS')

    const lubrication = byKey.get('lubrication')!
    await expect(
      setItemStatus(session, { itemId: lubrication.id, status: 'GOOD' }),
    ).rejects.toThrow(InspectionError)
    await setItemStatus(session, { itemId: lubrication.id, status: 'NEEDED' })
  })
})
