import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { resetEnvironment, ProductionSafetyError, DEMO_UNLOCK_VARIABLE } from '@/lib/environment'
import {
  DEFAULT_DEMO_PASSWORD,
  DEMO_AFFILIATE_EMAIL,
  DEMO_LOGINS,
  DEMO_OWNER_EMAIL,
  DEMO_SLUG,
  DEMO_TECH_EMAIL,
  PLATFORM_ADMIN_EMAIL,
} from '@/server/demo/data'
import { installDemoData, removeDemoData } from '@/server/demo/install'
import { createTestCompany } from './helpers'

/**
 * The demo company living on production, on purpose.
 *
 * The operator wants a walkthrough they can give a prospect on the real
 * address rather than a staging URL. That is a reasonable thing to want, and
 * the dangerous way to get it is to clear `APP_ENV` for a minute — which
 * unlocks outbound email, inverts the Stripe mode check and changes the
 * storage namespace, all at once, on a deployment holding real companies.
 *
 * So there is one variable that permits one thing. These tests are about what
 * it still refuses to do once it is set, because "scoped to the demo company"
 * is a claim, and the database it runs against here has a real company in it.
 */

const ORIGINAL = { ...process.env }

function asProduction(options: { unlocked: boolean; password?: string }) {
  process.env.APP_ENV = 'production'
  process.env.DEMO_PASSWORD = options.password ?? 'a-password-the-operator-chose'
  if (options.unlocked) process.env[DEMO_UNLOCK_VARIABLE] = '1'
  else delete process.env[DEMO_UNLOCK_VARIABLE]
  resetEnvironment()
}

/**
 * Each test starts from "no demo company". These run against one database and
 * most of them install it, so without this the second test in a block meets
 * the first one's leftovers and reports a collision instead of what it came to
 * check.
 */
beforeEach(async () => {
  process.env = { ...ORIGINAL }
  process.env.APP_ENV = 'staging'
  resetEnvironment()
  await removeDemoData()

  // `removeDemoData` deliberately spares an account that belongs to another
  // company, which is the subject of one of the tests below — so after that
  // test the technician is still there and would block every later install.
  // Clearing it here is test housekeeping, not something the product does.
  await prisma.membership.deleteMany({ where: { user: { email: { in: DEMO_LOGINS } } } })
  await prisma.user.deleteMany({ where: { email: { in: DEMO_LOGINS } } })
  await prisma.referral.deleteMany({ where: { affiliate: { email: DEMO_AFFILIATE_EMAIL } } })
  await prisma.affiliate.deleteMany({ where: { email: DEMO_AFFILIATE_EMAIL } })

  process.env = { ...ORIGINAL }
  resetEnvironment()
})

afterEach(() => {
  process.env = { ...ORIGINAL }
  resetEnvironment()
})

/**
 * Hand the database back as it was found. These files share one Postgres
 * schema and run in sequence, so a demo company left installed here is a
 * collision in whichever file runs next.
 */
afterAll(async () => {
  process.env.APP_ENV = 'staging'
  resetEnvironment()
  await removeDemoData()
  await prisma.membership.deleteMany({ where: { user: { email: { in: DEMO_LOGINS } } } })
  await prisma.user.deleteMany({ where: { email: { in: DEMO_LOGINS } } })
  await prisma.user.deleteMany({ where: { email: PLATFORM_ADMIN_EMAIL } })
  process.env = { ...ORIGINAL }
  resetEnvironment()
})

describe('the production lock', () => {
  it('refuses to install without the unlock, and says which variable', async () => {
    asProduction({ unlocked: false })

    await expect(installDemoData()).rejects.toThrow(ProductionSafetyError)
    await expect(installDemoData()).rejects.toThrow(/ALLOW_DEMO_RESET/)
    expect(await prisma.organization.findUnique({ where: { slug: DEMO_SLUG } })).toBeNull()
  })

  it('refuses to delete without the unlock', async () => {
    asProduction({ unlocked: false })
    await expect(removeDemoData()).rejects.toThrow(ProductionSafetyError)
  })

  /** A typo is not consent. Only the exact value opens it. */
  it('is not opened by a truthy-looking value', async () => {
    asProduction({ unlocked: false })
    for (const value of ['true', 'yes', '0', 'ALLOW', ' ']) {
      process.env[DEMO_UNLOCK_VARIABLE] = value
      resetEnvironment()
      await expect(installDemoData(), value).rejects.toThrow(ProductionSafetyError)
    }
  })

  it('installs once unlocked', async () => {
    asProduction({ unlocked: true })

    const result = await installDemoData()
    expect(result.status).toBe('installed')
    expect(await prisma.organization.findUnique({ where: { slug: DEMO_SLUG } })).not.toBeNull()
  })
})

describe('a production reset, with a real company in the same database', () => {
  it('removes the demo company and nothing of the real one', async () => {
    const { session } = await createTestCompany()
    await session.db.customer.create({
      data: {
        organizationId: session.organizationId,
        number: 1,
        displayNumber: 'C-1',
        firstName: 'Real',
        lastName: 'Customer',
      },
    })

    asProduction({ unlocked: true })
    await installDemoData()
    const demoBefore = await prisma.organization.findUnique({ where: { slug: DEMO_SLUG } })
    expect(demoBefore).not.toBeNull()

    const again = await installDemoData({ replace: true })
    expect(again.status).toBe('installed')
    if (again.status === 'installed') expect(again.replaced).toBe(true)

    // The real company is exactly as it was.
    expect(
      await prisma.organization.findUnique({ where: { id: session.organizationId } }),
    ).not.toBeNull()
    expect(
      await prisma.customer.count({ where: { organizationId: session.organizationId } }),
    ).toBe(1)
    expect(await prisma.user.findUnique({ where: { id: session.userId } })).not.toBeNull()

    // And the old demo company is gone rather than orphaned.
    for (const table of ['customer', 'job', 'estimate', 'invoice'] as const) {
      expect(
        await (prisma[table] as { count: (args: unknown) => Promise<number> }).count({
          where: { organizationId: demoBefore!.id },
        }),
        table,
      ).toBe(0)
    }
  })

  /**
   * The one that would have hurt.
   *
   * `PLATFORM_ADMIN_EMAIL` is the operator's own address on a real deployment,
   * and that account is their only way into `/admin`. It also usually has no
   * membership of any company, so a scope-by-membership rule would not save it.
   */
  it('does not delete the platform administrator', async () => {
    asProduction({ unlocked: true })
    await installDemoData()

    const admin = await prisma.user.findUnique({ where: { email: PLATFORM_ADMIN_EMAIL } })
    expect(admin).not.toBeNull()

    await removeDemoData()

    const after = await prisma.user.findUnique({ where: { email: PLATFORM_ADMIN_EMAIL } })
    expect(after, 'the platform administrator was deleted by a demo reset').not.toBeNull()
    expect(after!.id).toBe(admin!.id)
    expect(after!.platformRole).toBe('PLATFORM_ADMIN')
  })

  it('never rewrites the platform administrator password on reinstall', async () => {
    asProduction({ unlocked: true })
    await installDemoData()

    // Stand in for the operator having changed it after first sign-in.
    const chosen = 'hash-the-operator-set-themselves'
    await prisma.user.update({
      where: { email: PLATFORM_ADMIN_EMAIL },
      data: { passwordHash: chosen },
    })

    await installDemoData({ replace: true })

    const after = await prisma.user.findUnique({ where: { email: PLATFORM_ADMIN_EMAIL } })
    expect(after!.passwordHash).toBe(chosen)
  })

  it('leaves a person who also belongs to a real company', async () => {
    asProduction({ unlocked: true })
    await installDemoData()

    // The demo technician takes a job at a real company too. Contrived, but it
    // is the shape of the rule: an account is removable only if the demo was
    // the last thing it belonged to.
    const { session } = await createTestCompany()
    const tech = await prisma.user.findUnique({ where: { email: DEMO_TECH_EMAIL } })
    await prisma.membership.create({
      data: { userId: tech!.id, organizationId: session.organizationId, role: 'TECHNICIAN' },
    })

    await removeDemoData()

    expect(await prisma.user.findUnique({ where: { email: DEMO_TECH_EMAIL } })).not.toBeNull()
    // The one with nothing else keeping it alive does go.
    expect(await prisma.user.findUnique({ where: { email: DEMO_OWNER_EMAIL } })).toBeNull()
  })

  /**
   * `GDOC20` is six characters a real partner could plausibly choose, so the
   * code is no longer treated as identification on its own.
   */
  it('leaves a partner who has referred a real company', async () => {
    asProduction({ unlocked: true })
    await installDemoData()

    const { session } = await createTestCompany()
    const affiliate = await prisma.affiliate.findUnique({ where: { email: DEMO_AFFILIATE_EMAIL } })
    await prisma.referral.create({
      data: {
        organizationId: session.organizationId,
        affiliateId: affiliate!.id,
        code: 'GDOC20',
      },
    })

    await removeDemoData()

    expect(
      await prisma.affiliate.findUnique({ where: { id: affiliate!.id } }),
      'an affiliate with a real referral was deleted',
    ).not.toBeNull()
  })
})

describe('the demo password on production', () => {
  it('refuses the default from the repository', async () => {
    asProduction({ unlocked: true, password: DEFAULT_DEMO_PASSWORD })
    await expect(installDemoData()).rejects.toThrow(/public/i)
  })

  it('refuses an unset one, rather than silently using the default', async () => {
    asProduction({ unlocked: true })
    delete process.env.DEMO_PASSWORD
    resetEnvironment()
    await expect(installDemoData()).rejects.toThrow(/DEMO_PASSWORD is not set/)
  })

  it('refuses a short one', async () => {
    asProduction({ unlocked: true, password: 'short' })
    await expect(installDemoData()).rejects.toThrow(/12 characters/)
  })

  it('accepts one the operator chose, and seeds it', async () => {
    asProduction({ unlocked: true, password: 'a-password-the-operator-chose' })
    const result = await installDemoData()
    expect(result.status).toBe('installed')

    const owner = await prisma.user.findUnique({ where: { email: DEMO_OWNER_EMAIL } })
    expect(owner!.passwordHash).not.toContain(DEFAULT_DEMO_PASSWORD)
    expect(owner!.passwordHash.startsWith('$2')).toBe(true)
  })

  it('does not apply on staging, where the default is the point', async () => {
    process.env.APP_ENV = 'staging'
    delete process.env.DEMO_PASSWORD
    resetEnvironment()

    const result = await installDemoData()
    expect(result.status).toBe('installed')
  })
})

describe('what the demo company counts as', () => {
  it('is complimentary, not a paying customer', async () => {
    process.env.APP_ENV = 'staging'
    resetEnvironment()
    await installDemoData()

    const demo = await prisma.organization.findUnique({ where: { slug: DEMO_SLUG } })
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: demo!.id },
    })

    // ACTIVE would read as $39.99/mo of revenue on the platform dashboard,
    // forever, from a company that does not exist.
    expect(subscription!.status).toBe('COMPLIMENTARY')
    expect(subscription!.complimentaryUntil).toBeNull()

    expect(
      await prisma.subscription.count({ where: { organizationId: demo!.id, status: 'ACTIVE' } }),
    ).toBe(0)
  })
})
