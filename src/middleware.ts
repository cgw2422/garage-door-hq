import { NextResponse, type NextRequest } from 'next/server'
import { REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS, normalizeReferralCode } from '@/lib/attribution'
import { PRESENTATION_COOKIE } from '@/lib/presentation-cookie'

/**
 * Two things happen before any page does.
 *
 * Neither is authentication: auth is resolved per request from the session,
 * and putting it here would mean trusting an edge-evaluated token for
 * something the database already answers.
 *
 * 1. `?ref=` is recorded once, on first touch, wherever a partner link lands,
 *    so attribution survives someone taking days to decide.
 * 2. A live presentation is bounced back to itself, so a URL typed on a phone
 *    that is currently in a customer's hands never reaches the application.
 */

/**
 * Paths a live presentation may still reach.
 *
 * The presentation itself, and the brokered photo route — the findings a
 * customer is looking at are photographs, and that route re-authorizes each
 * one against the presented estimate rather than against the technician's
 * session (see `presentablePhoto`). Everything else is the business.
 */
const PRESENTATION_ALLOWED = [/^\/present(\/|$)/, /^\/api\/files\/photos\//]

export function middleware(request: NextRequest) {
  /*
   * The device is in a customer's hands.
   *
   * This is the fast half of the lock: a cookie read at the edge, so a typed
   * URL never reaches a server component. It is not the whole lock — a cookie
   * can be cleared — so `requireSession()` checks the database too. Two
   * layers, because this one is cheap and that one cannot be bypassed.
   */
  if (request.cookies.get(PRESENTATION_COOKIE)) {
    const { pathname } = request.nextUrl
    if (!PRESENTATION_ALLOWED.some((allowed) => allowed.test(pathname))) {
      const back = request.nextUrl.clone()
      back.pathname = '/present'
      back.search = ''
      return NextResponse.redirect(back)
    }
  }

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
  /*
   * Everything a person could land on, plus the API.
   *
   * The API used to be skipped because it is not an entry point. Under a live
   * presentation it is: the document routes and the file routes are reachable
   * by typing, and a PDF of the internal estimate is exactly the thing that
   * must not open while a customer is holding the phone.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
