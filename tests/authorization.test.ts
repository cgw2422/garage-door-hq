import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PERMISSIONS, roleCan, type Permission } from '@/lib/rbac'
import type { OrgRole } from '@prisma/client'

/**
 * A regression scan over the surface an attacker can actually reach.
 *
 * Every server action and every route handler is an unauthenticated HTTP
 * endpoint until something in its body says otherwise. It is easy to add one
 * and forget the gate, and no workflow test would notice — so this walks the
 * source and insists each one opens with a check.
 *
 * Anything deliberately public is listed below with the reason. The list is
 * the review surface: adding to it is a decision, forgetting a gate is not.
 */

const APP_DIR = join(process.cwd(), 'src', 'app')

/** Functions that establish who is asking before anything else happens. */
const AUTH_GATES = [
  'requireSession',
  'requirePermission',
  'requirePlatformStaff',
  'requireUser',
  // The subscription gate calls requirePermission underneath, so it is a
  // strictly stronger check, not a way around one.
  'requireActiveSubscription',
  'getSession',
  'getAuthenticatedUser',
  'auth(',
]

/**
 * Endpoints that must work for someone with no account, each with the reason
 * and the control that stands in for a session.
 */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  'src/app/(auth)/login/actions.ts':
    'Signing in. Rate limited by address and by email.',
  'src/app/(auth)/signup/actions.ts':
    'Creating the first account. Rate limited by address.',
  'src/app/(portal)/p/actions.ts':
    'The customer has no account; the opaque single-document token is the credential.',
  'src/app/api/auth/[...nextauth]/route.ts':
    'Auth.js own handler; it is the thing that authenticates.',
  'src/app/api/p/e/[token]/pdf/route.ts':
    'Customer estimate PDF, reached only through the opaque token.',
  'src/app/api/p/i/[token]/pdf/route.ts':
    'Customer invoice PDF, reached only through the opaque token.',
  'src/app/api/files/upload/[token]/route.ts':
    'Local-disk development upload target; the HMAC-signed token is the credential.',
  'src/app/api/admin/seed-demo/route.ts':
    'Loading the demo company, for an operator who has an empty database and therefore no account to authenticate as. The credential is an operator-set token; the route 404s when it is unset or too short, is rate limited, adds one tenant, refuses if that tenant exists, and can neither read nor delete anything.',
  'src/app/api/health/route.ts':
    'Whether the deployment is finished. Unauthenticated because the failure it explains is one where nobody can sign in; it reports presence only — never a key, a URL or a value.',
  'src/app/api/webhooks/stripe/route.ts':
    'Stripe has no session. Authenticated by its signature over the exact request bytes, which is verified before the body is parsed as anything.',
}

/**
 * Individual actions in otherwise gated files that must work without a
 * session, each with the reason.
 */
const PUBLIC_ACTIONS: Record<string, string> = {
  'src/app/(app)/settings/team/actions.ts: acceptInvitationAction':
    'The invitee has no account yet; the emailed token is the credential, and guessing is rate limited.',
  'src/app/(app)/more/actions.ts: signOutAction':
    'Ending a session protects nothing; a caller with no session simply has nothing to end.',
  'src/app/(account)/account/actions.ts: signOutAction':
    'The same, for the account screen. Platform staff cannot reach (app)/more, so without this one they had no way to sign out at all.',
  'src/app/(auth)/forgot/actions.ts: requestResetAction':
    'Asking for a reset link needs no account, by definition. Rate limited by address and by mailbox, and it answers identically whether or not the address exists.',
  'src/app/(portal)/p/actions.ts: portalStartPaymentAction':
    'The customer paying an invoice has no account; the opaque single-document token is the credential.',
  'src/app/(auth)/reset/[token]/actions.ts: completeResetAction':
    'Someone who has forgotten their password cannot be signed in. The single-use hashed reset token is the credential, guessing it is rate limited, and using it invalidates every session the account had.',
  'src/app/(present)/present/actions.ts: signInPresentationAction':
    'The customer signing on the technician\u2019s handed-over device is not the technician, and the technician\u2019s session is deliberately suspended for the duration. The credential is the short-lived presentation token in its own cookie, which names exactly one estimate; the estimate id comes from that row rather than from the form, so a tampered payload can only ever sign what is on screen.',
  'src/app/(present)/present/actions.ts: endPresentationAction':
    'Ending a presentation cannot require the session it suspends. It is gated on the technician\u2019s own password, verified against the user named by the presentation row, and rate limited so a device left with someone patient cannot be guessed into.',
}

function walk(dir: string, matcher: (path: string) => boolean): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...walk(full, matcher))
    } else if (matcher(full)) {
      found.push(full)
    }
  }
  return found
}

function sourceFiles(matcher: (path: string) => boolean) {
  return walk(APP_DIR, matcher).map((path) => ({
    path: relative(process.cwd(), path).replaceAll('\\', '/'),
    source: readFileSync(path, 'utf8'),
  }))
}

/** Exported async functions, which is what a server action compiles to. */
function exportedFunctions(source: string): string[] {
  return [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(
    (match) => match[1]!,
  )
}

/** The body of one exported function, up to the next top-level export. */
function bodyOf(source: string, name: string): string {
  const start = source.search(
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`),
  )
  if (start === -1) return ''
  const rest = source.slice(start + 1)
  const next = rest.search(/\nexport\s+(?:async\s+)?(?:function|const)\s/)
  return next === -1 ? rest : rest.slice(0, next)
}

function hasGate(body: string): boolean {
  return AUTH_GATES.some((gate) => body.includes(gate))
}

describe('server actions', () => {
  const files = sourceFiles((path) => path.endsWith('/actions.ts'))

  it('finds the action files to check', () => {
    expect(files.length).toBeGreaterThan(15)
  })

  it('checks who is asking before doing anything', () => {
    const ungated: string[] = []

    for (const file of files) {
      if (file.path in PUBLIC_BY_DESIGN) continue
      for (const name of exportedFunctions(file.source)) {
        const label = `${file.path}: ${name}`
        if (label in PUBLIC_ACTIONS) continue
        if (!hasGate(bodyOf(file.source, name))) ungated.push(label)
      }
    }

    expect(ungated).toEqual([])
  })

  it('rate limits everything reachable without an account', () => {
    // Signing in is limited inside the credentials provider rather than in the
    // action, because that is the one path every sign-in attempt must take.
    const authorize = readFileSync(join(process.cwd(), 'src/lib/auth.ts'), 'utf8')
    expect(authorize).toMatch(/consumeRateLimit\('login'/)
    expect(authorize).toContain('ip:')
    expect(authorize).toContain('email:')

    const gatedElsewhere = [
      'src/app/(auth)/signup/actions.ts',
      'src/app/(portal)/p/actions.ts',
      'src/app/api/p/e/[token]/pdf/route.ts',
      'src/app/api/p/i/[token]/pdf/route.ts',
    ]
    for (const path of gatedElsewhere) {
      const source = readFileSync(join(process.cwd(), path), 'utf8')
      expect(source, `${path} is public and must be rate limited`).toMatch(
        /consumeRateLimit|enforceRateLimit/,
      )
    }

    const team = readFileSync(
      join(process.cwd(), 'src/app/(app)/settings/team/actions.ts'),
      'utf8',
    )
    expect(bodyOf(team, 'acceptInvitationAction')).toMatch(
      /consumeRateLimit|enforceRateLimit/,
    )
  })

  it('lists a reason for every deliberately public endpoint', () => {
    for (const reason of [
      ...Object.values(PUBLIC_BY_DESIGN),
      ...Object.values(PUBLIC_ACTIONS),
    ]) {
      expect(reason.length).toBeGreaterThan(20)
    }
  })
})

describe('route handlers', () => {
  const files = sourceFiles((path) => path.endsWith('/route.ts'))

  it('finds the route handlers to check', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('checks who is asking before serving a file or a document', () => {
    const ungated: string[] = []

    for (const file of files) {
      if (file.path in PUBLIC_BY_DESIGN) continue
      if (!hasGate(file.source)) ungated.push(file.path)
    }

    expect(ungated).toEqual([])
  })

  it('never serves an object straight from storage by a caller-supplied key', () => {
    // Reads are brokered: the handler resolves the row through the tenant
    // client and only then asks storage for the key it found.
    for (const file of files) {
      expect(
        /params.*\bkey\b/.test(file.source) && file.source.includes('storage.get'),
        `${file.path} looks like it reads a caller-supplied storage key`,
      ).toBe(false)
    }
  })
})

describe('the permission table', () => {
  const permissions = Object.keys(PERMISSIONS) as Permission[]

  it('gives the owner everything', () => {
    for (const permission of permissions) {
      expect(roleCan('OWNER', permission), `OWNER should have ${permission}`).toBe(true)
    }
  })

  it('grants the office everything it needs and nothing that sets policy', () => {
    for (const permission of ['customer:write', 'invoice:write', 'schedule:assign'] as const) {
      expect(roleCan('OFFICE', permission), `OFFICE should have ${permission}`).toBe(true)
    }
    for (const permission of [
      'settings:manage',
      'team:manage',
      'pricebook:write',
      'reports:financial',
      'subscription:manage',
    ] as const) {
      expect(roleCan('OFFICE', permission), `OFFICE should not have ${permission}`).toBe(
        false,
      )
    }
  })

  it('keeps money, settings and the team away from technicians', () => {
    for (const permission of [
      'settings:manage',
      'team:manage',
      'team:read',
      'reports:financial',
      'pricebook:write',
      'invoice:void',
      'payment:refund',
      'subscription:manage',
    ] as const) {
      expect(roleCan('TECHNICIAN', permission), `TECHNICIAN has ${permission}`).toBe(false)
    }
  })

  it('reserves the subscription for the owner alone', () => {
    for (const role of ['ADMIN', 'OFFICE', 'TECHNICIAN'] as OrgRole[]) {
      expect(roleCan(role, 'subscription:manage')).toBe(false)
    }
    expect(roleCan('OWNER', 'subscription:manage')).toBe(true)
  })

  it('grants nothing to a role that is not in the table', () => {
    for (const permission of permissions) {
      expect(roleCan('NOT_A_ROLE' as OrgRole, permission)).toBe(false)
    }
  })

  it('never lets a write imply itself without the matching read', () => {
    const reads = permissions.filter((permission) => permission.endsWith(':read'))
    for (const read of reads) {
      const subject = read.split(':')[0]!
      const write = permissions.find((permission) => permission === `${subject}:write`)
      if (!write) continue
      for (const role of ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN'] as OrgRole[]) {
        if (roleCan(role, write)) {
          expect(roleCan(role, read), `${role} can ${write} but not ${read}`).toBe(true)
        }
      }
    }
  })
})
