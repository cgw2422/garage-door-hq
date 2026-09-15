import { environment, environmentLabel } from '@/lib/environment'
import type { EmailDriver, EmailSendResult, OutboundEmail } from './types'

/**
 * The thing that stops staging from emailing a real homeowner.
 *
 * Staging runs against a copy of nothing in particular, but the addresses in
 * it are real shapes and sometimes real people — a test customer created from
 * a business card, a demo seeded with a colleague's inbox, a restored dataset
 * somebody sanitised carelessly. The moment an estimate goes out from
 * "Precision Garage Door Services" to an address that belongs to an actual
 * person, the damage is done and no amount of apologising unsends it.
 *
 * So outside production, every message passes this gate:
 *
 *   - **Redirect** (`STAGING_EMAIL_REDIRECT_TO`) sends everything to one
 *     mailbox, with the intended recipient named in the subject and body. Best
 *     for testing a whole flow.
 *   - **Allowlist** (`STAGING_EMAIL_ALLOWLIST`) lets through only addresses
 *     you listed — `me@example.com`, or `@example.com` for a whole domain.
 *   - **Neither** blocks everything. That is the default, on purpose: a
 *     staging deployment nobody configured sends no mail at all.
 *
 * Whatever gets through is stamped `[GARAGE DOOR HQ STAGING]` in the subject,
 * so a message that escapes into a real inbox still announces itself.
 *
 * This wraps the driver rather than living in `sendEmail`, because `sendEmail`
 * is not the only caller — the password-reset path talks to the driver
 * directly for a user who has no organization yet. Wrapping the driver means
 * there is no way to send an email that did not pass through here.
 */

function parseList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

/** `me@example.com` matches itself; `@example.com` matches the whole domain. */
export function addressAllowed(address: string, allowlist: string[]): boolean {
  const normalized = address.trim().toLowerCase()
  return allowlist.some((entry) =>
    entry.startsWith('@') ? normalized.endsWith(entry) : normalized === entry,
  )
}

export type GuardDecision =
  | { action: 'send' }
  | { action: 'redirect'; to: string }
  | { action: 'block'; reason: string }

export function decideOutbound(
  recipient: string,
  config: { isProduction: boolean; redirectTo: string | null; allowlist: string[] },
): GuardDecision {
  if (config.isProduction) return { action: 'send' }
  if (config.redirectTo) return { action: 'redirect', to: config.redirectTo }
  if (config.allowlist.length > 0 && addressAllowed(recipient, config.allowlist)) {
    return { action: 'send' }
  }
  if (config.allowlist.length > 0) {
    return {
      action: 'block',
      reason: `${recipient} is not on STAGING_EMAIL_ALLOWLIST`,
    }
  }
  return {
    action: 'block',
    reason:
      'no STAGING_EMAIL_REDIRECT_TO or STAGING_EMAIL_ALLOWLIST is set, so this deployment sends no email',
  }
}

function tagSubject(subject: string, label: string): string {
  const tag = `[GARAGE DOOR HQ ${label}]`
  return subject.startsWith(tag) ? subject : `${tag} ${subject}`
}

function noteIntendedRecipient(message: OutboundEmail, original: string): OutboundEmail {
  const banner =
    `This message was addressed to ${original} and redirected here because ` +
    `it was sent from a non-production deployment.`
  return {
    ...message,
    subject: `${message.subject} → ${original}`,
    html: `<div style="background:#fff4e5;border:1px solid #f0b429;padding:12px;margin-bottom:16px;font-family:system-ui,sans-serif;font-size:13px;color:#7a4b00">${banner}</div>${message.html}`,
    text: `${banner}\n\n${'-'.repeat(60)}\n\n${message.text}`,
  }
}

/**
 * Wrap a driver so nothing leaves a non-production deployment unguarded.
 *
 * `configured` is passed through unchanged: the screens use it to decide
 * whether to promise a send or offer a link to copy, and on staging the honest
 * answer is still "a provider is connected".
 */
export function guardOutbound(driver: EmailDriver): EmailDriver {
  return {
    name: driver.name,
    configured: driver.configured,
    async send(message: OutboundEmail): Promise<EmailSendResult> {
      const env = environment()
      if (env.isProduction) return driver.send(message)

      // A driver that reports itself unconfigured is the console one: it
      // writes the message to the log and delivers it nowhere. There is
      // nothing to protect anyone from, and holding it back would only break
      // local development and the end-to-end run, both of which read the
      // message back out of the log. The gate is for drivers that can
      // actually reach an inbox.
      if (!driver.configured) return driver.send(message)

      const label = environmentLabel()
      const decision = decideOutbound(message.to.email, {
        isProduction: false,
        redirectTo: process.env.STAGING_EMAIL_REDIRECT_TO?.trim() || null,
        allowlist: parseList(process.env.STAGING_EMAIL_ALLOWLIST),
      })

      if (decision.action === 'block') {
        console.warn(
          `[email:${env.name}] held back a ${message.subject.slice(0, 60)}… to ${message.to.email} — ${decision.reason}`,
        )
        // Reported as a refusal rather than a failure, so the sending code
        // records it as undeliverable and the screen tells the truth instead
        // of claiming a message went out.
        return {
          accepted: false,
          providerMessageId: null,
          error: `Outbound email is held back on ${env.name}. ${decision.reason}.`,
          retryable: false,
        }
      }

      const original = message.to.email
      const rerouted =
        decision.action === 'redirect'
          ? noteIntendedRecipient({ ...message, to: { email: decision.to, name: message.to.name } }, original)
          : message

      return driver.send({ ...rerouted, subject: tagSubject(rerouted.subject, label) })
    },
  }
}
