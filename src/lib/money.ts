/**
 * Money is integer cents everywhere in this codebase. These helpers are the
 * only place a cent value becomes a string, and the only place a typed dollar
 * amount becomes cents.
 */

export function formatCents(cents: number, opts?: { currency?: string; showCents?: boolean }) {
  const currency = opts?.currency ?? 'USD'
  const showCents = opts?.showCents ?? true
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(cents / 100)
}

/** Compact form for dashboard tiles: $1,247 rather than $1,247.00. */
export function formatCentsShort(cents: number, currency = 'USD') {
  return formatCents(cents, { currency, showCents: cents % 100 !== 0 })
}

export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

/** Tax rates are stored in basis points so percentages stay exact. */
export function taxCentsFor(taxableCents: number, taxRateBps: number): number {
  return Math.round((taxableCents * taxRateBps) / 10_000)
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`
}
