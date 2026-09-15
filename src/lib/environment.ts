/**
 * Which deployment this process is.
 *
 * Three environments, and the differences between them are not cosmetic:
 * production holds real garage door companies' customers, staging holds
 * whatever the last test left behind, and development holds nonsense. The
 * dangerous direction is always the same — something running against test data
 * reaching out and touching a real person: emailing a homeowner, charging a
 * card, asking for a review of a job that never happened.
 *
 * So this is one variable, read once, and everything that can reach the
 * outside world asks it first.
 *
 * ## Failing closed
 *
 * `APP_ENV` unset on a deployment does **not** mean production. It means
 * staging, because the cost of the two mistakes is not symmetric: a production
 * deployment that forgets the variable has its outbound email held back and
 * somebody notices within the hour, while a staging deployment that is treated
 * as production emails real customers from test data and nobody can take it
 * back. `/api/health` reports the environment and says loudly when it was
 * inferred rather than declared.
 */

export type DeployEnvironment = 'development' | 'staging' | 'production'

export interface EnvironmentInfo {
  name: DeployEnvironment
  /** True when `APP_ENV` said so, rather than this being inferred. */
  declared: boolean
  /** True only for the real thing. Every safeguard keys off this. */
  isProduction: boolean
  /** True when the UI must wear a banner saying so. */
  showsEnvironmentBanner: boolean
}

function read(): EnvironmentInfo {
  const raw = (process.env.APP_ENV ?? '').trim().toLowerCase()

  if (raw === 'production' || raw === 'staging' || raw === 'development') {
    return {
      name: raw,
      declared: true,
      isProduction: raw === 'production',
      showsEnvironmentBanner: raw !== 'production',
    }
  }

  // Nothing declared. A local `next dev` is obviously development; anything
  // built for deployment is treated as staging until it says otherwise.
  const inferred: DeployEnvironment =
    process.env.NODE_ENV === 'production' ? 'staging' : 'development'

  return {
    name: inferred,
    declared: false,
    isProduction: false,
    showsEnvironmentBanner: true,
  }
}

let cached: EnvironmentInfo | null = null

export function environment(): EnvironmentInfo {
  if (!cached) cached = read()
  return cached
}

/** Test seam: drop the memoized value so a changed variable takes effect. */
export function resetEnvironment() {
  cached = null
}

export function isProduction(): boolean {
  return environment().isProduction
}

export function environmentName(): DeployEnvironment {
  return environment().name
}

/** The word the banner, the tab title and the staging email subject all use. */
export function environmentLabel(): string {
  return environmentName().toUpperCase()
}

/**
 * Suffix for a page title, so a glance at a phone says which app this is.
 *
 * Empty on production — the real thing carries no badge, which is what makes
 * the badge mean something everywhere else.
 */
export function titleSuffix(): string {
  return environment().isProduction ? '' : ` — ${environmentLabel()}`
}

/**
 * Prefix for every object stored by this deployment.
 *
 * Staging and production are expected to use different buckets. This is the
 * second line: even pointed at the same bucket by mistake, their objects
 * cannot collide and a staging sweep cannot delete a production photo.
 */
export function storageNamespace(): string {
  return environment().name
}

export class ProductionSafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductionSafetyError'
  }
}

/**
 * Refuse an operation that must never run against real customer data.
 *
 * Used by the demo installer and anything else that creates, replaces or
 * deletes wholesale. The check is here rather than in each caller so the list
 * of such operations is greppable.
 */
export function assertNotProduction(operation: string): void {
  if (environment().isProduction) {
    throw new ProductionSafetyError(
      `${operation} is disabled on production. Run it against staging instead.`,
    )
  }
}

/**
 * Stripe keys carry their own mode in the prefix, so a mistake is detectable
 * rather than a matter of trusting the operator's memory.
 *
 * A live key on staging is the expensive version of this mistake: a test that
 * takes a real payment from a real card. It is refused outright rather than
 * warned about.
 */
export function assertStripeKeyMatchesEnvironment(secretKey: string | null | undefined): void {
  if (!secretKey) return
  const live = secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_')
  const test = secretKey.startsWith('sk_test_') || secretKey.startsWith('rk_test_')

  if (live && !isProduction()) {
    throw new ProductionSafetyError(
      `A live Stripe key is configured on ${environmentName()}. ` +
        'Use a test-mode key (sk_test_…) outside production.',
    )
  }
  if (test && isProduction()) {
    // Not a safety failure — nobody gets charged by accident — but it does mean
    // production is not taking money, which somebody needs to know about now.
    console.error(
      '[billing] Production is configured with a Stripe TEST key. No real payment will be taken.',
    )
  }
}
