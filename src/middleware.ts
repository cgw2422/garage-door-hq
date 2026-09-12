import { NextResponse, type NextRequest } from 'next/server'
import { REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS, normalizeReferralCode } from '@/lib/attribution'

/**
 * Catch `?ref=` wherever it lands.
 *
 * A partner link can point at the marketing page, the pricing section or
 * straight at signup, and the person may take days to decide. This records the
 * code once, on first touch, so attribution survives the journey.
 *
 * Deliberately does no authentication: auth is resolved per request from the
 * session, and putting it in middleware would mean trusting an edge-evaluated
 * token for something the database already answers.
 */
export function middleware(request: NextRequest) {
  const code = normalizeReferralCode(request.nextUrl.searchParams.get('ref'))
  if (!code) return NextResponse.next()

  // First touch wins: a later partner's link cannot claim someone who is
  // already attributed.
  if (request.cookies.get(REFERRAL_COOKIE)) return NextResponse.next()

  const response = NextResponse.next()
  response.cookies.set({
    name: REFERRAL_COOKIE,
    value: code,
    maxAge: REFERRAL_COOKIE_DAYS * 24 * 60 * 60,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
  return response
}

export const config = {
  // Everything a person could land on. Skipped for API routes, static assets
  // and image optimization, none of which are entry points.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
