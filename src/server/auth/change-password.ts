import { prisma } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/password'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'
import { recordAudit } from '@/lib/audit'

/**
 * Changing your own password while signed in.
 *
 * The reset-by-email flow already existed and is the right answer when someone
 * has forgotten theirs. It is the wrong answer for everything else: it needs a
 * configured email provider, a delivered message and a link, which is a lot of
 * moving parts between a person and "I would like a different password now" —
 * and on a fresh deployment, where the provider is not connected yet, it is not
 * a route at all.
 *
 * So this one takes the current password instead of a mailed token. That is the
 * proof of possession, and it is why no separate rate limit would save an
 * account whose password is already known: the control here is knowing the old
 * one.
 */

export class ChangePasswordError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChangePasswordError'
  }
}

export async function changePassword(input: {
  userId: string
  currentPassword: string
  newPassword: string
  ipAddress?: string | null
}): Promise<void> {
  if (input.newPassword.length < PASSWORD_MIN_LENGTH) {
    throw new ChangePasswordError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, passwordHash: true },
  })
  // The session said this user exists, so this is a deleted account mid-session
  // rather than an enumeration attempt. Same refusal either way.
  if (!user) throw new ChangePasswordError('That password is not correct.')

  const correct = await verifyPassword(input.currentPassword, user.passwordHash)
  if (!correct) throw new ChangePasswordError('That password is not correct.')

  if (input.currentPassword === input.newPassword) {
    throw new ChangePasswordError('That is the password you are already using.')
  }

  const passwordHash = await hashPassword(input.newPassword)

  await prisma.$transaction(async (tx) => {
    // Any reset link already in an inbox is now stale. Someone changing their
    // password because they think somebody else has it should not leave a
    // working way back in sitting in their email.
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    // Bumping the epoch ends every session issued before now — including this
    // one, which is why the caller sends the person back to sign in. Keeping
    // the current session alive would mean a password change that does not
    // actually evict whoever else was signed in.
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, sessionEpoch: { increment: 1 } },
    })
  })

  await recordAudit({
    organizationId: null,
    actorUserId: user.id,
    action: 'auth.password_changed',
    entityType: 'User',
    entityId: user.id,
    ipAddress: input.ipAddress ?? null,
  })
}
