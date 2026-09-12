import { createConsoleDriver } from './providers/console'
import { createPostmarkDriver, readPostmarkConfigFromEnv } from './providers/postmark'
import { createResendDriver, readResendConfigFromEnv } from './providers/resend'
import type { EmailDriver } from './types'

export * from './types'

let cached: EmailDriver | null = null

/**
 * The configured provider, or the console driver when none is.
 *
 * Selection is by environment, not by NODE_ENV, so a staging deployment with a
 * real key behaves exactly like production. `EMAIL_PROVIDER` forces a choice
 * when more than one set of credentials is present.
 */
export function email(): EmailDriver {
  if (cached) return cached

  const requested = process.env.EMAIL_PROVIDER?.toLowerCase()
  const resend = readResendConfigFromEnv()
  const postmark = readPostmarkConfigFromEnv()

  if (requested === 'console') {
    cached = createConsoleDriver()
  } else if (requested === 'resend' && resend) {
    cached = createResendDriver(resend)
  } else if (requested === 'postmark' && postmark) {
    cached = createPostmarkDriver(postmark)
  } else if (resend) {
    cached = createResendDriver(resend)
  } else if (postmark) {
    cached = createPostmarkDriver(postmark)
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[email] No email provider is configured. Invitations, customer documents and ' +
          'receipts will be recorded as undeliverable rather than sent. Set RESEND_API_KEY ' +
          'or POSTMARK_SERVER_TOKEN.',
      )
    }
    cached = createConsoleDriver()
  }

  return cached
}

/** Test seam: drop the memoized driver so environment changes take effect. */
export function resetEmail() {
  cached = null
}

/** Lets a test install a driver without touching the environment. */
export function setEmailDriver(driver: EmailDriver | null) {
  cached = driver
}

/**
 * Whether email can actually leave the building.
 *
 * Screens use this to tell the truth: when it is false they offer the link to
 * copy rather than promising a send that will not happen.
 */
export function emailIsConfigured(): boolean {
  return email().configured
}
