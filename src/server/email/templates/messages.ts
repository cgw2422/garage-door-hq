import type { MessageType } from '@prisma/client'
import type { SenderBranding } from '../branding'
import { platformBranding } from '../branding'
import { renderEmailHtml, renderEmailText, type EmailBody } from './layout'

/**
 * Every message the product can send, in one place.
 *
 * Each entry turns typed inputs into a subject and a body. Wording lives here
 * rather than at the call site so the tone stays consistent and so a company's
 * own template override has exactly one thing to replace.
 */

export interface RenderedMessage {
  subject: string
  html: string
  text: string
}

function render(branding: SenderBranding, subject: string, body: EmailBody): RenderedMessage {
  return {
    subject,
    html: renderEmailHtml(branding, body),
    text: renderEmailText(branding, body),
  }
}

export interface EstimateLinkInput {
  customerFirstName: string | null
  estimateNumber: string
  totalLabel: string | null
  url: string
  expiresLabel: string | null
}

export function estimateLinkMessage(
  branding: SenderBranding,
  input: EstimateLinkInput,
): RenderedMessage {
  const greeting = input.customerFirstName ? `Hi ${input.customerFirstName},` : 'Hi,'
  return render(branding, `Your estimate from ${branding.companyName} is ready`, {
    headline: 'Your estimate is ready.',
    paragraphs: [
      greeting,
      `${branding.companyName} has prepared estimate ${input.estimateNumber} for you. Open it to see your options, choose the one you want, and approve it — no account needed.`,
    ],
    facts: input.totalLabel
      ? [
          { label: 'Estimate', value: input.estimateNumber },
          { label: 'Recommended option', value: input.totalLabel },
        ]
      : [{ label: 'Estimate', value: input.estimateNumber }],
    action: { label: 'View Estimate', url: input.url },
    footnote: input.expiresLabel
      ? `This private link is just for you and expires ${input.expiresLabel}.`
      : 'This private link is just for you.',
  })
}

export interface InvoiceLinkInput {
  customerFirstName: string | null
  invoiceNumber: string
  balanceLabel: string
  dueLabel: string | null
  url: string
  payable: boolean
}

export function invoiceLinkMessage(
  branding: SenderBranding,
  input: InvoiceLinkInput,
): RenderedMessage {
  const greeting = input.customerFirstName ? `Hi ${input.customerFirstName},` : 'Hi,'
  return render(branding, `Your invoice from ${branding.companyName} is ready`, {
    headline: `Your invoice from ${branding.companyName} is ready.`,
    paragraphs: [
      greeting,
      input.payable
        ? 'You can view the details and pay online using the button below.'
        : 'You can view the details using the button below.',
    ],
    facts: [
      { label: 'Invoice', value: input.invoiceNumber },
      { label: 'Amount due', value: input.balanceLabel },
      ...(input.dueLabel ? [{ label: 'Due', value: input.dueLabel }] : []),
    ],
    action: { label: input.payable ? 'View & Pay Invoice' : 'View Invoice', url: input.url },
    footnote: 'This private link is just for you.',
  })
}

export interface PaymentReceiptInput {
  customerFirstName: string | null
  invoiceNumber: string
  amountLabel: string
  methodLabel: string
  paidOnLabel: string
  balanceLabel: string
  url: string | null
}

export function paymentReceiptMessage(
  branding: SenderBranding,
  input: PaymentReceiptInput,
): RenderedMessage {
  const greeting = input.customerFirstName ? `Hi ${input.customerFirstName},` : 'Hi,'
  return render(branding, `Receipt from ${branding.companyName} — ${input.amountLabel}`, {
    headline: 'Thank you — your payment came through.',
    paragraphs: [greeting, `${branding.companyName} has recorded your payment. Keep this as your receipt.`],
    facts: [
      { label: 'Invoice', value: input.invoiceNumber },
      { label: 'Paid', value: input.amountLabel },
      { label: 'Method', value: input.methodLabel },
      { label: 'Date', value: input.paidOnLabel },
      { label: 'Remaining balance', value: input.balanceLabel },
    ],
    action: input.url ? { label: 'View Invoice', url: input.url } : null,
  })
}

export interface ReviewRequestInput {
  customerFirstName: string | null
  url: string
  /** The company's own wording, when they have set some. */
  customSubject: string | null
  customBody: string | null
}

export function reviewRequestMessage(
  branding: SenderBranding,
  input: ReviewRequestInput,
): RenderedMessage {
  const greeting = input.customerFirstName ? `Hi ${input.customerFirstName},` : 'Hi,'
  const subject = input.customSubject?.trim() || `How did we do? — ${branding.companyName}`
  const bodyText =
    input.customBody?.trim() ||
    `Thanks for choosing ${branding.companyName}. If we did right by you, a short review helps other homeowners find us — it takes about a minute.`

  return render(branding, subject, {
    headline: 'How did we do?',
    paragraphs: [greeting, bodyText],
    action: { label: 'Leave a Review', url: input.url },
  })
}

export interface TeamInvitationInput {
  inviterName: string | null
  roleLabel: string
  url: string
  expiresLabel: string
}

export function teamInvitationMessage(
  branding: SenderBranding,
  input: TeamInvitationInput,
): RenderedMessage {
  const platform = platformBranding()
  return render(branding, `You've been invited to join ${branding.companyName}`, {
    headline: `You've been invited to join ${branding.companyName} on ${platform.productName}.`,
    paragraphs: [
      input.inviterName
        ? `${input.inviterName} has added you to the team at ${branding.companyName}.`
        : `You have been added to the team at ${branding.companyName}.`,
      `You'll join as ${input.roleLabel}. Accept the invitation to set your password and get started.`,
    ],
    action: { label: 'Accept Invitation', url: input.url },
    footnote: `This invitation expires ${input.expiresLabel}. If you weren't expecting it, you can ignore this email.`,
  })
}

export interface AppointmentConfirmationInput {
  customerFirstName: string | null
  whenLabel: string
  addressLine: string
  jobTypeName: string | null
  technicianName: string | null
  url: string | null
}

export function appointmentConfirmationMessage(
  branding: SenderBranding,
  input: AppointmentConfirmationInput,
): RenderedMessage {
  const greeting = input.customerFirstName ? `Hi ${input.customerFirstName},` : 'Hi,'
  return render(branding, `Your appointment with ${branding.companyName} is confirmed`, {
    headline: 'Your appointment is confirmed.',
    paragraphs: [greeting, `${branding.companyName} has you booked in. Here are the details.`],
    facts: [
      { label: 'When', value: input.whenLabel },
      { label: 'Where', value: input.addressLine },
      ...(input.jobTypeName ? [{ label: 'Service', value: input.jobTypeName }] : []),
      ...(input.technicianName ? [{ label: 'Technician', value: input.technicianName }] : []),
    ],
    action: input.url ? { label: 'View Details', url: input.url } : null,
    footnote: branding.companyPhone
      ? `Need to change it? Call ${branding.companyPhone}.`
      : 'Reply to this email if you need to change it.',
  })
}

/**
 * A password reset is genuinely from the platform: the recipient is a Garage
 * Door HQ user, not a garage door company's customer. It is the one message
 * that does not wear a company's branding.
 */
export function passwordResetMessage(input: { url: string; expiresLabel: string }): RenderedMessage {
  const platform = platformBranding()
  const branding: SenderBranding = {
    companyName: platform.productName,
    replyToEmail: platform.supportEmail,
    companyPhone: null,
    companyWebsite: null,
    logoUrl: null,
    addressLines: [],
  }
  return render(branding, `Reset your ${platform.productName} password`, {
    headline: 'Reset your password.',
    paragraphs: [
      'We received a request to reset the password on this account. Choose a new one using the button below.',
      "If you didn't ask for this, nothing has changed and you can ignore this email.",
    ],
    action: { label: 'Choose a New Password', url: input.url },
    footnote: `This link expires ${input.expiresLabel} and can only be used once.`,
  })
}

/** Human labels, used in the communication timeline and in send buttons. */
export const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  TEAM_INVITATION: 'Team invitation',
  PASSWORD_RESET: 'Password reset',
  ESTIMATE_LINK: 'Estimate',
  INVOICE_LINK: 'Invoice',
  PAYMENT_RECEIPT: 'Payment receipt',
  REVIEW_REQUEST: 'Review request',
  APPOINTMENT_CONFIRMATION: 'Appointment confirmation',
  APPOINTMENT_REMINDER: 'Appointment reminder',
  GENERAL: 'Message',
}
