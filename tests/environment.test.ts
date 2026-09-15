import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ProductionSafetyError,
  assertNotProduction,
  assertStripeKeyMatchesEnvironment,
  environment,
  resetEnvironment,
  storageNamespace,
  titleSuffix,
} from '@/lib/environment'
import { addressAllowed, decideOutbound, guardOutbound } from '@/server/email/guard'
import type { EmailDriver, OutboundEmail } from '@/server/email/types'

/**
 * Keeping staging away from real people.
 *
 * Everything here protects against one class of mistake: a deployment holding
 * test data reaching out and touching someone real. Emailing a homeowner about
 * a repair that never happened, charging a card from a test run, wiping a
 * database because a script was pointed at the wrong URL. None of these are
 * exotic attacks — they are ordinary Tuesday mistakes, which is exactly why
 * the product has to refuse them rather than rely on remembering.
 */

const ORIGINAL = { ...process.env }

beforeEach(() => {
  resetEnvironment()
})

afterEach(() => {
  process.env = { ...ORIGINAL }
  resetEnvironment()
})

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetEnvironment()
}

describe('which deployment this is', () => {
  it('reads APP_ENV when it is declared', () => {
    for (const name of ['development', 'staging', 'production'] as const) {
      setEnv({ APP_ENV: name })
      expect(environment().name).toBe(name)
      expect(environment().declared).toBe(true)
    }
  })

  it('is not case- or whitespace-sensitive about it', () => {
    setEnv({ APP_ENV: '  Production  ' })
    expect(environment().name).toBe('production')
    expect(environment().isProduction).toBe(true)
  })

  /**
   * The asymmetry this whole module is built around. A production deployment
   * that forgets the variable holds its email back and somebody notices within
   * the hour. A staging deployment mistaken for production emails real
   * customers, and nothing takes that back.
   */
  it('fails closed: an undeclared deployment is staging, never production', () => {
    setEnv({ APP_ENV: undefined, NODE_ENV: 'production' })
    expect(environment().name).toBe('staging')
    expect(environment().isProduction).toBe(false)
    expect(environment().declared).toBe(false)
    expect(environment().showsEnvironmentBanner).toBe(true)
  })

  it('treats a nonsense value the same as none at all', () => {
    setEnv({ APP_ENV: 'prod', NODE_ENV: 'production' })
    expect(environment().isProduction).toBe(false)
  })

  it('is development when nothing is deployed', () => {
    setEnv({ APP_ENV: undefined, NODE_ENV: 'test' })
    expect(environment().name).toBe('development')
  })
})

describe('telling the two apart at a glance', () => {
  it('badges everything except production', () => {
    setEnv({ APP_ENV: 'production' })
    expect(titleSuffix()).toBe('')
    expect(environment().showsEnvironmentBanner).toBe(false)

    setEnv({ APP_ENV: 'staging' })
    expect(titleSuffix()).toBe(' — STAGING')
    expect(environment().showsEnvironmentBanner).toBe(true)
  })

  it('namespaces stored objects by environment', () => {
    setEnv({ APP_ENV: 'staging' })
    expect(storageNamespace()).toBe('staging')
    setEnv({ APP_ENV: 'production' })
    expect(storageNamespace()).toBe('production')
  })
})

describe('operations that must never run on production', () => {
  it('refuses, and names itself when it does', () => {
    setEnv({ APP_ENV: 'production' })
    expect(() => assertNotProduction('Resetting the database')).toThrow(ProductionSafetyError)
    expect(() => assertNotProduction('Resetting the database')).toThrow(/Resetting the database/)
  })

  it('allows them anywhere else', () => {
    for (const name of ['staging', 'development'] as const) {
      setEnv({ APP_ENV: name })
      expect(() => assertNotProduction('Loading the demo company')).not.toThrow()
    }
  })
})

describe('Stripe keys carry their own mode', () => {
  it('refuses a live key outside production', () => {
    for (const name of ['staging', 'development'] as const) {
      setEnv({ APP_ENV: name })
      expect(() => assertStripeKeyMatchesEnvironment('sk_live_abc123')).toThrow(
        ProductionSafetyError,
      )
      expect(() => assertStripeKeyMatchesEnvironment('rk_live_abc123')).toThrow()
    }
  })

  it('accepts a test key everywhere, including production', () => {
    for (const name of ['staging', 'development', 'production'] as const) {
      setEnv({ APP_ENV: name })
      expect(() => assertStripeKeyMatchesEnvironment('sk_test_abc123')).not.toThrow()
    }
  })

  it('says so loudly when production is not taking real money', () => {
    setEnv({ APP_ENV: 'production' })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    assertStripeKeyMatchesEnvironment('sk_test_abc123')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('TEST key'))
    spy.mockRestore()
  })

  it('has nothing to say when billing is not configured', () => {
    setEnv({ APP_ENV: 'staging' })
    expect(() => assertStripeKeyMatchesEnvironment(null)).not.toThrow()
    expect(() => assertStripeKeyMatchesEnvironment(undefined)).not.toThrow()
  })
})

describe('the outbound email gate', () => {
  it('matches an address, or a whole domain', () => {
    expect(addressAllowed('me@example.com', ['me@example.com'])).toBe(true)
    expect(addressAllowed('ME@Example.com', ['me@example.com'])).toBe(true)
    expect(addressAllowed('anyone@example.com', ['@example.com'])).toBe(true)
    expect(addressAllowed('me@example.com.evil.test', ['@example.com'])).toBe(false)
    expect(addressAllowed('someone@else.com', ['@example.com'])).toBe(false)
    expect(addressAllowed('me@example.com', [])).toBe(false)
  })

  it('sends everything on production, unconditionally', () => {
    expect(
      decideOutbound('homeowner@real.test', {
        isProduction: true,
        redirectTo: null,
        allowlist: [],
      }),
    ).toEqual({ action: 'send' })
  })

  it('blocks everything on an unconfigured staging deployment', () => {
    const decision = decideOutbound('homeowner@real.test', {
      isProduction: false,
      redirectTo: null,
      allowlist: [],
    })
    expect(decision.action).toBe('block')
  })

  it('redirects when a test mailbox is set', () => {
    expect(
      decideOutbound('homeowner@real.test', {
        isProduction: false,
        redirectTo: 'me@mine.test',
        allowlist: ['@real.test'],
      }),
    ).toEqual({ action: 'redirect', to: 'me@mine.test' })
  })

  it('lets through only what the allowlist names', () => {
    const config = { isProduction: false, redirectTo: null, allowlist: ['@mine.test'] }
    expect(decideOutbound('me@mine.test', config).action).toBe('send')
    expect(decideOutbound('homeowner@real.test', config).action).toBe('block')
  })
})

describe('the guarded driver', () => {
  function recordingDriver() {
    const sent: OutboundEmail[] = []
    const driver: EmailDriver = {
      name: 'recording',
      configured: true,
      async send(message) {
        sent.push(message)
        return { accepted: true, providerMessageId: 'id-1' }
      },
    }
    return { driver, sent }
  }

  const message: OutboundEmail = {
    to: { email: 'homeowner@real.test', name: 'A Real Person' },
    from: { email: 'no-reply@garagedoorhq.test', name: 'Precision Garage Door' },
    subject: 'Your estimate is ready',
    html: '<p>hello</p>',
    text: 'hello',
  }

  it('passes production traffic straight through, untouched', async () => {
    setEnv({ APP_ENV: 'production' })
    const { driver, sent } = recordingDriver()
    const result = await guardOutbound(driver).send(message)

    expect(result.accepted).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to.email).toBe('homeowner@real.test')
    expect(sent[0]!.subject).toBe('Your estimate is ready')
  })

  it('sends nothing at all from an unconfigured staging deployment', async () => {
    setEnv({
      APP_ENV: 'staging',
      STAGING_EMAIL_REDIRECT_TO: undefined,
      STAGING_EMAIL_ALLOWLIST: undefined,
    })
    const { driver, sent } = recordingDriver()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await guardOutbound(driver).send(message)

    expect(sent, 'a message reached the provider from staging').toHaveLength(0)
    expect(result.accepted).toBe(false)
    expect(result.retryable).toBe(false)
    expect(result.error).toContain('held back')
    warn.mockRestore()
  })

  it('redirects to the test mailbox and says who it was for', async () => {
    setEnv({ APP_ENV: 'staging', STAGING_EMAIL_REDIRECT_TO: 'me@mine.test' })
    const { driver, sent } = recordingDriver()

    await guardOutbound(driver).send(message)

    expect(sent).toHaveLength(1)
    expect(sent[0]!.to.email).toBe('me@mine.test')
    expect(sent[0]!.subject).toContain('[GARAGE DOOR HQ STAGING]')
    expect(sent[0]!.subject).toContain('homeowner@real.test')
    expect(sent[0]!.text).toContain('homeowner@real.test')
    expect(sent[0]!.html).toContain('homeowner@real.test')
  })

  it('tags an allowlisted message but leaves its recipient alone', async () => {
    setEnv({ APP_ENV: 'staging', STAGING_EMAIL_ALLOWLIST: '@real.test' })
    const { driver, sent } = recordingDriver()

    await guardOutbound(driver).send(message)

    expect(sent[0]!.to.email).toBe('homeowner@real.test')
    expect(sent[0]!.subject).toBe('[GARAGE DOOR HQ STAGING] Your estimate is ready')
  })

  it('does not tag the same message twice on a retry', async () => {
    setEnv({ APP_ENV: 'staging', STAGING_EMAIL_ALLOWLIST: '@real.test' })
    const { driver, sent } = recordingDriver()
    const guarded = guardOutbound(driver)

    await guarded.send(message)
    await guarded.send({ ...message, subject: sent[0]!.subject })

    expect(sent[1]!.subject).toBe('[GARAGE DOOR HQ STAGING] Your estimate is ready')
  })

  it('blocks an address the allowlist does not name, even with other entries', async () => {
    setEnv({ APP_ENV: 'staging', STAGING_EMAIL_ALLOWLIST: 'me@mine.test, @team.test' })
    const { driver, sent } = recordingDriver()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await guardOutbound(driver).send(message)
    await guardOutbound(driver).send({ ...message, to: { email: 'colleague@team.test' } })

    expect(sent.map((entry) => entry.to.email)).toEqual(['colleague@team.test'])
    warn.mockRestore()
  })
})
