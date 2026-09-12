import type { SenderBranding } from '../branding'
import { platformBranding } from '../branding'

/**
 * The shell every transactional email is rendered into.
 *
 * Deliberately plain HTML with inline styles and a table for the button:
 * email clients are not browsers, Outlook does not do flexbox, and Gmail
 * strips `<style>` blocks. Nothing here needs a build step or a framework.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface EmailBody {
  /** The one sentence the message exists to say. */
  headline: string
  paragraphs: string[]
  action?: { label: string; url: string } | null
  /** Label/value rows, e.g. "Total: $427.00". */
  facts?: Array<{ label: string; value: string }>
  /** Small print under the action, e.g. how long a link lasts. */
  footnote?: string | null
}

const INK = '#16181d'
const MUTED = '#5b6472'
const HAIRLINE = '#e3e6ec'
const BRAND = '#1f6feb'
const SURFACE = '#ffffff'
const GROUND = '#f4f5f8'

export function renderEmailHtml(branding: SenderBranding, body: EmailBody): string {
  const platform = platformBranding()

  const logo = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.companyName)}" height="44" style="max-height:44px;width:auto;border:0;display:block;margin:0 auto 10px" />`
    : ''

  const action = body.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px auto 4px">
         <tr><td align="center" bgcolor="${BRAND}" style="border-radius:10px">
           <a href="${escapeHtml(body.action.url)}"
              style="display:inline-block;padding:15px 30px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">
             ${escapeHtml(body.action.label)}
           </a>
         </td></tr>
       </table>`
    : ''

  const facts = body.facts?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:22px 0 4px;border-top:1px solid ${HAIRLINE}">
         ${body.facts
           .map(
             (fact) => `<tr>
               <td style="padding:9px 0;font-size:14px;color:${MUTED};border-bottom:1px solid ${HAIRLINE}">${escapeHtml(fact.label)}</td>
               <td align="right" style="padding:9px 0;font-size:14px;font-weight:700;color:${INK};border-bottom:1px solid ${HAIRLINE}">${escapeHtml(fact.value)}</td>
             </tr>`,
           )
           .join('')}
       </table>`
    : ''

  const contact = [
    branding.companyPhone ? escapeHtml(branding.companyPhone) : null,
    branding.companyWebsite ? escapeHtml(branding.companyWebsite) : null,
    ...branding.addressLines.map(escapeHtml),
  ]
    .filter(Boolean)
    .join(' &middot; ')

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(body.headline)}</title></head>
<body style="margin:0;padding:0;background:${GROUND};-webkit-font-smoothing:antialiased">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${GROUND}">
    <tr><td align="center" style="padding:28px 14px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:${SURFACE};border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
        <tr><td style="padding:30px 28px 8px;text-align:center">
          ${logo}
          <div style="font-size:16px;font-weight:700;color:${INK};letter-spacing:-0.01em">${escapeHtml(branding.companyName)}</div>
        </td></tr>
        <tr><td style="padding:14px 28px 30px">
          <h1 style="margin:10px 0 0;font-size:21px;line-height:1.3;font-weight:700;color:${INK};letter-spacing:-0.015em">${escapeHtml(body.headline)}</h1>
          ${body.paragraphs
            .map(
              (text) =>
                `<p style="margin:13px 0 0;font-size:15px;line-height:1.6;color:${MUTED}">${escapeHtml(text)}</p>`,
            )
            .join('')}
          ${facts}
          ${action}
          ${
            body.footnote
              ? `<p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${MUTED};text-align:center">${escapeHtml(body.footnote)}</p>`
              : ''
          }
        </td></tr>
        ${
          contact
            ? `<tr><td style="padding:16px 28px;background:${GROUND};text-align:center;font-size:12px;line-height:1.6;color:${MUTED}">${contact}</td></tr>`
            : ''
        }
      </table>
      <div style="max-width:560px;margin:14px auto 0;font-size:11px;color:#8b94a3;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
        Powered by ${escapeHtml(platform.productName)}
      </div>
    </td></tr>
  </table>
</body></html>`
}

/**
 * The plain-text alternative.
 *
 * Not an afterthought: some clients show it, some people prefer it, and a
 * message with no text part is more likely to be filtered as spam.
 */
export function renderEmailText(branding: SenderBranding, body: EmailBody): string {
  const platform = platformBranding()
  const lines = [branding.companyName, '', body.headline, '', ...body.paragraphs]

  if (body.facts?.length) {
    lines.push('')
    for (const fact of body.facts) lines.push(`${fact.label}: ${fact.value}`)
  }
  if (body.action) {
    lines.push('', body.action.label + ':', body.action.url)
  }
  if (body.footnote) lines.push('', body.footnote)

  const contact = [branding.companyPhone, branding.companyWebsite, ...branding.addressLines].filter(
    Boolean,
  )
  if (contact.length) lines.push('', ...contact.map((line) => String(line)))

  lines.push('', `Powered by ${platform.productName}`)
  return lines.join('\n')
}
