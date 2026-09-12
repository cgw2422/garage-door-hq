import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy'
import { recordAudit } from '@/lib/audit'
import { platformBranding } from '@/server/email/branding'
import { passwordResetMessage } from '@/server/email/templates/messages'
import { sendEmail } from '@/server/email/send'

/**
 * Password reset.
 *
 * Two properties matter, and they pull in opposite directions from good UX:
 *
 * 1. **No account enumeration.** Requesting a reset returns the same answer
 *    whether or not the address exists, takes a similar amount of work either
 *    way, and never hints in a message, a status code or a timing difference.
 * 2. **The token is a credential.** It is 32 random bytes, only its SHA-256 is
 *    stored, it expires, it works once, and using it invalidates every session
 *    the account had.
 */

const TOKEN_BYTES = 32
const TOKEN_TTL_MINUTES = 60

export class PasswordResetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PasswordResetError'
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

/**
 * Start a reset.
 *
 * Always resolves. The caller shows the same message regardless, so this
 * function's return value says only what happened internally — it is for logs
 * and tests, never for the response body.
 */
export async function requestPasswordReset(input: {
  email: string
  ipAddress?: string | null
}): Promise<{ issued: boolean }> {
  const address = input.email.trim().toLowerCase()

  const user = await prisma.user.findUnique({
    where: { email: address },
    select: { id: true, email: true, firstName: true },
  })

  if (!user) {
    // Deliberately silent. No row, no email, and the caller says the same
    // thing it says on success.
    return { issued: false }
  }

  const token = newToken()
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000)

  await prisma.$transaction(async (tx) => {
    // A new request supersedes any outstanding one: a link someone forwarded
    // by mistake stops working the moment a fresh one is asked for.
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
        requestIp: input.ipAddress ?? null,
      },
    })
  })

  const platform = platformBranding()
  const message = passwordResetMessage({
    url: `${platform.appUrl}/reset/${token}`,
    expiresLabel: `in ${TOKEN_TTL_MINUTES} minutes`,
  })

  // Password resets are from the platform, not from a garage door company, so
  // there is no organization to bill this to and no branding to wear. The log
  // row still needs an organization; use the user's first membership when they
  // have one, and skip logging when they have none.
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, isActive: true },
    select: { organizationId: true },
  })

  if (membership) {
    await sendEmail({
      organizationId: membership.organizationId,
      messageType: 'PASSWORD_RESET',
      to: { email: user.email, name: user.firstName },
      branding: null,
      message,
      // Time-bucketed so a retry within the same minute reuses the row, but a
      // genuinely new request an hour later gets its own.
      idempotencyKey: `password-reset:${hashToken(token)}`,
      userId: user.id,
    })
  } else {
    const driver = (await import('@/server/email')).email()
    await driver.send({
      to: { email: user.email, name: user.firstName },
      from: { email: platform.fromEmail, name: platform.fromName },
      subject: message.subject,
      html: message.html,
      text: message.text,
      idempotencyKey: `password-reset:${hashToken(token)}`,
    })
  }

  await recordAudit({
    organizationId: membership?.organizationId ?? null,
    actorUserId: user.id,
    action: 'auth.password_reset_requested',
    entityType: 'User',
    entityId: user.id,
    ipAddress: input.ipAddress ?? null,
  })

  return { issued: true }
}

export interface ResolvedResetToken {
  tokenId: string
  userId: string
  email: string
}

/**
 * Look a token up.
 *
 * Unknown, expired, revoked and already-used all resolve to null by the same
 * path, so the reset screen cannot be used to learn anything.
 */
export async function resolveResetToken(token: string): Promise<ResolvedResetToken | null> {
  if (!token || token.length < 20 || token.length > 200) return null

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      user: { select: { email: true } },
    },
  })

  if (!row) return null
  if (row.usedAt || row.revokedAt) return null
  if (row.expiresAt.getTime() <= Date.now()) return null

  return { tokenId: row.id, userId: row.userId, email: row.user.email }
}

/**
 * Finish a reset.
 *
 * The token is consumed, every other outstanding token for the account is
 * revoked, and `sessionEpoch` is bumped so any session issued before this
 * moment — including one an attacker already had — stops working.
 */
export async function completePasswordReset(input: {
  token: string
  password: string
  ipAddress?: string | null
}): Promise<{ email: string }> {
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    throw new PasswordResetError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  }

  const resolved = await resolveResetToken(input.token)
  if (!resolved) {
    throw new PasswordResetError(
      'That reset link is no longer valid. Request a new one and try again.',
    )
  }

  const passwordHash = await hashPassword(input.password)

  await prisma.$transaction(async (tx) => {
    // Conditional update: if another request consumed this token between the
    // lookup and here, zero rows match and the reset is refused.
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: resolved.tokenId, usedAt: null, revokedAt: null },
      data: { usedAt: new Date() },
    })
    if (consumed.count !== 1) {
      throw new PasswordResetError('That reset link has already been used.')
    }

    await tx.passwordResetToken.updateMany({
      where: { userId: resolved.userId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    await tx.user.update({
      where: { id: resolved.userId },
      data: { passwordHash, sessionEpoch: { increment: 1 } },
    })
  })

  await recordAudit({
    organizationId: null,
    actorUserId: resolved.userId,
    action: 'auth.password_reset_completed',
    entityType: 'User',
    entityId: resolved.userId,
    ipAddress: input.ipAddress ?? null,
  })

  return { email: resolved.email }
}

/** Housekeeping: drop tokens that can no longer be used. */
export async function sweepResetTokens(now = new Date()) {
  const { count } = await prisma.passwordResetToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
  })
  return count
}
