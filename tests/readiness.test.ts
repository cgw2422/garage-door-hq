import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_NOT_CONFIGURED,
  authSecretConfigured,
  checkReadiness,
  resetReadinessWarning,
  warnIfAuthUnconfigured,
} from '@/lib/readiness'

/**
 * Whether the deployment is finished, and whether it says so usefully.
 *
 * The failure this guards is specific: with no AUTH_SECRET, Auth.js answers
 * the sign-in callback with `{"message":"There was a problem with the server
 * configuration. Check the server logs for more information."}` — correct,
 * and useless to the person who just deployed. Everything here exists so that
 * sentence is replaced by the name of the variable to set.
 */

const KEYS = ['AUTH_SECRET', 'APP_URL', 'NEXT_PUBLIC_APP_URL', 'AUTH_URL', 'NODE_ENV'] as const
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))

function setEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

afterEach(() => {
  setEnv(original)
  resetReadinessWarning()
  vi.restoreAllMocks()
})

const ok = () => Promise.resolve(1)
const down = () => Promise.reject(new Error('connect ECONNREFUSED'))

describe('the auth secret', () => {
  it('is missing when unset', () => {
    setEnv({ AUTH_SECRET: undefined })
    expect(authSecretConfigured()).toBe(false)
  })

  // .env.example ships AUTH_SECRET="" for the operator to fill in, and an
  // empty string pasted into a deployment fails exactly like an absent one.
  it.each(['', '   '])('is missing when blank (%j)', (value) => {
    setEnv({ AUTH_SECRET: value })
    expect(authSecretConfigured()).toBe(false)
  })

  it('is present when set', () => {
    setEnv({ AUTH_SECRET: 'iIxRCiYqNPk0J9vXn0mYRYb0Mv1YM+Y7Zi0F0mZpJYc=' })
    expect(authSecretConfigured()).toBe(true)
  })

  it('names the variable, and the v4 name it is not, once', () => {
    setEnv({ AUTH_SECRET: undefined })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    warnIfAuthUnconfigured()
    warnIfAuthUnconfigured()

    expect(logged).toHaveBeenCalledTimes(1)
    const line = String(logged.mock.calls[0]?.[0])
    expect(line).toContain('AUTH_SECRET')
    expect(line).toContain('NEXTAUTH_SECRET')
  })

  it('says nothing when it is configured', () => {
    setEnv({ AUTH_SECRET: 'a-real-secret' })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    warnIfAuthUnconfigured()
    expect(logged).not.toHaveBeenCalled()
  })

  it('tells the reader what to do, not what broke', () => {
    expect(AUTH_NOT_CONFIGURED).toContain('AUTH_SECRET')
    expect(AUTH_NOT_CONFIGURED).not.toMatch(/auth\.js|jwt|token|500/i)
  })
})

describe('the readiness report', () => {
  it('is ok when the required three are', async () => {
    setEnv({ AUTH_SECRET: 'a-real-secret', NEXT_PUBLIC_APP_URL: 'https://app.example.com' })
    const report = await checkReadiness(ok, true, true, 'r2')

    expect(report.ok).toBe(true)
    expect(report.required).toEqual({ database: 'ok', authSecret: 'ok', appUrl: 'ok' })
  })

  it('reports an unreachable database without ever throwing', async () => {
    setEnv({ AUTH_SECRET: 'a-real-secret', NEXT_PUBLIC_APP_URL: 'https://app.example.com' })
    const report = await checkReadiness(down, true, true, 'r2')

    expect(report.ok).toBe(false)
    expect(report.required.database).toBe('unreachable')
  })

  it('reports a missing secret', async () => {
    setEnv({ AUTH_SECRET: undefined, NEXT_PUBLIC_APP_URL: 'https://app.example.com' })
    const report = await checkReadiness(ok, true, true, 'r2')

    expect(report.ok).toBe(false)
    expect(report.required.authSecret).toBe('missing')
  })

  it('reports a localhost app URL in production as missing', async () => {
    setEnv({
      NODE_ENV: 'production',
      AUTH_SECRET: 'a-real-secret',
      APP_URL: undefined,
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      AUTH_URL: undefined,
    })
    const report = await checkReadiness(ok, true, true, 'r2')

    expect(report.ok).toBe(false)
    expect(report.required.appUrl).toBe('missing')
  })

  // A trial deployment with no Stripe account and no email provider is a real
  // state the product supports, and says so on screen. It is not "unhealthy".
  it('does not fail on unconfigured integrations', async () => {
    setEnv({ AUTH_SECRET: 'a-real-secret', NEXT_PUBLIC_APP_URL: 'https://app.example.com' })
    const report = await checkReadiness(ok, false, false, 'local')

    expect(report.ok).toBe(true)
    expect(report.optional).toEqual({ storage: 'local', email: 'not configured', stripe: 'not configured' })
  })

  it('never reports a value, only whether one is present', async () => {
    const secret = 'sk_live_not_a_real_key_but_shaped_like_one'
    setEnv({ AUTH_SECRET: secret, NEXT_PUBLIC_APP_URL: 'https://app.example.com' })

    const serialized = JSON.stringify(await checkReadiness(ok, true, true, 'r2'))

    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('app.example.com')
  })
})
