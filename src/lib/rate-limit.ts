import { headers } from 'next/headers'
import { prisma } from './db'

/**
 * Fixed-window rate limiting, backed by Postgres.
 *
 * In-memory counters are useless here: Railway restarts containers and may run
 * more than one, and an attacker only needs the limit to reset. A row per
 * (key, window) is cheap, survives restarts, and is shared across instances.
 *
 * Fixed windows allow a burst across a boundary — up to 2× the limit in a short
 * span. That is an accepted trade for something this simple; the limits below
 * are set low enough that the burst is still not useful to an attacker.
 */

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number
  windowSeconds: number
}

export const RATE_LIMITS = {
  /** Credential checks are the expensive, attackable path. */
  login: { limit: 10, windowSeconds: 300 },
  signup: { limit: 5, windowSeconds: 3600 },
  passwordResetRequest: { limit: 5, windowSeconds: 3600 },
  passwordResetConfirm: { limit: 10, windowSeconds: 3600 },
  /**
   * Changing your own password, which requires the current one — so this is
   * about an unattended signed-in device being used to guess it, not about a
   * stranger on the internet. Room to fat-finger it, not to grind.
   */
  passwordChange: { limit: 10, windowSeconds: 900 },
  /** A customer guessing portal tokens. */
  portalToken: { limit: 30, windowSeconds: 600 },
  /** Anything that spends money, stock, or someone else's trust. */
  sensitiveMutation: { limit: 60, windowSeconds: 60 },
  upload: { limit: 120, windowSeconds: 300 },
  /**
   * Guessing a technician's password to get out of Presentation Mode, on a
   * device that has been handed over. Tight, because a legitimate technician
   * types theirs once and gets it right.
   */
  presentationExit: { limit: 8, windowSeconds: 600 },
  invite: { limit: 20, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>

export type RateLimitScope = keyof typeof RATE_LIMITS

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super(
      `Too many attempts. Try again in ${
        retryAfterSeconds < 90
          ? `${retryAfterSeconds} seconds`
          : `${Math.ceil(retryAfterSeconds / 60)} minutes`
      }.`,
    )
    this.name = 'RateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSeconds: number
}

function windowStartFor(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000
  return new Date(Math.floor(now.getTime() / ms) * ms)
}

/**
 * Count one attempt against `scope:subject`. Returns whether it is allowed
 * rather than throwing, so callers can decide between a message and a refusal.
 */
export async function consumeRateLimit(
  scope: RateLimitScope,
  subject: string,
  now = new Date(),
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[scope]
  const windowStart = windowStartFor(now, rule.windowSeconds)
  const expiresAt = new Date(windowStart.getTime() + rule.windowSeconds * 1000)
  const key = `${scope}:${subject}`

  // One statement, so concurrent requests cannot both read a stale count.
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count", "expiresAt")
    VALUES (${key}, ${windowStart}, 1, ${expiresAt})
    ON CONFLICT ("key", "windowStart")
    DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"
  `

  const count = rows[0]?.count ?? 1
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
  )

  return {
    ok: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds,
  }
}

/** Same check, but refuses outright. */
export async function enforceRateLimit(scope: RateLimitScope, subject: string) {
  const result = await consumeRateLimit(scope, subject)
  if (!result.ok) throw new RateLimitError(result.retryAfterSeconds)
  return result
}

/**
 * Best-effort client address.
 *
 * Trusted only because Railway terminates TLS and sets these; a spoofed header
 * lets someone rate-limit themselves differently, which is why identity-based
 * subjects (email, user id) are used alongside it wherever one exists.
 */
export async function clientAddress(): Promise<string> {
  const requestHeaders = await headers()
  const forwarded = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || requestHeaders.get('x-real-ip') || 'unknown'
}

/** Drop expired windows. Called opportunistically; safe to run any time. */
export async function sweepRateLimits(now = new Date()) {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { expiresAt: { lt: now } },
  })
  return count
}
