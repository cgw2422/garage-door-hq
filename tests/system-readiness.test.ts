import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { systemReadiness } from '@/server/platform/readiness'
import { resetEnvironment } from '@/lib/environment'
import { resetEmail } from '@/server/email'
import { resetStripe } from '@/server/billing/stripe'
import { resetStorage } from '@/server/storage'

/**
 * The page that answers "is this thing actually plugged in?".
 *
 * Two properties. It has to be *right*, because an operator will trust a green
 * light and stop looking. And it has to be *safe*, because it is a screen that
 * lists every credential this product holds, and the difference between
 * "STRIPE_SECRET_KEY is set" and "STRIPE_SECRET_KEY is sk_live_51H…" is the
 * difference between a status page and an incident.
 *
 * The second is what most of this file is about. Values are planted in the
 * environment and the whole response is searched for them.
 */

const ORIGINAL = { ...process.env }

/**
 * Fake credentials, assembled rather than written out.
 *
 * They have to carry each provider's real prefix, because that is what the
 * code under test reads — `sk_live_` is how a live Stripe key is recognised.
 * A literal in the source would then be indistinguishable from a real leak to
 * every scanner that looks at this repository, including GitHub's push
 * protection and `scripts/scan-secrets.mjs`. Building them from parts keeps the
 * shape and keeps the noise out.
 */
const prefix = (...parts: string[]) => parts.join('_') + '_'
const LIVE_KEY = `${prefix('sk', 'live')}STRIPESECRETVALUE123456789`
const TEST_KEY = `${prefix('sk', 'test')}TESTKEYVALUE123456789`
const WEBHOOK = (label: string) => `${['whsec', ''].join('_')}${label}VALUE123456789`

/** Distinctive enough that a substring search cannot miss one. */
const SECRETS = {
  DATABASE_URL: `${'postgresql'}://someone:SUPERSECRETPASSWORD@db.internal:5432/gdhq`,
  AUTH_SECRET: 'AUTHSECRETVALUE0000000000000000000',
  STRIPE_SECRET_KEY: LIVE_KEY,
  STRIPE_WEBHOOK_SECRET: WEBHOOK('WEBHOOKSECRET'),
  STRIPE_CONNECT_WEBHOOK_SECRET: WEBHOOK('CONNECTSECRET'),
  STRIPE_PRICE_ID_STANDARD: 'price_PRICEIDVALUE123456',
  R2_ACCOUNT_ID: 'R2ACCOUNTIDVALUE',
  R2_ACCESS_KEY_ID: 'R2ACCESSKEYIDVALUE',
  R2_SECRET_ACCESS_KEY: 'R2SECRETACCESSKEYVALUE',
  R2_BUCKET: 'gdhq-production-bucket-name',
  RESEND_API_KEY: `${['re', ''].join('_')}RESENDAPIKEYVALUE123456789`,
  APP_URL: 'https://app.garagedoorhq.example',
  STAGING_EMAIL_REDIRECT_TO: 'operator@garagedoorhq.example',
}

function reset() {
  resetEnvironment()
  resetEmail()
  resetStripe()
  resetStorage()
}

beforeEach(reset)

afterEach(() => {
  process.env = { ...ORIGINAL }
  reset()
})

function configureEverything(appEnv: string) {
  process.env = { ...ORIGINAL, ...SECRETS, APP_ENV: appEnv, STORAGE_DRIVER: 'r2' }
  reset()
}

describe('a fully configured production deployment', () => {
  it('reports every service ready', async () => {
    configureEverything('production')
    const readiness = await systemReadiness()

    expect(readiness.environment.name).toBe('production')
    expect(readiness.environment.declared).toBe(true)

    const byLabel = new Map(readiness.checks.map((check) => [check.label, check]))
    expect(byLabel.get('Database')?.health).toBe('ok')
    expect(byLabel.get('Sign-in secret')?.health).toBe('ok')
    expect(byLabel.get('Object storage (Cloudflare R2)')?.health).toBe('ok')
    expect(byLabel.get('Email provider')?.health).toBe('ok')
    expect(byLabel.get('Stripe Billing')?.health).toBe('ok')
    expect(byLabel.get('Stripe webhook')?.health).toBe('ok')
    expect(byLabel.get('Stripe Connect (customer payments)')?.health).toBe('ok')
  })

  /**
   * The check this page exists to survive. Every secret the deployment holds
   * is planted above; none of them may appear anywhere in what it returns.
   */
  it('leaks none of the values it is reporting on', async () => {
    configureEverything('production')
    const serialized = JSON.stringify(await systemReadiness())

    for (const [name, value] of Object.entries(SECRETS)) {
      expect(serialized, `${name}'s value reached the page`).not.toContain(value)
    }

    // Not even a fragment of one.
    for (const fragment of [
      'SUPERSECRETPASSWORD',
      LIVE_KEY.slice(0, 16),
      WEBHOOK('').slice(0, 6),
      'R2SECRET',
      'RESENDAPIKEY',
      'SUPERSECRET',
    ]) {
      expect(serialized, `"${fragment}" reached the page`).not.toContain(fragment)
    }
  })

  it('names the variables to set without ever reading them', async () => {
    process.env = { ...ORIGINAL, APP_ENV: 'production' }
    delete process.env.STRIPE_SECRET_KEY
    reset()

    const readiness = await systemReadiness()
    const billing = readiness.checks.find((check) => check.label === 'Stripe Billing')

    // The name is what an operator needs. The value is what they are going to
    // go and paste into Railway, which is not this page's business.
    expect(billing?.variables).toContain('STRIPE_SECRET_KEY')
    expect(billing?.health).toBe('wrong')
    expect(billing?.detail).toMatch(/not connected/i)
  })
})

describe('a production deployment that is not finished', () => {
  it('says so, rather than reporting ready because it boots', async () => {
    process.env = { ...ORIGINAL, APP_ENV: 'production' }
    for (const name of [
      'STRIPE_SECRET_KEY',
      'RESEND_API_KEY',
      'POSTMARK_SERVER_TOKEN',
      'R2_ACCOUNT_ID',
    ]) {
      delete process.env[name]
    }
    process.env.STORAGE_DRIVER = 'local'
    reset()

    const readiness = await systemReadiness()
    expect(readiness.ready).toBe(false)

    const byLabel = new Map(readiness.checks.map((check) => [check.label, check]))
    // Local disk on production is not "fine, it works" — photos vanish on the
    // next deploy.
    expect(byLabel.get('Object storage (Cloudflare R2)')?.health).toBe('wrong')
    expect(byLabel.get('Email provider')?.health).toBe('wrong')
    expect(byLabel.get('Stripe Billing')?.health).toBe('wrong')
  })

  it('flags a Stripe key whose mode does not match the environment', async () => {
    // A live key on staging is the expensive mistake, and reading the config
    // refuses it outright. This page has to report that rather than crash on
    // the fault it exists to surface.
    configureEverything('staging')
    const readiness = await systemReadiness()
    const billing = readiness.checks.find((check) => check.label === 'Stripe Billing')
    expect(billing?.health).toBe('wrong')
    expect(billing?.detail).toMatch(/live/i)
    expect(billing?.detail).not.toContain(LIVE_KEY)

    process.env = { ...ORIGINAL, ...SECRETS, APP_ENV: 'production' }
    process.env.STRIPE_SECRET_KEY = TEST_KEY
    reset()
    const inTest = await systemReadiness()
    const testBilling = inTest.checks.find((check) => check.label === 'Stripe Billing')
    expect(testBilling?.health).toBe('wrong')
    expect(testBilling?.detail).toMatch(/TEST mode/)
  })

  it('shouts when APP_ENV was inferred rather than declared', async () => {
    process.env = { ...ORIGINAL, NODE_ENV: 'production' }
    delete process.env.APP_ENV
    reset()

    const readiness = await systemReadiness()
    expect(readiness.environment.declared).toBe(false)
    expect(readiness.environment.name).toBe('staging')
  })
})

describe('backups', () => {
  it('will not claim anything it cannot actually check', async () => {
    process.env = { ...ORIGINAL, APP_ENV: 'production' }
    delete process.env.BACKUP_SCHEDULE
    reset()

    const check = (await systemReadiness()).checks.find((entry) => entry.label === 'Backups')
    // Railway's schedule is a platform setting with no API to read, so a green
    // light here would be a lie dressed as a status light.
    expect(check?.health).toBe('wrong')
    expect(check?.detail).toMatch(/nothing recorded/i)
  })

  it('is not satisfied by a schedule alone', async () => {
    process.env = { ...ORIGINAL, APP_ENV: 'production', BACKUP_SCHEDULE: 'Daily, 30 days' }
    delete process.env.BACKUP_LAST_VERIFIED_RESTORE
    reset()

    const check = (await systemReadiness()).checks.find((entry) => entry.label === 'Backups')
    expect(check?.health).toBe('wrong')
    expect(check?.detail).toMatch(/hypothesis/i)
  })

  it('goes green only once a restore has actually been done', async () => {
    const today = new Date().toISOString().slice(0, 10)
    process.env = {
      ...ORIGINAL,
      APP_ENV: 'production',
      BACKUP_SCHEDULE: 'Daily, 30 days',
      BACKUP_LAST_VERIFIED_RESTORE: today,
    }
    reset()

    const check = (await systemReadiness()).checks.find((entry) => entry.label === 'Backups')
    expect(check?.health).toBe('ok')
  })

  it('asks for another one when the last is old', async () => {
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10)
    process.env = {
      ...ORIGINAL,
      APP_ENV: 'production',
      BACKUP_SCHEDULE: 'Daily, 30 days',
      BACKUP_LAST_VERIFIED_RESTORE: old,
    }
    reset()

    const check = (await systemReadiness()).checks.find((entry) => entry.label === 'Backups')
    expect(check?.health).toBe('wrong')
    expect(check?.detail).toMatch(/time to do another/i)
  })
})

describe('the outbound email guard', () => {
  it('is reported on staging and not on production', async () => {
    // Test-mode key, so staging reads its configuration normally.
    process.env = { ...ORIGINAL, ...SECRETS, APP_ENV: 'staging', STORAGE_DRIVER: 'r2' }
    process.env.STRIPE_SECRET_KEY = TEST_KEY
    reset()
    const staging = (await systemReadiness()).checks.find(
      (check) => check.label === 'Outbound email guard',
    )
    expect(staging?.health).toBe('ok')
    expect(staging?.detail).toMatch(/redirected/i)

    configureEverything('production')
    const production = (await systemReadiness()).checks.find(
      (check) => check.label === 'Outbound email guard',
    )
    expect(production?.health).toBe('not applicable')
  })

  it('says plainly when a staging deployment can send nothing', async () => {
    process.env = { ...ORIGINAL, APP_ENV: 'staging' }
    delete process.env.STAGING_EMAIL_REDIRECT_TO
    delete process.env.STAGING_EMAIL_ALLOWLIST
    reset()

    const check = (await systemReadiness()).checks.find(
      (entry) => entry.label === 'Outbound email guard',
    )
    expect(check?.detail).toMatch(/nothing can leave/i)
  })
})
