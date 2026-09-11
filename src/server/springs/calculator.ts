import { Prisma, type SpringSystemType, type WindDirection } from '@prisma/client'
import type { TenantDb } from '@/lib/tenancy'

/**
 * Spring Calculator - service boundary.
 *
 * Two very different things live behind the words "spring calculator", and
 * this module keeps them apart on purpose:
 *
 *   1. MATCHING (implemented). Given the measurements a technician takes off
 *      the door, find catalog SKUs with those exact specifications and report
 *      what is physically on the truck and in the warehouse. This is a
 *      database lookup. It involves no engineering judgement and is safe to
 *      ship today.
 *
 *   2. SIZING (deliberately NOT implemented). Converting a door weight, drum
 *      and track radius into a required spring - IPPT, cycle life, conversion
 *      between torsion and extension, high-cycle equivalents. Getting this
 *      wrong puts a technician under a loaded door. There is no placeholder
 *      arithmetic in this file: `SizingEngine` throws until a verified
 *      implementation backed by manufacturer data is supplied and tested.
 *
 * When the real engine arrives it implements `SizingEngine` and is registered
 * with `registerSizingEngine()`. Nothing else in the application changes.
 */

export interface SpringMeasurementInput {
  type?: SpringSystemType
  wireSizeInches: number
  insideDiameterInches: number
  lengthInches: number
  wind?: WindDirection | null
  quantity?: number
  doorWeightLbs?: number | null
  doorHeightInches?: number | null
  drumModel?: string | null
  shaftDiameter?: string | null
  existingCycleRating?: number | null
}

export interface SpringMatchAvailability {
  locationId: string
  locationName: string
  locationKind: string
  quantity: number
  isMine: boolean
}

export interface SpringMatch {
  priceBookItemId: string
  name: string
  sku: string | null
  priceCents: number
  costCents: number
  wireSizeInches: number
  insideDiameterInches: number
  lengthInches: number
  wind: WindDirection | null
  cycleRating: number | null
  colorCode: string | null
  /** Exact size match, or an alternate offered for a different cycle rating. */
  matchQuality: 'exact' | 'cycle-upgrade'
  availability: SpringMatchAvailability[]
  totalOnHand: number
  onMyTruck: number
}

export interface SpringMatchResult {
  query: SpringMeasurementInput
  matches: SpringMatch[]
  /** True when nothing in the catalog carries this size at all. */
  noCatalogEntry: boolean
}

/** Wire sizes are compared to four decimals; a thousandth is a different spring. */
const WIRE_DP = 4
const DIM_DP = 3

function dec(value: number, places: number) {
  return new Prisma.Decimal(value.toFixed(places))
}

function toNum(value: Prisma.Decimal | number | string): number {
  return typeof value === 'number' ? value : Number(value.toString())
}

/**
 * Find catalog springs matching a measurement, annotated with live stock.
 *
 * Matching is exact on wire size, inside diameter and length. Wind is matched
 * when supplied, because a left-hand spring is not a substitute for a
 * right-hand one. Cycle rating is intentionally NOT part of the match: a
 * higher-cycle spring of the same physical size is a legitimate upgrade to
 * offer, so those come back flagged as `cycle-upgrade` rather than hidden.
 */
export async function matchInventorySprings(
  db: TenantDb,
  input: SpringMeasurementInput,
  opts?: { myLocationId?: string | null },
): Promise<SpringMatchResult> {
  const items = await db.priceBookItem.findMany({
    where: {
      isActive: true,
      archivedAt: null,
      springSpec: {
        wireSizeInches: dec(input.wireSizeInches, WIRE_DP),
        insideDiameterInches: dec(input.insideDiameterInches, DIM_DP),
        lengthInches: dec(input.lengthInches, DIM_DP),
        ...(input.wind ? { wind: input.wind } : {}),
        ...(input.type ? { type: input.type } : {}),
      },
    },
    include: {
      springSpec: true,
      stockLevels: { include: { location: true } },
    },
  })

  const existingCycles = input.existingCycleRating ?? null

  const matches: SpringMatch[] = items
    .filter((item) => item.springSpec !== null)
    .map((item) => {
      const spec = item.springSpec!
      const availability: SpringMatchAvailability[] = item.stockLevels
        .filter((level) => level.location.isActive)
        .map((level) => ({
          locationId: level.locationId,
          locationName: level.location.name,
          locationKind: level.location.kind,
          quantity: toNum(level.quantity),
          isMine: Boolean(opts?.myLocationId && level.locationId === opts.myLocationId),
        }))
        .sort((a, b) => Number(b.isMine) - Number(a.isMine) || b.quantity - a.quantity)

      const cycles = spec.cycleRating ?? null
      const isUpgrade =
        existingCycles !== null && cycles !== null && cycles > existingCycles

      return {
        priceBookItemId: item.id,
        name: item.name,
        sku: item.sku,
        priceCents: item.priceCents,
        costCents: item.costCents,
        wireSizeInches: toNum(spec.wireSizeInches),
        insideDiameterInches: toNum(spec.insideDiameterInches),
        lengthInches: toNum(spec.lengthInches),
        wind: spec.wind,
        cycleRating: cycles,
        colorCode: spec.colorCode,
        matchQuality: isUpgrade ? ('cycle-upgrade' as const) : ('exact' as const),
        availability,
        totalOnHand: availability.reduce((sum, a) => sum + a.quantity, 0),
        onMyTruck: availability.filter((a) => a.isMine).reduce((sum, a) => sum + a.quantity, 0),
      }
    })
    .sort((a, b) => {
      // What is on my truck right now, then what is in stock anywhere, then
      // cycle rating. A technician wants the spring they can fit today.
      if (a.onMyTruck !== b.onMyTruck) return b.onMyTruck - a.onMyTruck
      if (a.totalOnHand !== b.totalOnHand) return b.totalOnHand - a.totalOnHand
      return (a.cycleRating ?? 0) - (b.cycleRating ?? 0)
    })

  return { query: input, matches, noCatalogEntry: matches.length === 0 }
}

// ---------------------------------------------------------------------------
// Sizing engine - intentionally unimplemented
// ---------------------------------------------------------------------------

export interface SizingRequest {
  doorWeightLbs: number
  doorHeightInches: number
  drumModel: string
  trackRadiusInches?: number
  shaftDiameter?: string
  targetCycleRating?: number
  springCount?: number
}

export interface SizingResult {
  wireSizeInches: number
  insideDiameterInches: number
  lengthInches: number
  springCount: number
  cycleRating: number
  /** Where the numbers came from: which chart, which manufacturer, which revision. */
  sourceReference: string
}

export interface SizingEngine {
  readonly id: string
  readonly sourceReference: string
  size(request: SizingRequest): Promise<SizingResult>
}

export class SizingNotAvailableError extends Error {
  constructor() {
    super(
      'Spring sizing is not available. Garage Door HQ will not calculate a spring ' +
        'from a door weight until verified manufacturer data has been loaded and ' +
        'tested. Measure the existing spring and use Find Matching Springs instead.',
    )
    this.name = 'SizingNotAvailableError'
  }
}

let registeredEngine: SizingEngine | null = null

/**
 * Register a verified sizing implementation. Left unregistered on purpose:
 * an unverified engine is worse than no engine.
 */
export function registerSizingEngine(engine: SizingEngine) {
  registeredEngine = engine
}

export function sizingAvailable(): boolean {
  return registeredEngine !== null
}

export async function sizeSprings(request: SizingRequest): Promise<SizingResult> {
  if (!registeredEngine) throw new SizingNotAvailableError()
  return registeredEngine.size(request)
}
