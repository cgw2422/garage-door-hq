import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import {
  RATE_LIMITS,
  RateLimitError,
  consumeRateLimit,
  enforceRateLimit,
  sweepRateLimits,
} from '@/lib/rate-limit'

/**
 * Rate limiting.
 *
 * The counter lives in Postgres rather than in memory, because a container
 * restart must not hand an attacker a fresh budget and two instances must not
 * each grant the full one. These tests exercise the real table.
 */

const subjects: string[] = []

/** A subject nobody else is counting against. */
function subject(prefix = 'test') {
  const value = `${prefix}-${randomUUID()}`
  subjects.push(value)
  return value
}

afterEach(async () => {
  for (const value of subjects.splice(0)) {
    await prisma.rateLimit.deleteMany({ where: { key: { contains: value } } })
  }
})

describe('the limits themselves', () => {
  it('are tight on the attackable paths', () => {
    // Credential checks and portal token guessing are the two paths an
    // outsider can reach without an account.
    expect(RATE_LIMITS.login.limit).toBeLessThanOrEqual(10)
    expect(RATE_LIMITS.signup.limit).toBeLessThanOrEqual(10)
    expect(RATE_LIMITS.portalToken.limit).toBeLessThanOrEqual(60)
    expect(RATE_LIMITS.passwordResetRequest.limit).toBeLessThanOrEqual(10)

    for (const rule of Object.values(RATE_LIMITS)) {
      expect(rule.limit).toBeGreaterThan(0)
      expect(rule.windowSeconds).toBeGreaterThan(0)
    }
  })
})

describe('counting', () => {
  it('allows exactly the limit and refuses the next attempt', async () => {
    const who = subject('login')
    const { limit } = RATE_LIMITS.login

    for (let attempt = 1; attempt <= limit; attempt += 1) {
      const result = await consumeRateLimit('login', who)
      expect(result.ok).toBe(true)
      expect(result.remaining).toBe(limit - attempt)
    }

    const blocked = await consumeRateLimit('login', who)
    expect(blocked.ok).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('counts each subject separately', async () => {
    const a = subject('login-a')
    const b = subject('login-b')

    for (let i = 0; i < RATE_LIMITS.login.limit; i += 1) {
      await consumeRateLimit('login', a)
    }

    expect((await consumeRateLimit('login', a)).ok).toBe(false)
    // One address being noisy must not lock anybody else out.
    expect((await consumeRateLimit('login', b)).ok).toBe(true)
  })

  it('counts each scope separately', async () => {
    const who = subject('shared')

    for (let i = 0; i < RATE_LIMITS.login.limit; i += 1) {
      await consumeRateLimit('login', who)
    }

    expect((await consumeRateLimit('login', who)).ok).toBe(false)
    expect((await consumeRateLimit('signup', who)).ok).toBe(true)
  })

  it('starts a new budget in the next window', async () => {
    const who = subject('window')
    const { limit, windowSeconds } = RATE_LIMITS.login
    const now = new Date('2026-01-01T00:00:00.000Z')

    for (let i = 0; i < limit; i += 1) {
      await consumeRateLimit('login', who, now)
    }
    expect((await consumeRateLimit('login', who, now)).ok).toBe(false)

    const nextWindow = new Date(now.getTime() + windowSeconds * 1000)
    expect((await consumeRateLimit('login', who, nextWindow)).ok).toBe(true)
  })

  it('keeps counting within a window regardless of where in it the attempt lands', async () => {
    const who = subject('same-window')
    const start = new Date('2026-02-01T00:00:00.000Z')
    const { windowSeconds } = RATE_LIMITS.login

    await consumeRateLimit('login', who, start)
    const later = await consumeRateLimit(
      'login',
      who,
      new Date(start.getTime() + (windowSeconds - 1) * 1000),
    )
    expect(later.remaining).toBe(RATE_LIMITS.login.limit - 2)
  })

  it('survives concurrent attempts without granting extra budget', async () => {
    const who = subject('concurrent')
    const { limit } = RATE_LIMITS.login

    // Every attempt is one statement, so a burst cannot all read a stale count.
    const results = await Promise.all(
      Array.from({ length: limit + 5 }, () => consumeRateLimit('login', who)),
    )

    expect(results.filter((result) => result.ok)).toHaveLength(limit)
  })
})

describe('enforcing', () => {
  it('throws once the budget is gone, with a retry hint', async () => {
    const who = subject('enforce')

    for (let i = 0; i < RATE_LIMITS.invite.limit; i += 1) {
      await enforceRateLimit('invite', who)
    }

    await expect(enforceRateLimit('invite', who)).rejects.toThrow(RateLimitError)

    try {
      await enforceRateLimit('invite', who)
      expect.unreachable('should have refused')
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitError)
      expect((error as RateLimitError).retryAfterSeconds).toBeGreaterThan(0)
      // The message tells a real person when to come back.
      expect((error as RateLimitError).message).toMatch(/try again in/i)
    }
  })
})

describe('housekeeping', () => {
  it('drops expired windows and leaves live ones alone', async () => {
    const stale = subject('stale')
    const live = subject('live')

    await consumeRateLimit('login', stale, new Date('2020-01-01T00:00:00.000Z'))
    await consumeRateLimit('login', live)

    await sweepRateLimits()

    expect(await prisma.rateLimit.count({ where: { key: `login:${stale}` } })).toBe(0)
    expect(await prisma.rateLimit.count({ where: { key: `login:${live}` } })).toBe(1)
  })
})
