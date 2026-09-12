/**
 * The transactional email boundary.
 *
 * Everything above this file talks in terms of "send this message to this
 * person"; everything below knows about a specific provider's HTTP API. The
 * point of the split is that swapping Resend for SES, Postmark or plain SMTP
 * is a new file in `providers/` and an environment variable — not a change to
 * any business logic.
 */

export interface EmailAddress {
  email: string
  /** Display name. For a customer-facing message this is the garage door company. */
  name?: string | null
}

export interface OutboundEmail {
  to: EmailAddress
  from: EmailAddress
  /** Where a human reply should land — usually the garage door company's own inbox. */
  replyTo?: EmailAddress | null
  subject: string
  html: string
  text: string
  /**
   * Passed to providers that support it, so a retry of the same logical
   * message cannot become two emails even if our own bookkeeping fails.
   */
  idempotencyKey?: string | null
  /** Opaque correlation values a provider echoes back on its webhooks. */
  tags?: Record<string, string>
}

/**
 * What a provider reports back.
 *
 * `accepted` means the provider took responsibility for the message and gave
 * us an id. It does **not** mean the message reached a mailbox — only a
 * delivery webhook can say that, which is why `DELIVERED` is a separate state
 * that nothing in the send path may set.
 */
export interface EmailSendResult {
  accepted: boolean
  providerMessageId: string | null
  /** Safe to show a company user. Never a raw provider payload. */
  error?: string | null
  /** Whether trying the exact same send again could plausibly work. */
  retryable?: boolean
}

export interface EmailDriver {
  readonly name: string
  /**
   * True when the driver can actually reach a provider. A driver that is
   * configured but missing credentials reports false so the UI can say
   * "email is not connected" instead of silently swallowing messages.
   */
  readonly configured: boolean
  send(message: OutboundEmail): Promise<EmailSendResult>
}

export class EmailConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailConfigError'
  }
}
