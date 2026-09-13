import { NextResponse } from 'next/server'
import { handlers } from '@/lib/auth'
import { authSecretConfigured, warnIfAuthUnconfigured } from '@/lib/readiness'

/**
 * Auth.js answers its own requests, with one guard in front.
 *
 * Without `AUTH_SECRET` the library refuses every request here with a raw JSON
 * body — "There was a problem with the server configuration. Check the server
 * logs." — which is both the wrong audience and the wrong advice for someone
 * who has just deployed and cannot get in. So an unconfigured deployment is
 * sent back to the sign-in screen, which says which variable to set, and the
 * logs get one line that names it too.
 */

function unconfigured(request: Request) {
  warnIfAuthUnconfigured()
  return NextResponse.redirect(new URL('/login?error=configuration', request.url), {
    // 303 so a POSTed sign-in becomes a GET of the login page.
    status: 303,
  })
}

export async function GET(request: Request) {
  if (!authSecretConfigured()) return unconfigured(request)
  return handlers.GET(request as never)
}

export async function POST(request: Request) {
  if (!authSecretConfigured()) return unconfigured(request)
  return handlers.POST(request as never)
}
