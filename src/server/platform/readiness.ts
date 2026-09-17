import { prisma } from '@/lib/db'
import { appBaseUrlUnchecked } from '@/lib/app-url'
import { environment, type DeployEnvironment } from '@/lib/environment'
import { authSecretConfigured } from '@/lib/readiness'
import { email } from '@/server/email'
import { readStripeConfigFromEnv } from '@/server/billing/stripe'
import { storageDriverName } from '@/server/storage'

/**
 * Is Garage Door HQ's own infrastructure actually plugged in?
 *
 * Every question here is answered with presence, never with a value. Whether
 * `STRIPE_SECRET_KEY` is set is operationally useful and safe to look at on a
 * screen; what it is, is not. So nothing in this file returns a key, a URL, a
 * secret or a connection string, and nothing formats one for display — the
 * types make that awkward rather than relying on the screen to remember.
 *
 * The one exception is deliberate and narrow: the *mode* of the Stripe key
 * (test or live) is derived from its prefix. That is exactly the thing an
 * operator needs to see at a glance — "production is in test mode" is a
 * two-line explanation for why no money has arrived — and a prefix is not a
 * credential.
 */

export type Health = 'ok' | 'missing' | 'wrong' | 'unknown' | 'not applicable'

export interface Check {
  /** What is being checked, in the words an operator would use. */
  label: string
  health: Health
  /** One line. Names the variable to set, never its value. */
  detail: string
  /** The environment variables involved, by name. */
  variables?: string[]
}

export interface SystemReadiness {
  environment: {
    name: DeployEnvironment
    declared: boolean
    /** Drives the chip's tone: production looks different from the rest. */
    isProductionLike: boolean
  }
  release: {
    /** Short commit sha of the running build, when the platform provides one. */
    commit: string | null
    /** When this build was made, when the platform provides it. */
    builtAt: string | null
    /** Railway's own deployment id, for matching a screen to a deploy. */
    deploymentId: string | null
    startedAt: string
  }
  checks: Check[]
  /** False when anything required for real customers is missing. */
  ready: boolean
}

/** When this process started, which is a decent proxy for "deployed at". */
const BOOTED_AT = new Date().toISOString()

function firstEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return null
}

async function databaseCheck(): Promise<Check> {
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    return {
      label: 'Database',
      health: 'missing',
      detail: 'Cannot be reached. Check DATABASE_URL points at a running Postgres.',
      variables: ['DATABASE_URL'],
    }
  }

  // A rough shape check, so "connected" does not quietly mean "connected to an
  // empty database somebody just created".
  const organizations = await prisma.organization.count()
  return {
    label: 'Database',
    health: 'ok',
    detail:
      organizations === 0
        ? 'Connected. No companies yet.'
        : `Connected. ${organizations} ${organizations === 1 ? 'company' : 'companies'}.`,
    variables: ['DATABASE_URL'],
  }
}

/**
 * Where this deployment thinks it lives.
 *
 * Every link that leaves the building is built from this — estimates,
 * invitations, password resets, the page Stripe returns to — so a localhost
 * value on a deployment does not break anything visibly; it emails customers a
 * link to their own machine.
 */
function publicAddressCheck(isProduction: boolean): Check {
  const url = appBaseUrlUnchecked()
  const loopback = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/.test(url)

  return {
    label: 'Public address',
    health: loopback ? (isProduction ? 'wrong' : 'unknown') : 'ok',
    detail: loopback
      ? isProduction
        ? 'Still points at this machine. Every customer link would be unusable.'
        : 'Points at this machine, which is expected when running locally.'
      : 'Set, so customer links and emails point at the right host.',
    variables: ['APP_URL', 'NEXT_PUBLIC_APP_URL'],
  }
}

function storageCheck(isProduction: boolean): Check {
  const driver = storageDriverName()
  if (driver === 'r2') {
    return {
      label: 'Object storage (Cloudflare R2)',
      health: 'ok',
      detail: 'Photos and signatures go to R2.',
      variables: ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'],
    }
  }
  return {
    label: 'Object storage (Cloudflare R2)',
    health: isProduction ? 'wrong' : 'missing',
    detail: isProduction
      ? 'Using local disk. Photos will not survive a redeploy — set the R2 variables.'
      : 'Using local disk, which is fine here. Set the R2 variables to test the real thing.',
    variables: ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'],
  }
}

function emailChecks(isProduction: boolean): Check[] {
  const driver = email()
  const provider = firstEnv('RESEND_API_KEY') ? 'Resend' : firstEnv('POSTMARK_SERVER_TOKEN') ? 'Postmark' : null

  const sending: Check = provider
    ? {
        label: 'Email provider',
        health: 'ok',
        detail: `${provider} is connected.`,
        variables: ['RESEND_API_KEY', 'POSTMARK_SERVER_TOKEN', 'EMAIL_FROM'],
      }
    : {
        label: 'Email provider',
        health: isProduction ? 'wrong' : 'missing',
        detail: isProduction
          ? 'Not connected. Customers will not receive their estimates or invoices.'
          : `Not connected (${driver.name} driver). Messages are logged, not sent.`,
        variables: ['RESEND_API_KEY', 'POSTMARK_SERVER_TOKEN', 'EMAIL_FROM'],
      }

  // The safeguard that keeps staging away from real homeowners.
  const redirect = firstEnv('STAGING_EMAIL_REDIRECT_TO')
  const allowlist = firstEnv('STAGING_EMAIL_ALLOWLIST')
  const guard: Check = isProduction
    ? {
        label: 'Outbound email guard',
        health: 'not applicable',
        detail: 'Production sends to real customers, as it should.',
      }
    : {
        label: 'Outbound email guard',
        health: 'ok',
        detail: redirect
          ? 'Everything is redirected to one test mailbox.'
          : allowlist
            ? 'Only allowlisted addresses can receive mail.'
            : 'Nothing can leave this deployment. Set a redirect or an allowlist to test email.',
        variables: ['STAGING_EMAIL_REDIRECT_TO', 'STAGING_EMAIL_ALLOWLIST'],
      }

  return [sending, guard]
}

function stripeChecks(isProduction: boolean): Check[] {
  /*
   * Reading the Stripe config *enforces* the key-mode rule: a live key outside
   * production throws, which is right everywhere except here. This page's job
   * is to report that misconfiguration, not to fall over because of it — a
   * status screen that crashes on the exact fault it exists to surface is
   * worse than no status screen.
   *
   * The message is safe to show: it names the environment and the shape of the
   * key, never the key.
   */
  let config: ReturnType<typeof readStripeConfigFromEnv>
  try {
    config = readStripeConfigFromEnv()
  } catch (error) {
    return [
      {
        label: 'Stripe Billing',
        health: 'wrong',
        detail:
          error instanceof Error
            ? error.message
            : 'Configured with a key this environment refuses.',
        variables: ['STRIPE_SECRET_KEY'],
      },
      {
        label: 'Stripe webhook',
        health: 'unknown',
        detail: 'Cannot be checked while the Stripe key is refused.',
        variables: ['STRIPE_WEBHOOK_SECRET'],
      },
      {
        label: 'Stripe Connect (customer payments)',
        health: 'unknown',
        detail: 'Cannot be checked while the Stripe key is refused.',
        variables: ['STRIPE_CONNECT_WEBHOOK_SECRET'],
      },
    ]
  }

  if (!config) {
    return [
      {
        label: 'Stripe Billing',
        health: isProduction ? 'wrong' : 'missing',
        detail: isProduction
          ? 'Not connected. Nobody can subscribe and no revenue is being collected.'
          : 'Not connected. Billing screens say so; trials still work.',
        variables: ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID_STANDARD'],
      },
      {
        label: 'Stripe webhook',
        health: 'missing',
        detail: 'Cannot be checked until Stripe is connected.',
        variables: ['STRIPE_WEBHOOK_SECRET'],
      },
      {
        label: 'Stripe Connect (customer payments)',
        health: 'missing',
        detail: 'Cannot be checked until Stripe is connected.',
        variables: ['STRIPE_CONNECT_WEBHOOK_SECRET'],
      },
    ]
  }

  // The prefix, not the key. "Production is in test mode" is the single most
  // useful thing this page can tell an operator, and it is not a secret.
  const live = config.secretKey.startsWith('sk_live_') || config.secretKey.startsWith('rk_live_')
  const modeMatches = live === isProduction

  const billing: Check = {
    label: 'Stripe Billing',
    health: !config.priceId ? 'missing' : modeMatches ? 'ok' : 'wrong',
    detail: !config.priceId
      ? `Connected in ${live ? 'live' : 'test'} mode, but no $39.99 price is set.`
      : modeMatches
        ? `Connected in ${live ? 'live' : 'test'} mode, with a price configured.`
        : live
          ? 'A LIVE key is configured outside production. Real cards would be charged.'
          : 'Production is in TEST mode. No real payment will be taken.',
    variables: ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID_STANDARD'],
  }

  const webhook: Check = {
    label: 'Stripe webhook',
    health: config.webhookSecret ? 'ok' : 'missing',
    detail: config.webhookSecret
      ? 'Signing secret is set, so subscription changes are verified and applied.'
      : 'No signing secret. The endpoint refuses every delivery, so subscriptions will not update.',
    variables: ['STRIPE_WEBHOOK_SECRET'],
  }

  const connect: Check = {
    label: 'Stripe Connect (customer payments)',
    health: config.connectWebhookSecret ? 'ok' : 'missing',
    detail: config.connectWebhookSecret
      ? 'Signing secret is set, so a customer paying an invoice settles correctly.'
      : 'No signing secret. A customer could pay and the invoice would never be marked paid.',
    variables: ['STRIPE_CONNECT_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET'],
  }

  return [billing, webhook, connect]
}

/**
 * Backups, as far as this process can honestly tell.
 *
 * Railway's scheduled backups are a platform setting with no API this
 * application can read, so claiming "backups: ok" from in here would be a lie
 * dressed as a status light. Instead the operator records what they configured
 * in `BACKUP_SCHEDULE` and `BACKUP_LAST_VERIFIED_RESTORE` (a date), and this
 * reports that — including saying plainly when nothing has been recorded, and
 * when the last verified restore is old enough to be worth repeating.
 */
function backupCheck(isProduction: boolean): Check {
  const schedule = firstEnv('BACKUP_SCHEDULE')
  const lastRestore = firstEnv('BACKUP_LAST_VERIFIED_RESTORE')

  if (!schedule) {
    return {
      label: 'Backups',
      health: isProduction ? 'wrong' : 'unknown',
      detail: isProduction
        ? 'Nothing recorded. Turn on Railway backups, then set BACKUP_SCHEDULE to what you configured.'
        : 'Nothing recorded, which is fine outside production.',
      variables: ['BACKUP_SCHEDULE', 'BACKUP_LAST_VERIFIED_RESTORE'],
    }
  }

  if (!lastRestore) {
    return {
      label: 'Backups',
      health: 'wrong',
      detail: `${schedule}, but no restore has been verified. A backup nobody has restored is a hypothesis.`,
      variables: ['BACKUP_LAST_VERIFIED_RESTORE'],
    }
  }

  const verified = new Date(lastRestore)
  if (Number.isNaN(verified.getTime())) {
    return {
      label: 'Backups',
      health: 'unknown',
      detail: `${schedule}. BACKUP_LAST_VERIFIED_RESTORE is not a date this can read (use YYYY-MM-DD).`,
      variables: ['BACKUP_LAST_VERIFIED_RESTORE'],
    }
  }

  const days = Math.floor((Date.now() - verified.getTime()) / 86_400_000)
  return {
    label: 'Backups',
    health: days > 120 ? 'wrong' : 'ok',
    detail:
      days > 120
        ? `${schedule}. Last verified restore was ${days} days ago — time to do another.`
        : `${schedule}. Last verified restore ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}.`,
    variables: ['BACKUP_SCHEDULE', 'BACKUP_LAST_VERIFIED_RESTORE'],
  }
}

/**
 * Everything at once.
 *
 * `ready` means "nothing required for real customers is missing", which is
 * deliberately stricter than "the app boots": a production deployment with no
 * email provider boots perfectly and cannot send anybody their estimate.
 */
export async function systemReadiness(): Promise<SystemReadiness> {
  const env = environment()
  const isProduction = env.isProduction

  const checks: Check[] = [
    await databaseCheck(),
    {
      label: 'Sign-in secret',
      health: authSecretConfigured() ? 'ok' : 'missing',
      detail: authSecretConfigured()
        ? 'Set, so sessions can be signed.'
        : 'Not set. Nobody can sign in. Note the name is AUTH_SECRET, not NEXTAUTH_SECRET.',
      variables: ['AUTH_SECRET'],
    },
    publicAddressCheck(isProduction),
    storageCheck(isProduction),
    ...emailChecks(isProduction),
    ...stripeChecks(isProduction),
    backupCheck(isProduction),
  ]

  return {
    environment: { name: env.name, declared: env.declared, isProductionLike: isProduction },
    release: {
      commit:
        firstEnv('RAILWAY_GIT_COMMIT_SHA', 'VERCEL_GIT_COMMIT_SHA', 'GIT_COMMIT_SHA')?.slice(0, 7) ??
        null,
      builtAt: firstEnv('BUILD_TIME') ?? null,
      deploymentId: firstEnv('RAILWAY_DEPLOYMENT_ID') ?? null,
      startedAt: BOOTED_AT,
    },
    checks,
    ready: !checks.some((check) => check.health === 'wrong' || check.health === 'missing'),
  }
}
