import { afterEach, describe, expect, it } from 'vitest'
import { AppUrlError, appBaseUrl, appBaseUrlUnchecked } from '@/lib/app-url'
import { userMessage } from '@/lib/errors'

/**
 * The address the product thinks it lives at.
 *
 * This is the variable most likely to be wrong on a first deploy, and its
 * failure is silent: nothing crashes, a homeowner simply receives an estimate
 * link pointing at `localhost:3000`. So the production paths refuse rather
 * than guess, and these tests pin that behaviour down.
 */

const KEYS = ['NEXT_PUBLIC_APP_URL', 'AUTH_URL', 'NODE_ENV'] as const
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))

function setEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

afterEach(() => setEnv(original))

describe('in development', () => {
  it('falls back to localhost when nothing is configured', () => {
    setEnv({ NODE_ENV: 'development', NEXT_PUBLIC_APP_URL: undefined, AUTH_URL: undefined })
    expect(appBaseUrl()).toBe('http://localhost:3000')
  })

  it('still prefers a configured value', () => {
    setEnv({ NODE_ENV: 'development', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3210' })
    expect(appBaseUrl()).toBe('http://127.0.0.1:3210')
  })
})

describe('in production', () => {
  it('uses the configured origin, without a trailing slash', () => {
    setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://app.example.com/' })
    expect(appBaseUrl()).toBe('https://app.example.com')
  })

  it('falls back to AUTH_URL when the public variable is unset', () => {
    setEnv({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: undefined,
      AUTH_URL: 'https://app.example.com',
    })
    expect(appBaseUrl()).toBe('https://app.example.com')
  })

  it('refuses to build a link when nothing is configured', () => {
    setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: undefined, AUTH_URL: undefined })
    expect(() => appBaseUrl()).toThrow(AppUrlError)
  })

  // The specific trap: .env.example ships localhost values, and a first
  // deploy is often a copy of that file.
  it.each([
    'http://localhost:3000',
    'https://localhost',
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
    'http://0.0.0.0:3000',
  ])('refuses %s', (value) => {
    setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: value })
    expect(() => appBaseUrl()).toThrow(AppUrlError)
  })

  it('does not mistake a real host that merely contains "localhost"', () => {
    setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://localhost.example.com' })
    expect(appBaseUrl()).toBe('https://localhost.example.com')
  })

  it('names the variable to set, in words an owner can act on', () => {
    setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })
    let thrown: unknown = null
    try {
      appBaseUrl()
    } catch (error) {
      thrown = error
    }
    const message = userMessage(thrown, 'test')
    expect(message).toContain('NEXT_PUBLIC_APP_URL')
    expect(message).not.toBe('Something went wrong. Try that again.')
  })
})

describe('the unchecked form', () => {
  it('never throws, because its callers only display the value', () => {
    setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: undefined, AUTH_URL: undefined })
    expect(appBaseUrlUnchecked()).toBe('http://localhost:3000')
  })
})
