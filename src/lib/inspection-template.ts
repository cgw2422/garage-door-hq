import type { InspectionItemStatus, InspectionResponseType } from '@prisma/client'

/**
 * What a technician is actually being asked about.
 *
 * One universal Good/Worn/Needs Attention/Failed scale is wrong for most of a
 * garage door inspection, and wrong in a way that shows: "Door Balance — Worn"
 * and "Lubrication — Good" are not sentences anyone in this trade would say.
 * A balance test passes or fails. Lubrication is done or it is not. Noise is
 * normal or it is not. Only physical parts wear.
 *
 * So each component names the kind of answer it takes, and the checklist
 * renders that answer set. Adding a type means adding a case here and nothing
 * else: the severity mapping below keeps reporting and the estimate remedies
 * working without either of them knowing the new words.
 */
export interface InspectionComponent {
  key: string
  label: string
  /** Grouping for the mobile checklist, so the list reads like the door. */
  group: 'Spring System' | 'Hardware' | 'Door' | 'Opener' | 'Safety'
  responseType: InspectionResponseType
  hint?: string
}

/**
 * The default residential garage door inspection. Component keys are stable
 * strings rather than an enum so a company can be given extra items later
 * without a migration.
 */
export const RESIDENTIAL_INSPECTION: InspectionComponent[] = [
  { key: 'springs', label: 'Springs', group: 'Spring System', responseType: 'CONDITION', hint: 'Gaps, rust, cycle wear' },
  { key: 'cables', label: 'Cables', group: 'Spring System', responseType: 'CONDITION', hint: 'Fraying, seating on drum' },
  { key: 'drums', label: 'Drums', group: 'Spring System', responseType: 'CONDITION' },
  { key: 'bearings', label: 'Bearings', group: 'Spring System', responseType: 'CONDITION' },
  { key: 'shaft', label: 'Shaft', group: 'Spring System', responseType: 'CONDITION' },
  { key: 'rollers', label: 'Rollers', group: 'Hardware', responseType: 'CONDITION' },
  { key: 'hinges', label: 'Hinges', group: 'Hardware', responseType: 'CONDITION' },
  { key: 'tracks', label: 'Tracks', group: 'Hardware', responseType: 'CONDITION' },
  { key: 'brackets', label: 'Brackets', group: 'Hardware', responseType: 'CONDITION' },
  { key: 'bottom-fixtures', label: 'Bottom Fixtures', group: 'Hardware', responseType: 'CONDITION' },
  { key: 'lubrication', label: 'Lubrication', group: 'Hardware', responseType: 'MAINTENANCE' },
  { key: 'panels', label: 'Panels', group: 'Door', responseType: 'CONDITION' },
  { key: 'bottom-seal', label: 'Bottom Seal', group: 'Door', responseType: 'CONDITION' },
  { key: 'weather-stripping', label: 'Weather Stripping', group: 'Door', responseType: 'CONDITION' },
  { key: 'door-balance', label: 'Door Balance', group: 'Door', responseType: 'BALANCE', hint: 'Disconnect and test at mid-travel' },
  { key: 'noise-vibration', label: 'Noise / Vibration', group: 'Door', responseType: 'NOISE' },
  { key: 'opener', label: 'Opener', group: 'Opener', responseType: 'FUNCTION_TEST' },
  { key: 'wall-control', label: 'Wall Control', group: 'Opener', responseType: 'FUNCTION_TEST' },
  { key: 'remotes', label: 'Remote Controls', group: 'Opener', responseType: 'FUNCTION_TEST' },
  { key: 'keypad', label: 'Keypad', group: 'Opener', responseType: 'FUNCTION_TEST' },
  { key: 'photo-eyes', label: 'Photo Eyes / Safety Sensors', group: 'Safety', responseType: 'ALIGNMENT' },
  { key: 'auto-reverse', label: 'Auto-Reverse Test', group: 'Safety', responseType: 'SAFETY_TEST' },
  { key: 'manual-release', label: 'Manual Release', group: 'Safety', responseType: 'FUNCTION_TEST' },
]

export const INSPECTION_TEMPLATES = {
  'residential-standard': {
    name: 'Residential Standard',
    components: RESIDENTIAL_INSPECTION,
  },
} as const

export type InspectionTemplateKey = keyof typeof INSPECTION_TEMPLATES

const BY_KEY = new Map(RESIDENTIAL_INSPECTION.map((component) => [component.key, component]))

/** The answer set a component takes. Unknown keys fall back to condition. */
export function responseTypeFor(componentKey: string): InspectionResponseType {
  return BY_KEY.get(componentKey)?.responseType ?? 'CONDITION'
}

/**
 * The choices each type offers, in the order they appear on the control —
 * best on the left, worst before N/A, which is always last.
 */
export const RESPONSE_SETS: Record<InspectionResponseType, InspectionItemStatus[]> = {
  CONDITION: ['GOOD', 'WORN', 'NEEDS_ATTENTION', 'FAILED', 'NOT_APPLICABLE'],
  FUNCTION_TEST: ['PASS', 'NEEDS_ATTENTION', 'FAIL', 'NOT_APPLICABLE'],
  MAINTENANCE: ['COMPLETE', 'NEEDED', 'NOT_APPLICABLE'],
  NOISE: ['NORMAL', 'EXCESSIVE', 'NOT_APPLICABLE'],
  BALANCE: ['BALANCED', 'NEEDS_ADJUSTMENT', 'UNABLE_TO_TEST', 'NOT_APPLICABLE'],
  SAFETY_TEST: ['PASS', 'FAIL', 'UNABLE_TO_TEST', 'NOT_APPLICABLE'],
  ALIGNMENT: ['WORKING', 'NEEDS_ADJUSTMENT', 'FAILED', 'NOT_APPLICABLE'],
}

/**
 * How bad each answer is, which is the only thing anything downstream needs.
 *
 * Reporting, the findings count and the estimate remedies all work from this,
 * so a new answer set costs one line here and changes nothing else. These
 * names are internal and never reach a screen: a technician sees "Pass", not
 * "OK".
 *
 * Derived rather than stored, because a stored copy can disagree with the
 * answer beside it and there is no way to tell which one is wrong.
 */
export type InspectionSeverity = 'NONE' | 'OK' | 'MONITOR' | 'ATTENTION' | 'CRITICAL'

const SEVERITY: Record<InspectionItemStatus, InspectionSeverity> = {
  NOT_CHECKED: 'NONE',
  NOT_APPLICABLE: 'NONE',

  GOOD: 'OK',
  PASS: 'OK',
  COMPLETE: 'OK',
  NORMAL: 'OK',
  BALANCED: 'OK',
  WORKING: 'OK',

  WORN: 'MONITOR',
  NOTICEABLE: 'MONITOR',

  NEEDS_ATTENTION: 'ATTENTION',
  NEEDED: 'ATTENTION',
  NEEDS_ADJUSTMENT: 'ATTENTION',

  FAILED: 'CRITICAL',
  FAIL: 'CRITICAL',
  EXCESSIVE: 'CRITICAL',

  // Not a verdict. A test nobody could run is not a finding to quote from and
  // not a clean bill of health either, so it reads as neither.
  UNABLE_TO_TEST: 'NONE',
}

export function severityOf(status: InspectionItemStatus): InspectionSeverity {
  return SEVERITY[status]
}

/** Findings worth offering to the customer as work. */
export function isActionable(status: InspectionItemStatus): boolean {
  const severity = severityOf(status)
  return severity === 'MONITOR' || severity === 'ATTENTION' || severity === 'CRITICAL'
}

/** True when this answer belongs to this kind of question. */
export function isValidResponse(
  responseType: InspectionResponseType,
  status: InspectionItemStatus,
): boolean {
  return status === 'NOT_CHECKED' || RESPONSE_SETS[responseType].includes(status)
}

/**
 * Words for each answer.
 *
 * `compact` is what a narrow phone shows when four or five choices share the
 * width. It exists for exactly one answer — "Needs Attention" does not fit a
 * fifth of a 390px screen, and "Attn" reads like a form field, not like a
 * technician. Everything else says the same thing at every width.
 */
export const STATUS_LABELS: Record<InspectionItemStatus, string> = {
  NOT_CHECKED: 'Not checked',
  GOOD: 'Good',
  WORN: 'Worn',
  NEEDS_ATTENTION: 'Needs Attention',
  FAILED: 'Failed',
  PASS: 'Pass',
  FAIL: 'Fail',
  COMPLETE: 'Complete',
  NEEDED: 'Needed',
  NORMAL: 'Normal',
  NOTICEABLE: 'Noticeable',
  EXCESSIVE: 'Excessive',
  BALANCED: 'Balanced',
  NEEDS_ADJUSTMENT: 'Needs Adjustment',
  WORKING: 'Working',
  UNABLE_TO_TEST: 'Unable to Test',
  NOT_APPLICABLE: 'N/A',
}

export const STATUS_LABELS_COMPACT: Record<InspectionItemStatus, string> = {
  ...STATUS_LABELS,
  NEEDS_ATTENTION: 'Attention',
  NEEDS_ADJUSTMENT: 'Adjust',
  UNABLE_TO_TEST: "Can't Test",
}
