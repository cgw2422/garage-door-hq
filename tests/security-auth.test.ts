import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { hashPassword, verifyAgainstDecoy, verifyPassword } from '@/lib/password'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'

/**
 * The login path, timed.
 *
 * Every other property of authentication here is covered by
 * password-reset.test.ts and rate-limit.test.ts. What those cannot catch is a
 * defence that is present in the source and absent in the behaviour: the
 * "spend the same time either way" branch on a missing account was comparing
 * against a string that is not a valid bcrypt hash, so bcrypt rejected it in
 * microseconds while a real account took a third of a second. The comment said
 * one thing, the stopwatch said another, and the stopwatch is what an attacker
 * reads.
 */

async function timeOf(run: () => Promise<unknown>, iterations = 3): Promise<number> {
  // One warm-up, so the first call's JIT cost does not land in the sample.
  await run()
  const started = process.hrtime.bigint()
  for (let index = 0; index < iterations; index += 1) await run()
  return Number(process.hrtime.bigint() - started) / 1e6 / iterations
}

describe('a wrong password and a missing account cost the same', () => {
  it('spends real bcrypt work on an address that does not exist', async () => {
    const real = await hashPassword('a real account password')

    const wrongPassword = await timeOf(() => verifyPassword('guess', real))
    const noSuchAccount = await timeOf(() => verifyAgainstDecoy('guess'))

    // Both must be doing actual work. A decoy that answers instantly is the
    // bug this test exists for.
    expect(wrongPassword, 'bcrypt work factor looks too low').toBeGreaterThan(20)
    expect(noSuchAccount, 'the missing-account path did no work').toBeGreaterThan(20)

    // And within the same order of magnitude. Generous, because a shared CI
    // runner is noisy — but a 30,000× gap, which is what an invalid decoy
    // hash produced, cannot hide inside this.
    const ratio = Math.max(wrongPassword, noSuchAccount) / Math.min(wrongPassword, noSuchAccount)
    expect(ratio, `wrong password ${wrongPassword}ms vs missing account ${noSuchAccount}ms`).toBeLessThan(3)
  }, 30_000)

  it('always fails, whatever it is handed', async () => {
    expect(await verifyAgainstDecoy('')).toBe(false)
    expect(await verifyAgainstDecoy('password')).toBe(false)
  }, 30_000)
})

describe('password storage', () => {
  it('uses bcrypt at a work factor that is still worth something', async () => {
    const hash = await hashPassword('correct horse battery staple')
    // $2a$12$ or $2b$12$ — the algorithm and the cost are both in the prefix.
    expect(hash).toMatch(/^\$2[aby]\$12\$/)
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
    expect(await verifyPassword('Correct horse battery staple', hash)).toBe(false)
  }, 30_000)

  it('salts, so two identical passwords do not share a hash', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')])
    expect(a).not.toBe(b)
  }, 30_000)

  it('asks for a length that survives a list attack', () => {
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(10)
  })
})

/**
 * Session cookie configuration, read from the source.
 *
 * Auth.js builds the cookie deep inside its own request handling, so there is
 * no seam to assert against without standing up a server. Reading the config
 * is the honest version of this check: it proves the flags are declared, and
 * the live E2E proves the server actually sets them.
 */
describe('the session cookie', () => {
  const source = readFileSync('src/lib/auth.ts', 'utf8')

  it('is httpOnly, SameSite=Lax, and Secure in production', () => {
    expect(source).toContain('httpOnly: true')
    expect(source).toContain("sameSite: 'lax'")
    expect(source).toMatch(/secure:\s*process\.env\.NODE_ENV === 'production'/)
    expect(source).toContain('__Secure-authjs.session-token')
  })

  it('carries identity only — never an organization or a role', () => {
    // Tenancy and permissions are resolved from the database per request, so a
    // revoked membership or a demotion takes effect at once rather than at
    // token expiry. A role baked into a JWT would outlive the decision.
    const jwtCallback = source.slice(source.indexOf('async jwt('), source.indexOf('async session('))
    expect(jwtCallback).not.toMatch(/organizationId|role|platformRole/)
  })

  it('expires, and re-issues no more often than daily', () => {
    expect(source).toMatch(/maxAge:\s*60 \* 60 \* 24 \* 30/)
    expect(source).toMatch(/updateAge:\s*60 \* 60 \* 24/)
  })
})
