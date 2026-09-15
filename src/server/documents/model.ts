/**
 * The shape a PDF is rendered from.
 *
 * Two sources produce it, and which one is used is the whole point of this
 * file:
 *
 *   - A sent or signed estimate renders from its frozen `EstimateVersion`
 *     snapshot. Prices, wording and totals come out exactly as the customer saw
 *     them, no matter what has changed in the price book since.
 *   - A draft renders from live rows, and is stamped DRAFT so nobody mistakes
 *     it for something that was agreed.
 *
 * Invoice lines are already snapshots taken at completion, so an invoice PDF
 * renders from its own rows.
 */

export interface DocumentParty {
  name: string
  lines: string[]
  phone?: string | null
  email?: string | null
  website?: string | null
}

export interface DocumentLine {
  name: string
  description?: string | null
  sku?: string | null
  quantity: number
  unitPriceCents: number
  lineCents: number
  taxable: boolean
}

export interface DocumentOption {
  /** Null when the company is not selling this estimate as Good/Better/Best. */
  tier: string | null
  name: string
  description?: string | null
  isRecommended: boolean
  isSelected: boolean
  lines: DocumentLine[]
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
}

export interface DocumentSignature {
  signerName: string
  signedAt: string
  /** Data URI of the captured signature, embedded so the PDF stands alone. */
  imageDataUri: string | null
  documentHash: string | null
  versionNumber: number | null
}

export interface EstimateDocument {
  kind: 'estimate'
  number: string
  title: string
  issuedAt: string | null
  expiresAt: string | null
  status: string
  /** True when this was rendered from live rows rather than a frozen version. */
  isDraft: boolean
  versionNumber: number | null
  company: DocumentParty
  logoDataUri: string | null
  customer: DocumentParty
  serviceAddress: string[] | null
  doorLine: string | null
  jobReference: string | null
  customerMessage: string | null
  termsText: string | null
  taxRateBps: number
  options: DocumentOption[]
  signature: DocumentSignature | null
  currency: string
}

export interface DocumentPayment {
  method: string
  receivedAt: string
  amountCents: number
  reference: string | null
}

export interface InvoiceDocument {
  kind: 'invoice'
  number: string
  issuedAt: string | null
  dueAt: string | null
  status: string
  company: DocumentParty
  logoDataUri: string | null
  customer: DocumentParty
  serviceAddress: string[] | null
  doorLine: string | null
  jobReference: string | null
  estimateReference: string | null
  notesToCustomer: string | null
  termsText: string | null
  taxRateBps: number
  lines: DocumentLine[]
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
  paidCents: number
  balanceCents: number
  payments: DocumentPayment[]
  currency: string
}
