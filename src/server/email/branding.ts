/**
 * Who an email is from.
 *
 * The customer's relationship is with the garage door company, not with
 * Garage Door HQ. So every customer-facing message is *from* "ABC Garage
 * Doors", replies go to ABC's own inbox, and the page carries ABC's logo and
 * colours. Garage Door HQ appears once, small, at the bottom.
 *
 * The envelope address still has to be a domain we control and have
 * authenticated (SPF/DKIM). Sending as `office@abcgaragedoors.com` without
 * their DNS would fail authentication and land in spam — so the address is
 * ours and the *display name* is theirs, which is what recipients actually
 * read. A company that wants true from-domain sending needs domain
 * verification, which is Phase 1d work and noted as such.
 */

import { appBaseUrl } from '@/lib/app-url'

export interface SenderBranding {
  /** "ABC Garage Doors" — what the recipient sees in their inbox list. */
  companyName: string
  /** The company's own address, so a reply reaches them and not us. */
  replyToEmail: string | null
  companyPhone: string | null
  companyWebsite: string | null
  /** Absolute URL to the company logo, when they have uploaded one. */
  logoUrl: string | null
  addressLines: string[]
}

export interface PlatformBranding {
  productName: string
  /** The authenticated envelope domain, e.g. "mail.thegaragedoorhq.com". */
  fromEmail: string
  /** Used for messages that are genuinely from us: password resets. */
  fromName: string
  appUrl: string
  supportEmail: string | null
}

export function platformBranding(): PlatformBranding {
  const appUrl = appBaseUrl()
  return {
    productName: process.env.NEXT_PUBLIC_APP_NAME || 'Garage Door HQ',
    fromEmail: process.env.EMAIL_FROM_ADDRESS || 'no-reply@garagedoorhq.test',
    fromName: process.env.EMAIL_FROM_NAME || 'Garage Door HQ',
    appUrl,
    supportEmail: process.env.EMAIL_SUPPORT_ADDRESS || null,
  }
}

/**
 * The from-header for a message sent on a company's behalf.
 *
 * "ABC Garage Doors" <no-reply@thegaragedoorhq.com> — their name, our
 * authenticated domain.
 */
export function senderFor(branding: SenderBranding) {
  const platform = platformBranding()
  return {
    from: { email: platform.fromEmail, name: branding.companyName },
    replyTo: branding.replyToEmail
      ? { email: branding.replyToEmail, name: branding.companyName }
      : null,
  }
}

/** Messages that really are from the platform, not from a company. */
export function platformSender() {
  const platform = platformBranding()
  return {
    from: { email: platform.fromEmail, name: platform.fromName },
    replyTo: platform.supportEmail ? { email: platform.supportEmail, name: platform.fromName } : null,
  }
}
