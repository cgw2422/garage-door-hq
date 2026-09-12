import { createHash, randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/password'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'
import {
  PasswordResetError,
  completePasswordReset,
  requestPasswordReset,
  resolveResetToken,
  sweepResetTokens,
} from '@/server/auth/password-reset'
import { setEmailDriver } from '@/server/email'
import { createTestCompany } from './helpers'
import type { EmailDriver, OutboundEmail } from '@/server/email/types'

/**
 * Password reset.
 *
 * Two properties, and the tests are arranged around them: the flow must not
 * reveal whether an account exists, and the token must behave like a
 * credential rather than a convenience.
 */

/** Captures what would have been sent, so the token can be read back. */
function capturingDriver() {
  const sent: OutboundEmail[] = []
  const driver: EmailDriver = {
    name: 'test',
    configured: true,
    async send(message) {
      sent.push(message)
      return { accepted: true, providerMessageId: `test_${sent.length}` }
    },
  }
  setEmailDriver(driver)
  return sent
}

/** Pull the reset token out of the email body, the way a person would. */
function tokenFrom(message: OutboundEmail): string {
  const match = /\/reset\/([A-Za-z0-9_-]{20,})/.exec(message.text)
  if (!match?.[1]) throw new Error('No reset link in the message')
  return match[1]
}

function hashOf(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

let sent: OutboundEmail[] = []

beforeEach(() => {
  sent = capturingDriver()
})

describe('asking for a reset', () => {
  it('does not reveal whether an account exists', async () => {
    const { session } = await createTestCompany()

    const real = await requestPasswordReset({ email: session.email })
    const fake = await requestPasswordReset({ email: `nobody-${randomUUID()}@test.invalid` })

    // The internal answer differs; what the action returns to the browser does
    // not — see the action, which discards this entirely.
    expect(real.issued).toBe(true)
    expect(fake.issued).toBe(false)

    // And nothing was written for the address that does not exist.
    expect(sent).toHaveLength(1)
  })

  it('stores only the hash of the token', async () => {
    const { session } = await createTestCompany()
    await requestPasswordReset({ email: session.email })

    const token = tokenFrom(sent[0]!)
    const rows = await prisma.passwordResetToken.findMany({
      where: { user: { email: session.email } },
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]!.tokenHash).toBe(hashOf(token))
    // The raw token appears nowhere in the row.
    expect(JSON.stringify(rows[0]!)).not.toContain(token)
  })

  it('is case-insensitive about the address', async () => {
    const { session } = await createTestCompany()
    const result = await requestPasswordReset({ email: session.email.toUpperCase() })
    expect(result.issued).toBe(true)
  })

  it('revokes an outstanding token when a new one is asked for', async () => {
    const { session } = await createTestCompany()

    await requestPasswordReset({ email: session.email })
    const first = tokenFrom(sent[0]!)

    await requestPasswordReset({ email: session.email })
    const second = tokenFrom(sent[1]!)

    // A link somebody forwarded by mistake stops working the moment a fresh
    // one is requested.
    expect(await resolveResetToken(first)).toBeNull()
    expect(await resolveResetToken(second)).not.toBeNull()
  })
})

describe('the token', () => {
  it('resolves to the right account', async () => {
    const { session } = await createTestCompany()
    await requestPasswordReset({ email: session.email })

    const resolved = await resolveResetToken(tokenFrom(sent[0]!))
    expect(resolved?.email).toBe(session.email)
    expect(resolved?.userId).toBe(session.userId)
  })

  it('refuses an unknown, malformed or empty token identically', async () => {
    for (const token of ['', 'short', 'x'.repeat(40), 'a'.repeat(300), '../../etc/passwd']) {
      expect(await resolveResetToken(token)).toBeNull()
    }
  })

  it('expires', async () => {
    const { session } = await createTestCompany()
    await requestPasswordReset({ email: session.email })
    const token = tokenFrom(sent[0]!)

    await prisma.passwordResetToken.updateMany({
      where: { tokenHash: hashOf(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    expect(await resolveResetToken(token)).toBeNull()
    await expect(
      completePasswordReset({ token, password: 'a-brand-new-password' }),
    ).rejects.toThrow(PasswordResetError)
  })

  it('works exactly once', async () => {
    const { session } = await createTestCompany()
    await requestPasswordReset({ email: session.email })
    const token = tokenFrom(sent[0]!)

    await completePasswordReset({ token, password: 'first-new-password' })

    await expect(
      completePasswordReset({ token, password: 'second-new-password' }),
    ).rejects.toThrow(PasswordResetError)

    // And the first password is still the one that took.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } })
    expect(await verifyPassword('first-new-password', user.passwordHash)).toBe(true)
    expect(await verifyPassword('second-new-password', user.passwordHash)).toBe(false)
  })

  it('cannot be used concurrently by two requests', async () => {
    const { session } = await createTestCompany()
    await requestPasswordReset({ email: session.email })
    const token = tokenFrom(sent[0]!)

    // The consume is a conditional update, so exactly one of these wins.
    const results = await Promise.allSettled([
      completePasswordReset({ token, password: 'racing-password-one' }),
      completePasswordReset({ token, password: 'racing-password-two' }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  })
})

describe('setting the new password', () => {
  it('enforces the minimum length', async () => {
    const { session } = await createTestCompany()
    await requestPasswordReset({ email: session.email })
    const token = tokenFrom(sent[0]!)

    await expect(completePasswordReset({ token, password: 'short' })).rejects.toThrow(
      new RegExp(String(PASSWORD_MIN_LENGTH)),
    )

    // A refused attempt must not have burned the token.
    expect(await resolveResetToken(token)).not.toBeNull()
  })

  it('signs every existing session out', async () => {
    const { session } = await createTestCompany()
    const before = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } })

    await requestPasswordReset({ email: session.email })
    await completePasswordReset({
      token: tokenFrom(sent[0]!),
      password: 'a-completely-new-password',
    })

    const after = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } })
    // getSession() compares this against the token's copy, so every session
    // issued before this moment stops working.
    expect(after.sessionEpoch).toBeGreaterThan(before.sessionEpoch)
  })

  it('revokes every other outstanding token for that account', async () => {
    const { session } = await createTestCompany()

    // Two tokens issued back to back; the second revokes the first, so make a
    // third by hand to prove the sweep on completion covers siblings.
    await requestPasswordReset({ email: session.email })
    const token = tokenFrom(sent[0]!)

    const sibling = randomUUID() + randomUUID()
    await prisma.passwordResetToken.create({
      data: {
        userId: session.userId,
        tokenHash: hashOf(sibling),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    })
    expect(await resolveResetToken(sibling)).not.toBeNull()

    await completePasswordReset({ token, password: 'yet-another-password' })

    expect(await resolveResetToken(sibling)).toBeNull()
  })

  it('actually changes the password', async () => {
    const { session } = await createTestCompany()
    await prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash: await hashPassword('the-old-password') },
    })

    await requestPasswordReset({ email: session.email })
    await completePasswordReset({ token: tokenFrom(sent[0]!), password: 'the-new-password' })

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } })
    expect(await verifyPassword('the-new-password', user.passwordHash)).toBe(true)
    expect(await verifyPassword('the-old-password', user.passwordHash)).toBe(false)
  })
})

describe('housekeeping', () => {
  it('drops used and expired tokens', async () => {
    const { session } = await createTestCompany()
    await requestPasswordReset({ email: session.email })
    await completePasswordReset({ token: tokenFrom(sent[0]!), password: 'housekeeping-pass' })

    await sweepResetTokens()

    const left = await prisma.passwordResetToken.count({ where: { userId: session.userId } })
    expect(left).toBe(0)
  })
})
