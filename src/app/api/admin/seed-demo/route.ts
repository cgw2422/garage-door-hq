import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { clientAddress, enforceRateLimit } from '@/lib/rate-limit'
import { installDemoData } from '@/server/demo/install'
import { userMessage } from '@/lib/errors'

/**
 * Load the demo company onto a running deployment.
 *
 * There is no session to check, because the person who needs this has an empty
 * database and therefore no account. So the credential is a token the operator
 * sets themselves, and the endpoint does not exist until they do: with
 * `DEMO_SEED_TOKEN` unset, every request gets a flat 404 — no hint that the
 * route is there, nothing to probe.
 *
 * What that token can do is deliberately small. It adds one tenant and refuses
 * if that tenant is already present. It cannot delete, overwrite, read, or
 * touch any other company's data. The worst a leaked token achieves is a demo
 * company existing once.
 *
 * POST rather than GET so a link preview, a crawler or a prefetch cannot fire
 * it. Remove the variable when you are done.
 */

const MIN_TOKEN_LENGTH = 24

function tokenMatches(supplied: string | null, expected: string): boolean {
  if (!supplied) return false
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  // Compare padded buffers so length alone is not a timing oracle.
  const width = Math.max(a.length, b.length)
  const left = Buffer.alloc(width)
  const right = Buffer.alloc(width)
  a.copy(left)
  b.copy(right)
  return timingSafeEqual(left, right) && a.length === b.length
}

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  const expected = (process.env.DEMO_SEED_TOKEN ?? '').trim()
  if (expected.length < MIN_TOKEN_LENGTH) {
    // Also covers "set to something short", which is not a usable credential.
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    await enforceRateLimit('sensitiveMutation', `demo-seed:${await clientAddress()}`)
  } catch (error) {
    return NextResponse.json({ error: userMessage(error, 'demo.seed') }, { status: 429 })
  }

  const supplied =
    request.headers.get('x-seed-token') ?? new URL(request.url).searchParams.get('token')
  if (!tokenMatches(supplied, expected)) {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const result = await installDemoData()
    if (result.status === 'already-present') {
      return NextResponse.json({ installed: false, message: result.message }, { status: 409 })
    }

    const { summary } = result
    return NextResponse.json({
      installed: true,
      organization: summary.organization,
      catalog: summary.catalog,
      packages: summary.packages,
      remedies: summary.remedies,
      signIn: {
        owner: summary.ownerEmail,
        technician: summary.techEmail,
        platformAdmin: summary.platformEmail,
        password: summary.password,
      },
      next: 'Unset DEMO_SEED_TOKEN now that the demo company exists.',
    })
  } catch (error) {
    console.error('[demo.seed] failed', error)
    return NextResponse.json({ error: userMessage(error, 'demo.seed') }, { status: 500 })
  }
}
