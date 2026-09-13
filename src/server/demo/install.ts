/**
 * Loading the demo company onto a deployment that already has real data.
 *
 * `prisma/seed.ts` truncates the database first, which is right for a laptop
 * and catastrophic anywhere else. This path never deletes anything. It checks
 * first that nothing it is about to create already exists, and refuses rather
 * than half-writing a company on a unique-constraint violation.
 *
 * The demo company is a tenant like any other: it lives alongside real
 * companies, sees none of their data, and can be left in place or ignored.
 */

import {
  DEMO_AFFILIATE_EMAIL,
  DEMO_EMAILS,
  DEMO_SLUG,
  prisma,
  seedDemoData,
  type DemoSummary,
} from './data'

export type InstallResult =
  | { status: 'installed'; summary: DemoSummary }
  | { status: 'already-present'; message: string }

/**
 * What would collide. Checked up front because the seed writes a few hundred
 * rows across many tables, and failing halfway through would leave a company
 * that is neither absent nor complete.
 */
async function conflict(): Promise<string | null> {
  const organization = await prisma.organization.findUnique({
    where: { slug: DEMO_SLUG },
    select: { id: true },
  })
  if (organization) return 'The demo company is already loaded.'

  const user = await prisma.user.findFirst({
    where: { email: { in: DEMO_EMAILS } },
    select: { email: true },
  })
  if (user) {
    return (
      `An account already uses ${user.email}, which the demo data needs. ` +
      'Rename or remove that account first.'
    )
  }

  const affiliate = await prisma.affiliate.findFirst({
    where: { OR: [{ email: DEMO_AFFILIATE_EMAIL }, { code: 'GDOC20' }] },
    select: { id: true },
  })
  if (affiliate) {
    return 'An affiliate already uses the demo partner code GDOC20.'
  }

  return null
}

/** Adds the demo company, or explains why it did not. Never destructive. */
export async function installDemoData(): Promise<InstallResult> {
  const blocked = await conflict()
  if (blocked) return { status: 'already-present', message: blocked }

  const summary = await seedDemoData()
  return { status: 'installed', summary }
}
