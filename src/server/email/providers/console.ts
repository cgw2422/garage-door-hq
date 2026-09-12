import type { EmailDriver, EmailSendResult, OutboundEmail } from '../types'

/**
 * The development driver: writes the message to the server log and hands back
 * a synthetic id.
 *
 * It reports `configured: false` on purpose. Every screen that can send mail
 * asks the driver whether it is configured and says plainly that delivery is
 * not connected — a developer running locally should never be left believing a
 * customer received something.
 */
export function createConsoleDriver(): EmailDriver {
  return {
    name: 'console',
    configured: false,

    async send(message: OutboundEmail): Promise<EmailSendResult> {
      const id = `console_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      console.info(
        [
          '',
          '──────── email (not actually sent) ────────',
          `to:      ${message.to.name ? `${message.to.name} <${message.to.email}>` : message.to.email}`,
          `from:    ${message.from.name ? `${message.from.name} <${message.from.email}>` : message.from.email}`,
          `subject: ${message.subject}`,
          '',
          message.text,
          '───────────────────────────────────────────',
          '',
        ].join('\n'),
      )
      return { accepted: true, providerMessageId: id }
    },
  }
}
