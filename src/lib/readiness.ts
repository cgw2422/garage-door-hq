/**
 * Is this deployment actually finished?
 *
 * Two variables have to be right before anyone can sign in, and both fail in
 * ways that are hard to read from the outside: a missing `AUTH_SECRET` makes
 * Auth.js answer the sign-in callback with a raw JSON "problem with the server
 * configuration", and a missing `NEXT_PUBLIC_APP_URL` mails customers links to
 * localhost. Neither says which variable to set.
 *
 * So the answer lives here, in one place, and is reported three ways: as a
 * sentence on the sign-in screen, as a single operator line in the logs, and
 * as `/api/health` for whoever is looking at a dashboard rather than a
 * terminal.
 */

import { appBaseUrl } from './app-url'
import { environment, type DeployEnvironment } from './environment'

/** Shown to whoever is standing in front of a half-configured deployment. */
export const AUTH_NOT_CONFIGURED =
  'This site is not finished being set up, so signing in is not possible yet. ' +
  'Whoever deployed it needs to set AUTH_SECRET, then redeploy.'

/**
 * Auth.js reads `AUTH_SECRET` itself and refuses the whole request without it.
 * Note it is `AUTH_SECRET`, not `NEXTAUTH_SECRET`: the v4 name is ignored
 * silently, which looks identical to setting nothing at all.
 */
export function authSecretConfigured(): boolean {
  return (process.env.AUTH_SECRET ?? '').trim().length > 0
}

let warned = false

/** One line in the logs, once, naming the variable rather than the symptom. */
export function warnIfAuthUnconfigured(): void {
  if (warned || authSecretConfigured()) return
  warned = true
  console.error(
    '[auth] AUTH_SECRET is not set, so sign-in cannot work. Generate one with ' +
      '`openssl rand -base64 32` and set it on the deployment. Note the name is ' +
      'AUTH_SECRET, not NEXTAUTH_SECRET.',
  )
}

/** Test seam. */
export function resetReadinessWarning(): void {
  warned = false
}

export type CheckState = 'ok' | 'missing' | 'unreachable' | 'not configured'

export interface Readiness {
  /** False when something stops the product working at all. */
  ok: boolean
  /**
   * Which deployment answered. The first thing to check when a screenshot and
   * a database disagree, and the one field here that is worth watching: a
   * production environment reporting `declared: false` is one whose outbound
   * safeguards were inferred rather than configured.
   */
  environment: {
    name: DeployEnvironment
    declared: boolean
  }
  /** Required: without these, nobody can sign in or receive a link. */
  required: {
    database: CheckState
    authSecret: CheckState
    appUrl: CheckState
  }
  /**
   * Optional in the sense that the product runs without them and says so on
   * screen — a trial deployment with no Stripe account is a real state, not a
   * broken one.
   */
  optional: {
    storage: 'r2' | 'local'
    email: CheckState
    stripe: CheckState
  }
}

/**
 * Deliberately no values, ever — only whether each thing is present. This
 * endpoint is unauthenticated because the people who need it are locked out.
 */
export async function checkReadiness(
  pingDatabase: () => Promise<unknown>,
  emailConfigured: boolean,
  stripeIsConfigured: boolean,
  storageDriver: string,
): Promise<Readiness> {
  let database: CheckState = 'ok'
  try {
    await pingDatabase()
  } catch {
    database = 'unreachable'
  }

  let appUrl: CheckState = 'ok'
  try {
    appBaseUrl()
  } catch {
    appUrl = 'missing'
  }

  const required = {
    database,
    authSecret: authSecretConfigured() ? ('ok' as const) : ('missing' as const),
    appUrl,
  }

  const env = environment()

  return {
    ok: Object.values(required).every((state) => state === 'ok'),
    environment: { name: env.name, declared: env.declared },
    required,
    optional: {
      storage: storageDriver === 'r2' ? 'r2' : 'local',
      email: emailConfigured ? 'ok' : 'not configured',
      stripe: stripeIsConfigured ? 'ok' : 'not configured',
    },
  }
}
