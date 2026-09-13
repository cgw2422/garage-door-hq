/**
 * The origin this deployment is reachable at.
 *
 * Every link that leaves the building is built from this: the estimate link a
 * homeowner taps, the invitation a new technician opens, the URL Stripe sends
 * a customer back to after paying. Getting it wrong is not a visible crash —
 * it is a customer receiving a link to `localhost:3000`, which is why the
 * checked form below refuses to build one in production rather than mailing it.
 *
 * Three variables, in order. `APP_URL` is read at run time and wins, because
 * `NEXT_PUBLIC_APP_URL` is inlined into the bundle when the app is built —
 * including on the server — so changing it on a running deployment does
 * nothing until the next build. Verified, not assumed: the value appears as a
 * literal in `.next/server`.
 *
 * `AUTH_URL` is accepted as a last fallback because it names the same origin, but
 * note that Auth.js treats `AUTH_URL` as authoritative for its own redirects:
 * a stale value there sends sign-in to the wrong host regardless of anything
 * here. On a platform that terminates TLS and forwards the host (Railway,
 * Fly, Vercel), leave `AUTH_URL` unset and let `trustHost` infer it.
 */

const DEV_DEFAULT = 'http://localhost:3000'

/** Origins that mean "my laptop" and are therefore wrong for a deployment. */
const LOOPBACK = /^https?:\/\/(localhost|127(?:\.\d+){3}|\[::1\]|0\.0\.0\.0)(:\d+)?$/i

export class AppUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppUrlError'
  }
}

function configured(): string {
  const raw =
    process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || ''
  return raw.trim().replace(/\/+$/, '')
}

/**
 * Best effort, never throws. For places where a wrong value is merely
 * cosmetic — a link shown on screen next to the person who can fix it, or the
 * local-disk storage driver that only runs in development.
 */
export function appBaseUrlUnchecked(): string {
  return configured() || DEV_DEFAULT
}

/**
 * The origin, or an error naming the variable to set.
 *
 * Use this for anything a customer will receive. In development an unset
 * value falls back to localhost, which is correct there; in production both
 * "unset" and "still pointing at localhost" are refused.
 */
export function appBaseUrl(): string {
  const value = configured()
  const isProduction = process.env.NODE_ENV === 'production'

  if (!value) {
    if (!isProduction) return DEV_DEFAULT
    throw new AppUrlError(
      'This site does not know its own web address yet, so links cannot be ' +
        'sent. Set NEXT_PUBLIC_APP_URL to the address customers use, then redeploy.',
    )
  }

  if (isProduction && LOOPBACK.test(value)) {
    throw new AppUrlError(
      'This site is configured with a localhost web address, so any link sent ' +
        'would not open for your customers. Set NEXT_PUBLIC_APP_URL to the ' +
        'address customers use, then redeploy.',
    )
  }

  return value
}
