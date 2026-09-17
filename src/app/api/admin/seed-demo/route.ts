import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { clientAddress, enforceRateLimit } from '@/lib/rate-limit'
import { installDemoData } from '@/server/demo/install'
import { userMessage } from '@/lib/errors'
import { DEMO_UNLOCK_VARIABLE, isProduction } from '@/lib/environment'

/**
 * Load the demo company onto a running deployment.
 *
 * There is no session to check, because the person who needs this has an empty
 * database and therefore no account. So the credential is a token the operator
 * sets themselves, and the endpoint does not exist until they do: with
 * `DEMO_SEED_TOKEN` unset, every request gets a flat 404 — no hint that the
 * route is there, nothing to probe.
 *
 * What that token can do is deliberately small. It adds one tenant, and with
 * `?replace=1` it may delete that same tenant and rebuild it. It cannot read,
 * overwrite or delete any other company's data: every statement behind the
 * replace is scoped to the demo organization's own id. The worst a leaked
 * token achieves is the demo company being rebuilt.
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

  // Replacing deletes the demo company first. Opt in per request, never a
  // default, so a repeat POST cannot quietly discard what is there.
  const replace = new URL(request.url).searchParams.get('replace') === '1'

  try {
    const result = await installDemoData({ replace })
    if (result.status === 'already-present') {
      return NextResponse.json(
        {
          installed: false,
          message: result.message,
          hint: 'Add ?replace=1 to delete the demo company and load it fresh.',
        },
        { status: 409 },
      )
    }

    const { summary } = result
    return NextResponse.json({
      installed: true,
      replaced: result.replaced,
      organization: summary.organization,
      catalog: summary.catalog,
      packages: summary.packages,
      remedies: summary.remedies,
      signIn: {
        owner: summary.ownerEmail,
        technician: summary.techEmail,
        // Echoed back on a laptop or staging, where it is the repository's own
        // default and knowing it is the point. Withheld on production, where it
        // is a password the operator chose and this response ends up in a
        // terminal's scrollback and a shell history file.
        password: isProduction() ? null : summary.password,
      },
      platformAdmin: {
        email: summary.platformEmail,
        note: 'Created only if it was missing. An existing account keeps its own password.',
      },
      next: isProduction()
        ? `Unset DEMO_SEED_TOKEN and ${DEMO_UNLOCK_VARIABLE} now that the demo company exists.`
        : 'Unset DEMO_SEED_TOKEN now that the demo company exists.',
    })
  } catch (error) {
    console.error('[demo.seed] failed', error)
    return NextResponse.json({ error: userMessage(error, 'demo.seed') }, { status: 500 })
  }
}
