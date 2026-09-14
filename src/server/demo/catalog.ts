import {
  STARTER_PARTS,
  STARTER_SPRINGS,
  type Catalog,
  type StarterPackage,
  type StarterPart,
  type StarterRemedy,
} from '@/server/organizations/starter-catalog'

/**
 * The demo company prices flat rate.
 *
 * One number per job, quoted at the door and not itemized: a double spring
 * change is $499 whether it takes forty minutes or ninety, and the shop's
 * $80 of spring is its own business. That is how most residential garage door
 * companies actually sell, and it is a different catalog shape from the
 * parts-and-hourly-labor starter a new signup gets — so the demo carries its
 * own, built from the same pieces.
 *
 * Prices and costs below are a real operator's, used verbatim.
 *
 * Two consequences worth understanding before changing anything here:
 *
 * - The services are **not taxable**, so the total on an estimate is the
 *   number on the menu. A flat rate that grows by 7.25% at the bottom of the
 *   page is not a flat rate. Parts sold on their own stay taxable, which is
 *   why the commercial invoice in the demo still shows tax.
 * - The services are **not stocked**, but the parts they consume are. A
 *   $129 roller swap still takes ten rollers off the truck, so the ledger,
 *   the restock list and the spring matching all keep working — and the gap
 *   between the $129 billed and the cost of what left the van is the margin
 *   the "My Cost" column exists to show.
 */
export const DEMO_SERVICES: StarterPart[] = [
  { sku: 'FR-ROLLER-TUNE', name: 'Roller Swap + Tuneup', category: 'ROLLERS', priceCents: 12900, costCents: 2500, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'FR-CABLE-RESET', name: 'Cable Reset', category: 'CABLES', priceCents: 15900, costCents: 0, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'FR-SPRING-1', name: 'Single Spring Change', category: 'SPRINGS', priceCents: 34900, costCents: 3700, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'FR-SPRING-2', name: 'Double Spring Change', category: 'SPRINGS', priceCents: 49900, costCents: 8000, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'FR-OPENER-CHAIN', name: 'Chain Opener', category: 'OPENERS', priceCents: 49900, costCents: 20000, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'FR-OPENER-BELT', name: 'Belt Opener', category: 'OPENERS', priceCents: 55000, costCents: 24900, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'FR-OPENER-CAMERA', name: 'Camera Belt Opener', category: 'OPENERS', priceCents: 74900, costCents: 33000, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'FR-SENSORS', name: '2 Sensors', category: 'PHOTO_EYES', priceCents: 12900, costCents: 2000, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'FR-SPRING-WD', name: 'WD Torsion Spring', category: 'SPRINGS', priceCents: 54900, costCents: 10000, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'FR-CABLES', name: 'Cables', category: 'CABLES', priceCents: 7900, costCents: 1500, unit: 'ea', taxable: false, trackInventory: false },
  { sku: 'FR-OPENER-CUSTOMER', name: 'Customer provided Opener', category: 'OPENERS', priceCents: 30000, costCents: 0, unit: 'ea', taxable: false, trackInventory: false },
]

/**
 * Stock, minus anything the menu above sells as a finished job.
 *
 * Openers and sensor pairs come out: a truck carrying both a "$549 belt
 * opener" part and a "$550 Belt Opener" job reads as two prices for one
 * thing. Rollers, cables, seals and the rest stay, because they are what the
 * flat-rate jobs consume.
 */
const SOLD_AS_A_SERVICE = new Set(['OPN-BELT-STD', 'OPN-WALL-MNT', 'EYE-PAIR'])

export const DEMO_PARTS: StarterPart[] = STARTER_PARTS.filter(
  (part) => !SOLD_AS_A_SERVICE.has(part.sku),
)

/**
 * Good, better, best off one broken spring — the conversation this product
 * exists to make easy, priced from the menu rather than assembled by hand.
 */
export const DEMO_PACKAGES: StarterPackage[] = [
  {
    key: 'spring-single',
    name: 'Single Spring Change',
    description: 'Replace the broken spring, balance the door and test the safety reverse.',
    defaultTier: 'GOOD',
    isRecommendedDefault: false,
    sortOrder: 0,
    lines: [{ sku: 'FR-SPRING-1', quantity: 1 }],
  },
  {
    key: 'spring-double',
    name: 'Double Spring Change',
    description:
      'Replace both springs as a matched pair. The second is the same age as the one that ' +
      'broke, so doing one usually means a second visit inside a year.',
    defaultTier: 'BETTER',
    isRecommendedDefault: true,
    sortOrder: 1,
    lines: [{ sku: 'FR-SPRING-2', quantity: 1 }],
  },
  {
    key: 'spring-double-rollers',
    name: 'Double Spring Change + Roller Swap & Tune-Up',
    description: 'Both springs, new rollers and a full tune-up while the door is already apart.',
    defaultTier: 'BEST',
    isRecommendedDefault: false,
    sortOrder: 2,
    lines: [
      { sku: 'FR-SPRING-2', quantity: 1 },
      { sku: 'FR-ROLLER-TUNE', quantity: 1 },
    ],
  },
  {
    key: 'opener-chain',
    name: 'Chain Opener',
    description: 'New chain drive opener, installed, with the old unit hauled away.',
    defaultTier: 'GOOD',
    isRecommendedDefault: false,
    sortOrder: 3,
    lines: [{ sku: 'FR-OPENER-CHAIN', quantity: 1 }],
  },
  {
    key: 'opener-belt',
    name: 'Belt Opener',
    description: 'Belt drive — quiet enough for a bedroom over the garage.',
    defaultTier: 'BETTER',
    isRecommendedDefault: true,
    sortOrder: 4,
    lines: [{ sku: 'FR-OPENER-BELT', quantity: 1 }],
  },
  {
    key: 'opener-camera',
    name: 'Camera Belt Opener',
    description: 'Belt drive with a built-in camera and phone control.',
    defaultTier: 'BEST',
    isRecommendedDefault: false,
    sortOrder: 5,
    lines: [{ sku: 'FR-OPENER-CAMERA', quantity: 1 }],
  },
]

/**
 * Inspection finding to sellable line.
 *
 * A `FAILED` spring offers all three spring options, so the technician
 * presents good, better and best without building anything in a driveway.
 * Components this menu has no price for — a bent track, a cracked panel —
 * deliberately offer nothing rather than a guess; the technician adds those
 * by hand, which is the honest behaviour for a flat-rate shop.
 */
export const DEMO_REMEDIES: StarterRemedy[] = [
  { componentKey: 'springs', name: 'Single Spring Change', packageKey: 'spring-single', sortOrder: 0 },
  { componentKey: 'springs', name: 'Double Spring Change', packageKey: 'spring-double', sortOrder: 1 },
  { componentKey: 'springs', name: 'Double Spring Change + Roller Swap & Tune-Up', packageKey: 'spring-double-rollers', sortOrder: 2 },
  { componentKey: 'springs', name: 'WD Torsion Spring', sku: 'FR-SPRING-WD', quantity: 1, sortOrder: 3 },
  { componentKey: 'rollers', name: 'Roller Swap + Tuneup', sku: 'FR-ROLLER-TUNE', quantity: 1, sortOrder: 0 },
  { componentKey: 'cables', name: 'Cables', sku: 'FR-CABLES', quantity: 1, sortOrder: 0 },
  { componentKey: 'cables', name: 'Cable Reset', sku: 'FR-CABLE-RESET', quantity: 1, sortOrder: 1 },
  { componentKey: 'photo-eyes', name: '2 Sensors', sku: 'FR-SENSORS', quantity: 1, sortOrder: 0 },
  { componentKey: 'opener', name: 'Chain Opener', packageKey: 'opener-chain', sortOrder: 0, forStatuses: ['FAIL', 'NEEDS_ATTENTION'] },
  { componentKey: 'opener', name: 'Belt Opener', packageKey: 'opener-belt', sortOrder: 1, forStatuses: ['FAIL', 'NEEDS_ATTENTION'] },
  { componentKey: 'opener', name: 'Camera Belt Opener', packageKey: 'opener-camera', sortOrder: 2, forStatuses: ['FAIL', 'NEEDS_ATTENTION'] },
  { componentKey: 'opener', name: 'Customer provided Opener', sku: 'FR-OPENER-CUSTOMER', quantity: 1, sortOrder: 3, forStatuses: ['FAIL', 'NEEDS_ATTENTION'] },
  { componentKey: 'lubrication', name: 'Roller Swap + Tuneup', sku: 'FR-ROLLER-TUNE', quantity: 1, sortOrder: 0 },
  { componentKey: 'door-balance', name: 'Roller Swap + Tuneup', sku: 'FR-ROLLER-TUNE', quantity: 1, sortOrder: 0 },
  { componentKey: 'noise-vibration', name: 'Roller Swap + Tuneup', sku: 'FR-ROLLER-TUNE', quantity: 1, sortOrder: 0 },
  { componentKey: 'auto-reverse', name: '2 Sensors', sku: 'FR-SENSORS', quantity: 1, sortOrder: 0 },
  // Parts with no flat rate of their own are still one tap from an estimate.
  { componentKey: 'drums', name: 'Replace Cable Drum', sku: 'DRM-400-8', quantity: 2, sortOrder: 0 },
  { componentKey: 'bearings', name: 'Replace End Bearing Plates', sku: 'BRG-625', quantity: 2, sortOrder: 0 },
  { componentKey: 'bearings', name: 'Replace Center Bearing', sku: 'BRG-CTR', quantity: 1, sortOrder: 1 },
  { componentKey: 'shaft', name: 'Replace Torsion Shaft', sku: 'SHF-1IN-96', quantity: 1, sortOrder: 0 },
  { componentKey: 'hinges', name: 'Replace Hinges', sku: 'HNG-NO2', quantity: 4, sortOrder: 0 },
  { componentKey: 'bottom-seal', name: 'Bottom Seal Replacement', sku: 'SEAL-BTM-16', quantity: 1, sortOrder: 0 },
  { componentKey: 'weather-stripping', name: 'Perimeter Weather Stripping', sku: 'SEAL-JMB-KIT', quantity: 1, sortOrder: 0 },
  { componentKey: 'wall-control', name: 'Replace Wall Control', sku: 'WLC-STD', quantity: 1, sortOrder: 0 },
  { componentKey: 'remotes', name: 'Add Remote Control', sku: 'RMT-STD', quantity: 1, sortOrder: 0 },
  { componentKey: 'keypad', name: 'Replace Keypad', sku: 'KPD-STD', quantity: 1, sortOrder: 0 },
]

export const DEMO_CATALOG: Catalog = {
  springs: STARTER_SPRINGS,
  parts: [...DEMO_SERVICES, ...DEMO_PARTS],
  packages: DEMO_PACKAGES,
  remedies: DEMO_REMEDIES,
}

/** Price and cost by SKU, so the seeded documents cannot drift from the menu. */
export const DEMO_PRICE = Object.fromEntries(
  DEMO_SERVICES.map((service) => [
    service.sku,
    { name: service.name, priceCents: service.priceCents, costCents: service.costCents },
  ]),
) as Record<string, { name: string; priceCents: number; costCents: number }>
