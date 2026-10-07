/**
 * Affiliate attribution.
 *
 * A partner shares `thegaragedoorhq.com/?ref=SKOOL`. The person reads the
 * page, maybe comes back tomorrow, then signs up. The code has to survive all
 * of that, which a query parameter alone does not — so it is written to a
 * cookie the first time it is seen and read at signup.
 *
 * **The link has to reach the application.** This cookie is written by
 * middleware, which only runs here, and it is host-only — no `domain`
 * attribute — so it belongs to the host that set it and nothing else.
 *
 * Today that is not a constraint, because the landing page a partner links to
 * is served by this application: one host, middleware runs, the cookie is set
 * on the first page the visitor sees. It becomes a constraint the moment the
 * marketing site moves somewhere else. Then a partner link pointing at it
 * attributes nobody, silently, and the first anyone notices is a commission
 * that never appears — so partner links would have to target the application
 * directly, or the marketing site would have to carry `?ref=` through to its
 * signup button.
 *
 * Two rules make this trustworthy rather than a thing to be gamed:
 *
 * 1. **First touch wins.** The cookie is only written when none exists, so a
 *    second partner's link cannot take credit for somebody already attributed.
 * 2. **A company cannot change its own attribution.** The `Referral` row is
 *    written once at provisioning and nothing in the app updates it. Changing
 *    it is a platform-staff action with an audit entry, not a settings field.
 */

export const REFERRAL_COOKIE = 'gdhq_ref'

/** Long enough to survive a decision, short enough to be honest about it. */
export const REFERRAL_COOKIE_DAYS = 60

/**
 * Referral codes end up in URLs and in a cookie, so the accepted shape is
 * narrow: letters, digits and dashes, and short.
 */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (code.length < 2 || code.length > 40) return null
  return code
}
