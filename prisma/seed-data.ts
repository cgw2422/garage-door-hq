/**
 * Catalog and job-type data used by the seed. Kept separate so the seed script
 * reads as a story about one company rather than a wall of literals.
 */

export const JOB_TYPES = [
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
]

type SpringRow = {
  sku: string
  name: string
  wire: number
  id: number
  length: number
  wind: 'LEFT_HAND' | 'RIGHT_HAND'
  cycles: number
  colorCode: string
  costCents: number
  priceCents: number
}

/**
 * Real torsion spring sizes a residential shop actually stocks. Colour codes
 * follow the common wire-size convention used on painted springs.
 */
export const TORSION_SPRINGS: SpringRow[] = [
  { sku: 'TS-2250-200-270-L', name: 'Torsion Spring .225 x 2" x 27" LH', wire: 0.225, id: 2.0, length: 27, wind: 'LEFT_HAND', cycles: 10000, colorCode: 'Red', costCents: 2850, priceCents: 8900 },
  { sku: 'TS-2250-200-270-R', name: 'Torsion Spring .225 x 2" x 27" RH', wire: 0.225, id: 2.0, length: 27, wind: 'RIGHT_HAND', cycles: 10000, colorCode: 'Red', costCents: 2850, priceCents: 8900 },
  { sku: 'TS-2250-200-270-L25', name: 'Torsion Spring .225 x 2" x 27" LH · 25K', wire: 0.225, id: 2.0, length: 27, wind: 'LEFT_HAND', cycles: 25000, colorCode: 'Red', costCents: 4200, priceCents: 13900 },
  { sku: 'TS-2250-200-270-R25', name: 'Torsion Spring .225 x 2" x 27" RH · 25K', wire: 0.225, id: 2.0, length: 27, wind: 'RIGHT_HAND', cycles: 25000, colorCode: 'Red', costCents: 4200, priceCents: 13900 },
  { sku: 'TS-2500-200-320-L', name: 'Torsion Spring .250 x 2" x 32" LH', wire: 0.25, id: 2.0, length: 32, wind: 'LEFT_HAND', cycles: 10000, colorCode: 'Gold', costCents: 3450, priceCents: 9900 },
  { sku: 'TS-2500-200-320-R', name: 'Torsion Spring .250 x 2" x 32" RH', wire: 0.25, id: 2.0, length: 32, wind: 'RIGHT_HAND', cycles: 10000, colorCode: 'Gold', costCents: 3450, priceCents: 9900 },
  { sku: 'TS-2070-175-240-L', name: 'Torsion Spring .207 x 1.75" x 24" LH', wire: 0.207, id: 1.75, length: 24, wind: 'LEFT_HAND', cycles: 10000, colorCode: 'Yellow', costCents: 2400, priceCents: 7900 },
  { sku: 'TS-2070-175-240-R', name: 'Torsion Spring .207 x 1.75" x 24" RH', wire: 0.207, id: 1.75, length: 24, wind: 'RIGHT_HAND', cycles: 10000, colorCode: 'Yellow', costCents: 2400, priceCents: 7900 },
  { sku: 'TS-2430-200-290-L', name: 'Torsion Spring .243 x 2" x 29" LH', wire: 0.243, id: 2.0, length: 29, wind: 'LEFT_HAND', cycles: 10000, colorCode: 'Brown', costCents: 3150, priceCents: 9500 },
  { sku: 'TS-2430-200-290-R', name: 'Torsion Spring .243 x 2" x 29" RH', wire: 0.243, id: 2.0, length: 29, wind: 'RIGHT_HAND', cycles: 10000, colorCode: 'Brown', costCents: 3150, priceCents: 9500 },
]

export const EXTENSION_SPRINGS: SpringRow[] = [
  { sku: 'ES-140-250-L', name: 'Extension Spring 140 lb · 25"', wire: 0.177, id: 1.0, length: 25, wind: 'LEFT_HAND', cycles: 10000, colorCode: 'Yellow', costCents: 1450, priceCents: 4900 },
  { sku: 'ES-160-250-R', name: 'Extension Spring 160 lb · 25"', wire: 0.192, id: 1.0, length: 25, wind: 'RIGHT_HAND', cycles: 10000, colorCode: 'Green', costCents: 1550, priceCents: 4900 },
]

export const PARTS = [
  { sku: 'RLR-NYL-13', name: '13-Ball Nylon Roller', category: 'ROLLERS', costCents: 320, priceCents: 1200, unit: 'ea' },
  { sku: 'RLR-STL-10', name: '10-Ball Steel Roller', category: 'ROLLERS', costCents: 180, priceCents: 700, unit: 'ea' },
  { sku: 'CBL-7FT-SET', name: 'Lift Cable Set · 7 ft Door', category: 'CABLES', costCents: 900, priceCents: 3400, unit: 'set' },
  { sku: 'CBL-8FT-SET', name: 'Lift Cable Set · 8 ft Door', category: 'CABLES', costCents: 1050, priceCents: 3800, unit: 'set' },
  { sku: 'DRM-400-8', name: 'Cable Drum 400-8', category: 'DRUMS', costCents: 1250, priceCents: 4200, unit: 'ea' },
  { sku: 'BRG-625', name: 'End Bearing Plate 6252', category: 'BEARINGS', costCents: 650, priceCents: 2400, unit: 'ea' },
  { sku: 'BRG-CTR', name: 'Center Bearing Bracket', category: 'BEARINGS', costCents: 780, priceCents: 2900, unit: 'ea' },
  { sku: 'SHF-1IN-96', name: '1" Torsion Shaft · 96"', category: 'SHAFTS', costCents: 2200, priceCents: 6900, unit: 'ea' },
  { sku: 'HNG-NO2', name: 'Galvanized Hinge #2', category: 'HINGES', costCents: 210, priceCents: 900, unit: 'ea' },
  { sku: 'HNG-NO3', name: 'Galvanized Hinge #3', category: 'HINGES', costCents: 210, priceCents: 900, unit: 'ea' },
  { sku: 'OPN-LM-87504', name: 'LiftMaster 87504-267 Belt Drive Opener', category: 'OPENERS', costCents: 24500, priceCents: 54900, unit: 'ea' },
  { sku: 'OPN-LM-8500W', name: 'LiftMaster 8500W Wall Mount Opener', category: 'OPENERS', costCents: 38000, priceCents: 79900, unit: 'ea' },
  { sku: 'RMT-893MAX', name: 'LiftMaster 893MAX Remote', category: 'REMOTES', costCents: 1800, priceCents: 4900, unit: 'ea' },
  { sku: 'KPD-877MAX', name: 'LiftMaster 877MAX Keypad', category: 'KEYPADS', costCents: 3400, priceCents: 8900, unit: 'ea' },
  { sku: 'EYE-041A', name: 'Safety Sensor Pair', category: 'PHOTO_EYES', costCents: 2600, priceCents: 7900, unit: 'pair' },
  { sku: 'WLC-889LM', name: 'LiftMaster 889LM Wall Control', category: 'WALL_CONTROLS', costCents: 3900, priceCents: 9900, unit: 'ea' },
  { sku: 'SEAL-BTM-16', name: 'Bottom Seal · 16 ft T-Style', category: 'WEATHER_SEAL', costCents: 1400, priceCents: 4900, unit: 'ea' },
  { sku: 'SEAL-JMB-KIT', name: 'Perimeter Weather Stripping Kit', category: 'WEATHER_SEAL', costCents: 2100, priceCents: 6900, unit: 'kit' },
] as const

export const LABOR = [
  { sku: 'SVC-CALL', name: 'Service Call', category: 'SERVICE_CALL', costCents: 0, priceCents: 8900, taxable: false },
  { sku: 'LBR-SPRING', name: 'Spring Replacement Labor', category: 'LABOR', costCents: 0, priceCents: 14900, taxable: false },
  { sku: 'LBR-TUNEUP', name: 'Full Safety Tune-Up & Lubrication', category: 'LABOR', costCents: 0, priceCents: 8900, taxable: false },
  { sku: 'LBR-OPENER', name: 'Opener Installation Labor', category: 'LABOR', costCents: 0, priceCents: 17900, taxable: false },
  { sku: 'LBR-CABLE', name: 'Cable Repair Labor', category: 'LABOR', costCents: 0, priceCents: 9900, taxable: false },
] as const
