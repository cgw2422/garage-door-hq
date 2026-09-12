/**
 * Turning a thrown thing into a sentence.
 *
 * The rule: a user sees only wording this codebase wrote on purpose. Prisma
 * constraint text, Stripe's developer-facing messages, S3 keys, stack traces
 * and internal ids never reach a screen. Everything else is logged in full so
 * a real problem is still debuggable.
 *
 * Domain errors are recognised by name, from an explicit list. An allowlist
 * rather than a denylist, because the failure mode of guessing wrong is
 * leaking database internals to a garage door owner.
 */

/**
 * Errors this codebase raises deliberately, whose messages are written for the
 * person reading them.
 */
const DOMAIN_ERRORS = new Set([
  'BillingError',
  'BillingNotConfiguredError',
  'CompletionError',
  'ConnectError',
  'ContentTypeError',
  'EstimateError',
  'ForbiddenError',
  'InspectionError',
  'InventoryError',
  'InvoiceError',
  'LedgerError',
  'LogoError',
  'OnboardingError',
  'PasswordResetError',
  'PaymentError',
  'PhotoUploadError',
  'PlatformError',
  'PortalError',
  'PrefixError',
  'PriceBookError',
  'RateLimitError',
  'ReviewRequestError',
  'ScheduleError',
  'SignatureError',
  'SizingNotAvailableError',
  'StorageError',
  'SubscriptionRequiredError',
  'TeamError',
])

/**
 * Deliberately absent, and not an oversight:
 *
 * - `EmailConfigError` and `WebhookSignatureError` are operator problems. A
 *   garage door owner can do nothing with "signature verification failed", and
 *   a webhook caller must not learn why its signature was rejected.
 *
 * Anything raised here that is not on the list above gets the generic line.
 */

const GENERIC = 'Something went wrong. Try that again.'

/** Prisma error codes worth translating; anything else gets the generic line. */
const PRISMA_MESSAGES: Record<string, string> = {
  // Unique constraint. The field names are internal, so the message is not.
  P2002: 'That already exists. Check for a duplicate and try again.',
  // Foreign key constraint.
  P2003: 'Something this depends on is missing. Refresh the page and try again.',
  // Record not found for an update/delete.
  P2025: 'That record no longer exists. Refresh the page and try again.',
  // Value too long for the column.
  P2000: 'One of those values is too long.',
  // Transaction failed / write conflict.
  P2034: 'Two changes collided. Try that again.',
}

interface PrismaLikeError {
  code?: string
  name?: string
  message?: string
  meta?: unknown
}

function isPrismaError(error: unknown): error is PrismaLikeError {
  if (typeof error !== 'object' || error === null) return false
  const name = (error as { name?: string }).name ?? ''
  return name.startsWith('PrismaClient')
}

function isStripeError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const name = (error as { name?: string }).name ?? ''
  return name.startsWith('Stripe')
}

/**
 * The message to show. Always safe to render.
 *
 * `context` is a short label for the log line so a support question can be
 * traced back — "estimate.send", "billing.checkout".
 */
export function userMessage(error: unknown, context?: string): string {
  const label = context ? `[${context}] ` : ''

  if (error instanceof Error && DOMAIN_ERRORS.has(error.name)) {
    return error.message
  }

  if (isPrismaError(error)) {
    const code = error.code ?? ''
    console.error(`${label}database error ${code}: ${error.message ?? ''}`)
    return PRISMA_MESSAGES[code] ?? GENERIC
  }

  if (isStripeError(error)) {
    // Billing has its own mapping with card-decline wording; anything reaching
    // here bypassed it, so say nothing specific.
    console.error(`${label}payment provider error`, error)
    return 'Something went wrong with payments. Try again, or contact support.'
  }

  // Next.js control-flow "errors" must propagate, not be swallowed; callers
  // are expected to let them through. Reaching here means a real fault.
  console.error(`${label}unexpected error`, error)
  return GENERIC
}

/**
 * Next.js signals redirect and notFound by throwing. Swallowing those turns a
 * working redirect into a generic error message, so every catch block that
 * uses `userMessage` has to let them past first.
 */
export function isFrameworkControlFlow(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const digest = (error as { digest?: unknown }).digest
  return typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND')
}
