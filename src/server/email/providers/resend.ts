import type { EmailDriver, EmailSendResult, OutboundEmail } from '../types'

/**
 * Resend, over its REST API.
 *
 * Chosen as the first real provider because it needs one API key and one
 * verified domain to get going, which matters for a product whose operator is
 * one person. Nothing above this file knows it exists.
 */
export interface ResendConfig {
  apiKey: string
  baseUrl?: string
}

export function readResendConfigFromEnv(): ResendConfig | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  return { apiKey, baseUrl: process.env.RESEND_BASE_URL || 'https://api.resend.com' }
}

function formatAddress(address: { email: string; name?: string | null }): string {
  // A display name containing a comma or quote would break the header, so it
  // is quoted and its quotes escaped rather than passed through.
  if (!address.name) return address.email
  const name = address.name.replace(/["\\]/g, '\\$&')
  return `"${name}" <${address.email}>`
}

export function createResendDriver(config: ResendConfig): EmailDriver {
  const baseUrl = (config.baseUrl ?? 'https://api.resend.com').replace(/\/+$/, '')

  return {
    name: 'resend',
    configured: true,

    async send(message: OutboundEmail): Promise<EmailSendResult> {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      }
      // Resend deduplicates on this header, so our retry cannot become a
      // second email even if we failed to record the first attempt.
      if (message.idempotencyKey) headers['Idempotency-Key'] = message.idempotencyKey

      let response: Response
      try {
        response = await fetch(`${baseUrl}/emails`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            from: formatAddress(message.from),
            to: [formatAddress(message.to)],
            ...(message.replyTo ? { reply_to: [formatAddress(message.replyTo)] } : {}),
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(message.tags
              ? { tags: Object.entries(message.tags).map(([name, value]) => ({ name, value })) }
              : {}),
          }),
        })
      } catch (error) {
        // The network did not reach them at all; this is always worth retrying.
        console.error('[email:resend] request failed', error)
        return {
          accepted: false,
          providerMessageId: null,
          error: 'The email service could not be reached.',
          retryable: true,
        }
      }

      if (response.ok) {
        const body = (await response.json().catch(() => ({}))) as { id?: string }
        return { accepted: true, providerMessageId: body.id ?? null }
      }

      // Log the provider's own words for debugging; show the user none of it.
      const detail = await response.text().catch(() => '')
      console.error(`[email:resend] ${response.status} ${detail.slice(0, 500)}`)

      // 4xx other than 429 means the message itself is wrong — retrying the
      // identical request will fail identically.
      const retryable = response.status === 429 || response.status >= 500
      return {
        accepted: false,
        providerMessageId: null,
        error: retryable
          ? 'The email service is temporarily unavailable.'
          : 'That message was rejected by the email service.',
        retryable,
      }
    },
  }
}
