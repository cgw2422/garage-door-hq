import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import { prisma } from './db'
import { verifyPassword } from './password'
import { clientAddress, consumeRateLimit } from './rate-limit'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      emailVerified: Date | null
      /** Bumped on password reset to invalidate live sessions. */
      sessionEpoch: number
    }
  }
}

/**
 * Auth.js with a credentials provider. The token carries identity only - never
 * an organization id or a role. Tenancy and permissions are resolved from the
 * database on every request (see session.ts) so a revoked membership or a
 * changed role takes effect immediately instead of at token expiry.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: {
    strategy: 'jwt',
    // Field work; a month between sign-ins is the realistic expectation.
    maxAge: 60 * 60 * 24 * 30,
    // Re-issue at most daily so a revoked account is not carried indefinitely
    // by a token that keeps refreshing itself.
    updateAge: 60 * 60 * 24,
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === 'production'
          ? '__Secure-authjs.session-token'
          : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null

        const email = parsed.data.email.toLowerCase().trim()

        // Rate limit on both the address and the account. The address stops a
        // spray across many accounts; the account stops a spray from many
        // addresses at one account.
        const address = await clientAddress()
        const [byAddress, byAccount] = await Promise.all([
          consumeRateLimit('login', `ip:${address}`),
          consumeRateLimit('login', `email:${email}`),
        ])
        if (!byAddress.ok || !byAccount.ok) return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) {
          // Spend comparable time on a missing account so response timing does
          // not reveal which emails exist.
          await verifyPassword(parsed.data.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin')
          return null
        }

        const ok = await verifyPassword(parsed.data.password, user.passwordHash)
        if (!ok) return null

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })

        return {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerifiedAt,
          name: `${user.firstName} ${user.lastName}`.trim(),
          sessionEpoch: user.sessionEpoch,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id
        token.epoch = (user as { sessionEpoch?: number }).sessionEpoch ?? 0
      }
      return token
    },
    async session({ session, token }) {
      session.user = {
        id: String(token.uid ?? ''),
        email: session.user?.email ?? '',
        name: session.user?.name ?? '',
        emailVerified: session.user?.emailVerified ?? null,
        sessionEpoch: Number(token.epoch ?? 0),
      }
      return session
    },
  },
})
