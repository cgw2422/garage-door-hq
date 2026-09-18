import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/password'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'
import { changePassword, ChangePasswordError } from '@/server/auth/change-password'
import { createTestCompany } from './helpers'

/**
 * Changing your own password from inside the app.
 *
 * The reset-by-email flow was the only route to a new password, which is fine
 * for someone who has forgotten theirs and useless for everyone else: it needs
 * a configured email provider, and on a deployment that has not connected one
 * it is not a route at all. That is how a platform administrator ended up
 * stuck with a password from a public repository.
 *
 * What these check is that the current password is genuinely the control — not
 * the session, which in the case this exists for may belong to whoever picked
 * the phone up.
 */

const CURRENT = 'the-password-i-already-have'
const NEXT = 'a-completely-different-one'

let userId = ''

beforeEach(async () => {
  const { session } = await createTestCompany()
  userId = session.userId
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(CURRENT) },
  })
})

describe('proving it is you', () => {
  it('refuses a wrong current password, and changes nothing', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

    await expect(
      changePassword({ userId, currentPassword: 'not-it', newPassword: NEXT }),
    ).rejects.toThrow(ChangePasswordError)

    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(after.passwordHash).toBe(before.passwordHash)
    expect(after.sessionEpoch).toBe(before.sessionEpoch)
  })

  /** The old password is the secret; the refusal must not confirm it separately. */
  it('says the same thing for a wrong password as for a missing account', async () => {
    const wrong = await changePassword({
      userId,
      currentPassword: 'not-it',
      newPassword: NEXT,
    }).catch((error: Error) => error.message)

    const missing = await changePassword({
      userId: '00000000-0000-0000-0000-000000000000',
      currentPassword: CURRENT,
      newPassword: NEXT,
    }).catch((error: Error) => error.message)

    expect(wrong).toBe(missing)
  })

  it('changes it when the current one is right', async () => {
    await changePassword({ userId, currentPassword: CURRENT, newPassword: NEXT })

    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(await verifyPassword(NEXT, after.passwordHash)).toBe(true)
    expect(await verifyPassword(CURRENT, after.passwordHash)).toBe(false)
  })
})

describe('what it refuses', () => {
  it('will not accept one shorter than the policy', async () => {
    const short = 'x'.repeat(PASSWORD_MIN_LENGTH - 1)
    await expect(
      changePassword({ userId, currentPassword: CURRENT, newPassword: short }),
    ).rejects.toThrow(/at least/i)
  })

  /**
   * Checked after the current password, deliberately: reaching this branch
   * already required knowing the old one, so the message gives nothing away.
   */
  it('will not accept the one already in use', async () => {
    await expect(
      changePassword({ userId, currentPassword: CURRENT, newPassword: CURRENT }),
    ).rejects.toThrow(/already using/i)
  })
})

describe('what it invalidates', () => {
  it('ends every session issued before it', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

    await changePassword({ userId, currentPassword: CURRENT, newPassword: NEXT })

    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    // `getSession` compares this against the value in the token and returns
    // null when they differ, so every cookie issued earlier stops working.
    expect(after.sessionEpoch).toBe(before.sessionEpoch + 1)
  })

  /**
   * Someone changing their password because they think another person has it
   * should not leave a working way back in sitting in an inbox.
   */
  it('revokes a reset link that was already sent', async () => {
    const token = await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: 'a-hash-standing-in-for-a-real-one',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    })

    await changePassword({ userId, currentPassword: CURRENT, newPassword: NEXT })

    const after = await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: token.id } })
    expect(after.revokedAt).not.toBeNull()
  })

  it('writes an audit entry naming the account', async () => {
    await changePassword({ userId, currentPassword: CURRENT, newPassword: NEXT })

    const entry = await prisma.auditLog.findFirst({
      where: { actorUserId: userId, action: 'auth.password_changed' },
      orderBy: { createdAt: 'desc' },
    })
    expect(entry).not.toBeNull()
    expect(entry!.entityId).toBe(userId)
  })
})
