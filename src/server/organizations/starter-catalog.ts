import type { EstimateTier, InspectionItemStatus, PriceBookCategory, SpringSystemType, WindDirection } from '@prisma/client'

/**
 * The garage-door starter catalog a new company begins with.
 *
 * Prices here are SUGGESTIONS, not market rates. A new account gets a working
 * structure — real SKUs, real spring sizes, sensible packages and the remedy
 * mapping that makes inspection findings one-tap sellable — and is told to
 * review the numbers before quoting. Shipping an empty price book would mean a
 * technician's first estimate is a blank screen in a customer's driveway.
 */

export const STARTER_JOB_TYPES = [
  { name: 'Broken Spring', slug: 'broken-spring' },
  { name: 'Spring Replacement', slug: 'spring-replacement' },
  { name: "Door Won't Open", slug: 'door-wont-open' },
  { name: 'Door Off Track', slug: 'door-off-track' },
  { name: 'Cable Repair', slug: 'cable-repair' },
  { name: 'Roller Replacement', slug: 'roller-replacement' },
  { name: 'Opener Repair', slug: 'opener-repair' },
  { name: 'Opener Installation', slug: 'opener-installation' },
  { name: 'Garage Door Installation', slug: 'door-installation' },
  { name: 'Panel Replacement', slug: 'panel-replacement' },
  { name: 'Tune-Up', slug: 'tune-up' },
  { name: 'Preventive Maintenance', slug: 'preventive-maintenance' },
  { name: 'Safety Inspection', slug: 'safety-inspection' },
  { name: 'Remote / Keypad', slug: 'remote-keypad' },
  { name: 'Weather Seal', slug: 'weather-seal' },
  { name: 'Commercial Service', slug: 'commercial-service' },
  { name: 'Estimate', slug: 'estimate' },
  { name: 'Other', slug: 'other' },
] as const

export interface StarterSpring {
  sku: string
  name: string
  type: SpringSystemType
  wire: number
  insideDiameter: number
  length: number
  wind: WindDirection
  cycles: number
  colorCode: string
  costCents: number
  priceCents: number
  /** Suggested stock for a residential truck. */
  truckQty: number
  truckMin: number
}

/** Sizes a residential shop genuinely carries, with the usual colour coding. */
export const STARTER_SPRINGS: StarterSpring[] = [
  { sku: 'TS-2250-200-270-L', name: 'Torsion Spring .225 x 2" x 27" LH', type: 'TORSION', wire: 0.225, insideDiameter: 2, length: 27, wind: 'LEFT_HAND', cycles: 10000, colorCode: 'Red', costCents: 2850, priceCents: 8900, truckQty: 2, truckMin: 2 },
  { sku: 'TS-2250-200-270-R', name: 'Torsion Spring .225 x 2" x 27" RH', type: 'TORSION', wire: 0.225, insideDiameter: 2, length: 27, wind: 'RIGHT_HAND', cycles: 10000, colorCode: 'Red', costCents: 2850, priceCents: 8900, truckQty: 2, truckMin: 2 },
  { sku: 'TS-2250-200-270-L25', name: 'Torsion Spring .225 x 2" x 27" LH · 25K', type: 'TORSION', wire: 0.225, insideDiameter: 2, length: 27, wind: 'LEFT_HAND', cycles: 25000, colorCode: 'Red', costCents: 4200, priceCents: 13900, truckQty: 2, truckMin: 2 },
  { sku: 'TS-2250-200-270-R25', name: 'Torsion Spring .225 x 2" x 27" RH · 25K', type: 'TORSION', wire: 0.225, insideDiameter: 2, length: 27, wind: 'RIGHT_HAND', cycles: 25000, colorCode: 'Red', costCents: 4200, priceCents: 13900, truckQty: 2, truckMin: 2 },
  { sku: 'TS-2500-200-320-L', name: 'Torsion Spring .250 x 2" x 32" LH', type: 'TORSION', wire: 0.25, insideDiameter: 2, length: 32, wind: 'LEFT_HAND', cycles: 10000, colorCode: 'Gold', costCents: 3450, priceCents: 9900, truckQty: 3, truckMin: 2 },
  { sku: 'TS-2500-200-320-R', name: 'Torsion Spring .250 x 2" x 32" RH', type: 'TORSION', wire: 0.25, insideDiameter: 2, length: 32, wind: 'RIGHT_HAND', cycles: 10000, colorCode: 'Gold', costCents: 3450, priceCents: 9900, truckQty: 3, truckMin: 2 },
  { sku: 'TS-2070-175-240-L', name: 'Torsion Spring .207 x 1.75" x 24" LH', type: 'TORSION', wire: 0.207, insideDiameter: 1.75, length: 24, wind: 'LEFT_HAND', cycles: 10000, colorCode: 'Yellow', costCents: 2400, priceCents: 7900, truckQty: 2, truckMin: 1 },
  { sku: 'TS-2070-175-240-R', name: 'Torsion Spring .207 x 1.75" x 24" RH', type: 'TORSION', wire: 0.207, insideDiameter: 1.75, length: 24, wind: 'RIGHT_HAND', cycles: 10000, colorCode: 'Yellow', costCents: 2400, priceCents: 7900, truckQty: 2, truckMin: 1 },
  { sku: 'TS-2430-200-290-L', name: 'Torsion Spring .243 x 2" x 29" LH', type: 'TORSION', wire: 0.243, insideDiameter: 2, length: 29, wind: 'LEFT_HAND', cycles: 10000, colorCode: 'Brown', costCents: 3150, priceCents: 9500, truckQty: 2, truckMin: 1 },
  { sku: 'TS-2430-200-290-R', name: 'Torsion Spring .243 x 2" x 29" RH', type: 'TORSION', wire: 0.243, insideDiameter: 2, length: 29, wind: 'RIGHT_HAND', cycles: 10000, colorCode: 'Brown', costCents: 3150, priceCents: 9500, truckQty: 2, truckMin: 1 },
  { sku: 'ES-140-250-L', name: 'Extension Spring 140 lb · 25"', type: 'EXTENSION', wire: 0.177, insideDiameter: 1, length: 25, wind: 'LEFT_HAND', cycles: 10000, colorCode: 'Yellow', costCents: 1450, priceCents: 4900, truckQty: 4, truckMin: 2 },
  { sku: 'ES-160-250-R', name: 'Extension Spring 160 lb · 25"', type: 'EXTENSION', wire: 0.192, insideDiameter: 1, length: 25, wind: 'RIGHT_HAND', cycles: 10000, colorCode: 'Green', costCents: 1550, priceCents: 4900, truckQty: 4, truckMin: 2 },
]

export interface StarterPart {
  sku: string
  name: string
  category: PriceBookCategory
  costCents: number
  priceCents: number
  unit: string
  taxable?: boolean
  trackInventory?: boolean
  truckQty?: number
  truckMin?: number
}

export const STARTER_PARTS: StarterPart[] = [
  { sku: 'RLR-NYL-13', name: '13-Ball Nylon Roller', category: 'ROLLERS', costCents: 320, priceCents: 1200, unit: 'ea', truckQty: 32, truckMin: 20 },
  { sku: 'RLR-STL-10', name: '10-Ball Steel Roller', category: 'ROLLERS', costCents: 180, priceCents: 700, unit: 'ea', truckQty: 14, truckMin: 10 },
  { sku: 'CBL-7FT-SET', name: 'Lift Cable Set · 7 ft Door', category: 'CABLES', costCents: 900, priceCents: 3400, unit: 'set', truckQty: 8, truckMin: 4 },
  { sku: 'CBL-8FT-SET', name: 'Lift Cable Set · 8 ft Door', category: 'CABLES', costCents: 1050, priceCents: 3800, unit: 'set', truckQty: 4, truckMin: 2 },
  { sku: 'DRM-400-8', name: 'Cable Drum 400-8', category: 'DRUMS', costCents: 1250, priceCents: 4200, unit: 'ea', truckQty: 8, truckMin: 4 },
  { sku: 'BRG-625', name: 'End Bearing Plate 6252', category: 'BEARINGS', costCents: 650, priceCents: 2400, unit: 'ea', truckQty: 10, truckMin: 6 },
  { sku: 'BRG-CTR', name: 'Center Bearing Bracket', category: 'BEARINGS', costCents: 780, priceCents: 2900, unit: 'ea', truckQty: 4, truckMin: 2 },
  { sku: 'SHF-1IN-96', name: '1" Torsion Shaft · 96"', category: 'SHAFTS', costCents: 2200, priceCents: 6900, unit: 'ea', truckQty: 2, truckMin: 1 },
  { sku: 'HNG-NO2', name: 'Galvanized Hinge #2', category: 'HINGES', costCents: 210, priceCents: 900, unit: 'ea', truckQty: 16, truckMin: 10 },
  { sku: 'HNG-NO3', name: 'Galvanized Hinge #3', category: 'HINGES', costCents: 210, priceCents: 900, unit: 'ea', truckQty: 12, truckMin: 10 },
  { sku: 'OPN-BELT-STD', name: 'Belt Drive Opener · Standard', category: 'OPENERS', costCents: 24500, priceCents: 54900, unit: 'ea', truckQty: 2, truckMin: 1 },
  { sku: 'OPN-WALL-MNT', name: 'Wall Mount Opener', category: 'OPENERS', costCents: 38000, priceCents: 79900, unit: 'ea', truckQty: 2, truckMin: 1 },
  { sku: 'RMT-STD', name: 'Remote Control', category: 'REMOTES', costCents: 1800, priceCents: 4900, unit: 'ea', truckQty: 11, truckMin: 6 },
  { sku: 'KPD-STD', name: 'Wireless Keypad', category: 'KEYPADS', costCents: 3400, priceCents: 8900, unit: 'ea', truckQty: 5, truckMin: 3 },
  { sku: 'EYE-PAIR', name: 'Safety Sensor Pair', category: 'PHOTO_EYES', costCents: 2600, priceCents: 7900, unit: 'pair', truckQty: 4, truckMin: 2 },
  { sku: 'WLC-STD', name: 'Wall Control', category: 'WALL_CONTROLS', costCents: 3900, priceCents: 9900, unit: 'ea', truckQty: 3, truckMin: 2 },
  { sku: 'SEAL-BTM-16', name: 'Bottom Seal · 16 ft T-Style', category: 'WEATHER_SEAL', costCents: 1400, priceCents: 4900, unit: 'ea', truckQty: 15, truckMin: 6 },
  { sku: 'SEAL-JMB-KIT', name: 'Perimeter Weather Stripping Kit', category: 'WEATHER_SEAL', costCents: 2100, priceCents: 6900, unit: 'kit', truckQty: 9, truckMin: 4 },
  { sku: 'LUB-KIT', name: 'Lubrication Service Kit', category: 'MISCELLANEOUS', costCents: 400, priceCents: 1900, unit: 'ea', truckQty: 6, truckMin: 3 },
]

export const STARTER_LABOR: StarterPart[] = [
  { sku: 'SVC-CALL', name: 'Service Call', category: 'SERVICE_CALL', costCents: 0, priceCents: 8900, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'LBR-SPRING', name: 'Spring Replacement Labor', category: 'LABOR', costCents: 0, priceCents: 14900, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'LBR-TUNEUP', name: 'Full Safety Tune-Up & Lubrication', category: 'LABOR', costCents: 0, priceCents: 8900, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'LBR-OPENER', name: 'Opener Installation Labor', category: 'LABOR', costCents: 0, priceCents: 17900, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'LBR-CABLE', name: 'Cable Repair Labor', category: 'LABOR', costCents: 0, priceCents: 9900, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'LBR-ROLLER', name: 'Roller Replacement Labor', category: 'LABOR', costCents: 0, priceCents: 7900, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'LBR-SEAL', name: 'Weather Seal Labor', category: 'LABOR', costCents: 0, priceCents: 5900, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'LBR-GENERAL', name: 'General Repair Labor · Per Hour', category: 'LABOR', costCents: 0, priceCents: 12500, unit: 'hr', taxable: false, trackInventory: false },
]

export interface StarterPackage {
  key: string
  name: string
  description: string
  defaultTier: EstimateTier
  isRecommendedDefault: boolean
  sortOrder: number
  lines: Array<{ sku: string; quantity: number }>
}

/**
 * Reusable estimate options. Dropping one onto an estimate copies its lines in
 * individually, so the customer always sees itemized pricing.
 */
export const STARTER_PACKAGES: StarterPackage[] = [
  {
    key: 'spring-standard',
    name: 'Standard Spring Replacement',
    description: 'Matched pair of 10,000-cycle torsion springs and replacement labor.',
    defaultTier: 'GOOD',
    isRecommendedDefault: false,
    sortOrder: 0,
    lines: [
      { sku: 'TS-2250-200-270-L', quantity: 1 },
      { sku: 'TS-2250-200-270-R', quantity: 1 },
      { sku: 'LBR-SPRING', quantity: 1 },
    ],
  },
  {
    key: 'spring-high-cycle',
    name: '25,000-Cycle Spring Replacement',
    description: 'High-cycle spring pair — roughly two and a half times the service life.',
    defaultTier: 'BETTER',
    isRecommendedDefault: true,
    sortOrder: 1,
    lines: [
      { sku: 'TS-2250-200-270-L25', quantity: 1 },
      { sku: 'TS-2250-200-270-R25', quantity: 1 },
      { sku: 'LBR-SPRING', quantity: 1 },
    ],
  },
  {
    key: 'spring-premium',
    name: 'High-Cycle Springs + Roller Upgrade',
    description:
      '25,000-cycle springs, ten 13-ball nylon rollers and a full safety tune-up with lubrication.',
    defaultTier: 'BEST',
    isRecommendedDefault: false,
    sortOrder: 2,
    lines: [
      { sku: 'TS-2250-200-270-L25', quantity: 1 },
      { sku: 'TS-2250-200-270-R25', quantity: 1 },
      { sku: 'RLR-NYL-13', quantity: 10 },
      { sku: 'LBR-SPRING', quantity: 1 },
      { sku: 'LBR-TUNEUP', quantity: 1 },
    ],
  },
  {
    key: 'roller-upgrade',
    name: 'Nylon Roller Upgrade',
    description: 'Ten 13-ball nylon rollers installed — quieter and far longer lived than steel.',
    defaultTier: 'STANDARD',
    isRecommendedDefault: false,
    sortOrder: 3,
    lines: [
      { sku: 'RLR-NYL-13', quantity: 10 },
      { sku: 'LBR-ROLLER', quantity: 1 },
    ],
  },
  {
    key: 'cable-repair',
    name: 'Cable Replacement',
    description: 'New lift cable set with drums inspected and re-seated.',
    defaultTier: 'STANDARD',
    isRecommendedDefault: false,
    sortOrder: 4,
    lines: [
      { sku: 'CBL-7FT-SET', quantity: 1 },
      { sku: 'LBR-CABLE', quantity: 1 },
    ],
  },
  {
    key: 'weather-seal',
    name: 'Bottom Seal Replacement',
    description: 'New bottom seal fitted and the retainer cleaned out.',
    defaultTier: 'STANDARD',
    isRecommendedDefault: false,
    sortOrder: 5,
    lines: [
      { sku: 'SEAL-BTM-16', quantity: 1 },
      { sku: 'LBR-SEAL', quantity: 1 },
    ],
  },
  {
    key: 'tune-up',
    name: 'Safety Tune-Up',
    description: 'Balance, lubricate, adjust travel and force, and test safety reverse.',
    defaultTier: 'STANDARD',
    isRecommendedDefault: false,
    sortOrder: 6,
    lines: [
      { sku: 'LBR-TUNEUP', quantity: 1 },
      { sku: 'LUB-KIT', quantity: 1 },
    ],
  },
]

/**
 * A whole catalog: what one company sells, what it stocks, and how an
 * inspection finding turns into a line on an estimate.
 *
 * Parameterised because not every company prices the same way. A new signup
 * gets STARTER_CATALOG below — parts and hourly labor, the shape most shops
 * recognise. The demo company prices flat rate, one number per job, which is
 * a different catalog built from the same pieces.
 */
export interface Catalog {
  springs: StarterSpring[]
  /** Parts and services alike; a service is simply not stocked. */
  parts: StarterPart[]
  packages: StarterPackage[]
  remedies: StarterRemedy[]
}

export interface StarterRemedy {
  componentKey: string
  name: string
  description?: string
  /** Exactly one of these. */
  packageKey?: string
  sku?: string
  quantity?: number
  forStatuses?: InspectionItemStatus[]
  sortOrder?: number
}

/**
 * The inspection-to-estimate mapping.
 *
 * "Rollers: Worn" surfaces the roller upgrade as a single tap. A `FAILED`
 * spring offers all three spring options so the technician can present good,
 * better and best without building anything by hand.
 */
export const STARTER_REMEDIES: StarterRemedy[] = [
  { componentKey: 'springs', name: 'Standard Spring Replacement', packageKey: 'spring-standard', sortOrder: 0 },
  { componentKey: 'springs', name: '25,000-Cycle Spring Replacement', packageKey: 'spring-high-cycle', sortOrder: 1 },
  { componentKey: 'springs', name: 'High-Cycle Springs + Roller Upgrade', packageKey: 'spring-premium', sortOrder: 2 },
  { componentKey: 'rollers', name: 'Nylon Roller Upgrade', packageKey: 'roller-upgrade', sortOrder: 0 },
  { componentKey: 'cables', name: 'Cable Replacement', packageKey: 'cable-repair', sortOrder: 0 },
  { componentKey: 'drums', name: 'Replace Cable Drum', sku: 'DRM-400-8', quantity: 2, sortOrder: 0 },
  { componentKey: 'bearings', name: 'Replace End Bearing Plates', sku: 'BRG-625', quantity: 2, sortOrder: 0 },
  { componentKey: 'bearings', name: 'Replace Center Bearing', sku: 'BRG-CTR', quantity: 1, sortOrder: 1 },
  { componentKey: 'shaft', name: 'Replace Torsion Shaft', sku: 'SHF-1IN-96', quantity: 1, sortOrder: 0 },
  { componentKey: 'hinges', name: 'Replace Hinges', sku: 'HNG-NO2', quantity: 4, sortOrder: 0 },
  { componentKey: 'bottom-seal', name: 'Bottom Seal Replacement', packageKey: 'weather-seal', sortOrder: 0 },
  { componentKey: 'weather-stripping', name: 'Perimeter Weather Stripping', sku: 'SEAL-JMB-KIT', quantity: 1, sortOrder: 0 },
  { componentKey: 'photo-eyes', name: 'Replace Safety Sensors', sku: 'EYE-PAIR', quantity: 1, sortOrder: 0 },
  { componentKey: 'wall-control', name: 'Replace Wall Control', sku: 'WLC-STD', quantity: 1, sortOrder: 0 },
  { componentKey: 'remotes', name: 'Add Remote Control', sku: 'RMT-STD', quantity: 1, sortOrder: 0 },
  { componentKey: 'keypad', name: 'Replace Keypad', sku: 'KPD-STD', quantity: 1, sortOrder: 0 },
  { componentKey: 'opener', name: 'Replace Opener · Belt Drive', sku: 'OPN-BELT-STD', quantity: 1, sortOrder: 0, forStatuses: ['FAILED', 'NEEDS_ATTENTION'] },
  { componentKey: 'lubrication', name: 'Safety Tune-Up', packageKey: 'tune-up', sortOrder: 0 },
  { componentKey: 'door-balance', name: 'Safety Tune-Up', packageKey: 'tune-up', sortOrder: 0 },
  { componentKey: 'noise-vibration', name: 'Safety Tune-Up', packageKey: 'tune-up', sortOrder: 0 },
  { componentKey: 'tracks', name: 'General Repair Labor', sku: 'LBR-GENERAL', quantity: 1, sortOrder: 0 },
  { componentKey: 'brackets', name: 'General Repair Labor', sku: 'LBR-GENERAL', quantity: 1, sortOrder: 0 },
  { componentKey: 'bottom-fixtures', name: 'General Repair Labor', sku: 'LBR-GENERAL', quantity: 1, sortOrder: 0 },
  { componentKey: 'panels', name: 'General Repair Labor', sku: 'LBR-GENERAL', quantity: 1, sortOrder: 0 },
  { componentKey: 'manual-release', name: 'General Repair Labor', sku: 'LBR-GENERAL', quantity: 1, sortOrder: 0 },
  { componentKey: 'auto-reverse', name: 'Safety Tune-Up', packageKey: 'tune-up', sortOrder: 0 },
]

export const STARTER_CATALOG: Catalog = {
  springs: STARTER_SPRINGS,
  parts: [...STARTER_PARTS, ...STARTER_LABOR],
  packages: STARTER_PACKAGES,
  remedies: STARTER_REMEDIES,
}
