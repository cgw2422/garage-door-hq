import type { Decimal } from '@prisma/client/runtime/library'

type Numeric = Decimal | number | string | null | undefined

export function toNumber(value: Numeric): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value.toString())
  return Number.isFinite(n) ? n : null
}

/** .2250 -> ".225"  (trailing zeros dropped, leading zero dropped) */
export function formatWireSize(value: Numeric): string {
  const n = toNumber(value)
  if (n === null) return '—'
  return n.toFixed(4).replace(/0+$/, '').replace(/^0/, '')
}

/** 2.000 -> `2"`, 27.500 -> `27.5"` */
export function formatInches(value: Numeric, opts?: { unit?: boolean }): string {
  const n = toNumber(value)
  if (n === null) return '—'
  const text = Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)))
  return opts?.unit === false ? text : `${text}"`
}

/** The way a technician says it out loud: .225 x 2" x 27" */
export function formatSpringSize(
  wire: Numeric,
  insideDiameter: Numeric,
  length: Numeric,
): string {
  return `${formatWireSize(wire)} x ${formatInches(insideDiameter)} x ${formatInches(length)}`
}

export function formatDoorSize(widthInches: Numeric, heightInches: Numeric): string {
  const w = toNumber(widthInches)
  const h = toNumber(heightInches)
  if (w === null || h === null) return '—'
  const feet = (inches: number) =>
    inches % 12 === 0 ? `${inches / 12}'` : `${Math.floor(inches / 12)}'${inches % 12}"`
  return `${feet(w)} x ${feet(h)}`
}

export function formatWind(wind: 'LEFT_HAND' | 'RIGHT_HAND' | null | undefined): string {
  if (wind === 'LEFT_HAND') return 'Left Hand'
  if (wind === 'RIGHT_HAND') return 'Right Hand'
  return '—'
}

export function formatCycles(cycles: number | null | undefined): string {
  if (!cycles) return '—'
  return `${cycles.toLocaleString('en-US')} cycles`
}
