import type { InspectionItemStatus } from '@prisma/client'

export interface InspectionComponent {
  key: string
  label: string
  /** Grouping for the mobile checklist, so the list reads like the door. */
  group: 'Spring System' | 'Hardware' | 'Door' | 'Opener' | 'Safety'
  hint?: string
}

/**
 * The default residential garage door inspection. Component keys are stable
 * strings rather than an enum so a company can be given extra items later
 * without a migration.
 */
export const RESIDENTIAL_INSPECTION: InspectionComponent[] = [
  { key: 'springs', label: 'Springs', group: 'Spring System', hint: 'Gaps, rust, cycle wear' },
  { key: 'cables', label: 'Cables', group: 'Spring System', hint: 'Fraying, seating on drum' },
  { key: 'drums', label: 'Drums', group: 'Spring System' },
  { key: 'bearings', label: 'Bearings', group: 'Spring System' },
  { key: 'shaft', label: 'Shaft', group: 'Spring System' },
  { key: 'rollers', label: 'Rollers', group: 'Hardware' },
  { key: 'hinges', label: 'Hinges', group: 'Hardware' },
  { key: 'tracks', label: 'Tracks', group: 'Hardware' },
  { key: 'brackets', label: 'Brackets', group: 'Hardware' },
  { key: 'bottom-fixtures', label: 'Bottom Fixtures', group: 'Hardware' },
  { key: 'lubrication', label: 'Lubrication', group: 'Hardware' },
  { key: 'panels', label: 'Panels', group: 'Door' },
  { key: 'bottom-seal', label: 'Bottom Seal', group: 'Door' },
  { key: 'weather-stripping', label: 'Weather Stripping', group: 'Door' },
  { key: 'door-balance', label: 'Door Balance', group: 'Door', hint: 'Disconnect and test at mid-travel' },
  { key: 'noise-vibration', label: 'Noise / Vibration', group: 'Door' },
  { key: 'opener', label: 'Opener', group: 'Opener' },
  { key: 'wall-control', label: 'Wall Control', group: 'Opener' },
  { key: 'remotes', label: 'Remote Controls', group: 'Opener' },
  { key: 'keypad', label: 'Keypad', group: 'Opener' },
  { key: 'photo-eyes', label: 'Photo Eyes / Safety Sensors', group: 'Safety' },
  { key: 'auto-reverse', label: 'Auto-Reverse Test', group: 'Safety' },
  { key: 'manual-release', label: 'Manual Release', group: 'Safety' },
]

export const INSPECTION_TEMPLATES = {
  'residential-standard': {
    name: 'Residential Standard',
    components: RESIDENTIAL_INSPECTION,
  },
} as const

export type InspectionTemplateKey = keyof typeof INSPECTION_TEMPLATES

/** Statuses a technician can set, in the order they appear on the control. */
export const SELECTABLE_STATUSES: InspectionItemStatus[] = [
  'GOOD',
  'WORN',
  'NEEDS_ATTENTION',
  'FAILED',
  'NOT_APPLICABLE',
]

export const STATUS_LABELS: Record<InspectionItemStatus, string> = {
  NOT_CHECKED: 'Not checked',
  GOOD: 'Good',
  WORN: 'Worn',
  NEEDS_ATTENTION: 'Needs attention',
  FAILED: 'Failed',
  NOT_APPLICABLE: 'N/A',
}

/** Findings worth offering to the customer as work. */
export function isActionable(status: InspectionItemStatus): boolean {
  return status === 'WORN' || status === 'NEEDS_ATTENTION' || status === 'FAILED'
}
