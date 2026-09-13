import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { checkReadiness } from '@/lib/readiness'
import { email } from '@/server/email'
import { stripeConfigured } from '@/server/billing/stripe'
import { storageDriverName } from '@/server/storage'

/**
 * Is this deployment finished?
 *
 * Unauthenticated on purpose: the failure it exists to explain is one where
 * nobody can sign in. It answers with presence, never with values — no keys,
 * no URLs, no versions — so the worst it can tell a stranger is that this
 * instance has not connected Stripe yet.
 *
 * 200 when the required checks pass, 503 when they do not, so a platform
 * health check reads it correctly without parsing the body.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const readiness = await checkReadiness(
    () => prisma.$queryRaw`SELECT 1`,
    email().configured,
    stripeConfigured(),
    storageDriverName(),
  )

  return NextResponse.json(readiness, {
    status: readiness.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
