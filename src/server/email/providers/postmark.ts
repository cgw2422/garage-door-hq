import type { EmailDriver, EmailSendResult, OutboundEmail } from '../types'

/**
 * Postmark, over its REST API.
 *
 * A second real provider, deliberately: it uses a different auth header, a
 * different request shape and a different success payload from Resend, which
 * is what makes the driver interface worth having rather than a Resend client
 * with extra steps.
 */
export interface PostmarkConfig {
  serverToken: string
  baseUrl?: string
  /** Postmark's own grouping for reporting; optional. */
  messageStream?: string
}

export function readPostmarkConfigFromEnv(): PostmarkConfig | null {
  const serverToken = process.env.POSTMARK_SERVER_TOKEN
  if (!serverToken) return null
  return {
    serverToken,
    baseUrl: process.env.POSTMARK_BASE_URL || 'https://api.postmarkapp.com',
    messageStream: process.env.POSTMARK_MESSAGE_STREAM || 'outbound',
  }
}

function formatAddress(address: { email: string; name?: string | null }): string {
  if (!address.name) return address.email
  const name = address.name.replace(/["\\]/g, '\\$&')
  return `"${name}" <${address.email}>`
}

export function createPostmarkDriver(config: PostmarkConfig): EmailDriver {
  const baseUrl = (config.baseUrl ?? 'https://api.postmarkapp.com').replace(/\/+$/, '')

  return {
    name: 'postmark',
    configured: true,

    async send(message: OutboundEmail): Promise<EmailSendResult> {
      let response: Response
      try {
        response = await fetch(`${baseUrl}/email`, {
          method: 'POST',
          headers: {
            'X-Postmark-Server-Token': config.serverToken,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            From: formatAddress(message.from),
            To: formatAddress(message.to),
            ...(message.replyTo ? { ReplyTo: formatAddress(message.replyTo) } : {}),
            Subject: message.subject,
            HtmlBody: message.html,
            TextBody: message.text,
            MessageStream: config.messageStream ?? 'outbound',
            ...(message.tags?.messageType ? { Tag: message.tags.messageType } : {}),
            ...(message.idempotencyKey ? { Metadata: { key: message.idempotencyKey } } : {}),
          }),
        })
      } catch (error) {
        console.error('[email:postmark] request failed', error)
        return {
          accepted: false,
          providerMessageId: null,
          error: 'The email service could not be reached.',
          retryable: true,
        }
      }

      const body = (await response.json().catch(() => ({}))) as {
        MessageID?: string
        ErrorCode?: number
        Message?: string
      }

      if (response.ok && body.ErrorCode === 0) {
        return { accepted: true, providerMessageId: body.MessageID ?? null }
      }

      console.error(
        `[email:postmark] ${response.status} code=${body.ErrorCode ?? '?'} ${body.Message ?? ''}`,
      )
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
