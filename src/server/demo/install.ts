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

import { assertDemoWriteAllowed } from '@/lib/environment'
import {
  assertDemoPasswordIsSafe,
  DEMO_AFFILIATE_EMAIL,
  DEMO_LOGINS,
  DEMO_SLUG,
  prisma,
  seedDemoData,
  type DemoSummary,
} from './data'

export type InstallResult =
  | { status: 'installed'; summary: DemoSummary; replaced: boolean }
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

  // Only the two accounts the seed owns. The platform admin is upserted rather
  // than created, so finding one already there is the normal case on a
  // deployment that has been reinstalled — not a collision.
  const user = await prisma.user.findFirst({
    where: { email: { in: DEMO_LOGINS } },
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

/**
 * Remove the demo company, and only the demo company.
 *
 * Every statement is scoped by the demo organization's id, which is looked up
 * from its slug and checked again below — there is no code path here that can
 * be handed another company's id. Tables are discovered from the schema rather
 * than listed, because a list would rot: a model added next month with an
 * `organizationId` would otherwise be silently left behind, and a stale row
 * pointing at a deleted company is worse than no row.
 *
 * Deletion order comes from the foreign keys themselves: a table is emptied
 * only once everything that references it is gone. Asking Postgres beats
 * hand-maintaining an order that would rot the first time a model gains a
 * relation. A retry pass follows as a safety net, so an ordering the sort
 * cannot express still converges rather than failing.
 */
export async function removeDemoData(): Promise<{ removed: boolean }> {
  assertDemoWriteAllowed('Deleting the demo company')

  const organization = await prisma.organization.findUnique({
    where: { slug: DEMO_SLUG },
    select: { id: true, slug: true },
  })
  if (!organization) return { removed: false }

  // Belt and braces. The lookup above is by slug, and this asserts it again
  // before anything is deleted.
  if (organization.slug !== DEMO_SLUG) {
    throw new Error('Refusing to delete an organization that is not the demo company.')
  }

  // Captured before the sweep, because both records live outside the tenant
  // scope and the rows that tie them to it are about to be deleted.
  const [members, referrals] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: organization.id },
      select: { userId: true },
    }),
    prisma.referral.findMany({
      where: { organizationId: organization.id },
      select: { affiliateId: true },
    }),
  ])
  const memberIds = members.map((row) => row.userId)
  const affiliateIds = [...new Set(referrals.map((row) => row.affiliateId))]

  const tables = await tenantTablesInDeletionOrder()

  const stillBlocked: string[] = []
  for (const table of tables) {
    try {
      await deleteScoped(table, organization.id)
    } catch {
      stillBlocked.push(table)
    }
  }

  // Anything the ordering missed — a relation Postgres reports in a shape the
  // sort could not use — gets retried until a pass makes no progress.
  let pending = stillBlocked
  while (pending.length > 0) {
    const blocked: string[] = []
    for (const table of pending) {
      try {
        await deleteScoped(table, organization.id)
      } catch {
        blocked.push(table)
      }
    }
    if (blocked.length === pending.length) {
      throw new Error(
        `Could not remove the demo company: ${blocked.join(', ')} still hold rows that ` +
          'something else references.',
      )
    }
    pending = blocked
  }

  await prisma.organization.delete({ where: { id: organization.id } })

  // The accounts and the partner record live outside any organization, so
  // scope cannot find them. Matching on the demo addresses alone would be
  // enough on a laptop and is not enough on a deployment holding real
  // companies, so each is narrowed by something only the demo company's own
  // rows could have established.
  //
  // For the two logins: they must have been members of the demo company, and
  // — now that it is deleted, taking its memberships with it — must belong to
  // no other company. A person who joined a real company keeps their account.
  //
  // `PLATFORM_ADMIN_EMAIL` is absent from `DEMO_LOGINS` deliberately and must
  // stay absent. On a real deployment that address is the operator's own, the
  // account is their only way into `/admin`, and it typically has no
  // membership at all — so the membership test would not save it.
  await prisma.user.deleteMany({
    where: {
      id: { in: memberIds },
      email: { in: DEMO_LOGINS },
      memberships: { none: {} },
    },
  })

  // For the partner: the demo's own referral pointed at it, and nothing else
  // does now. Matching on the code `GDOC20` was the other half of this and has
  // been dropped — a code is six characters a real partner could reasonably
  // pick, and it is not identification.
  await prisma.affiliate.deleteMany({
    where: {
      OR: [{ id: { in: affiliateIds } }, { email: DEMO_AFFILIATE_EMAIL }],
      referrals: { none: {} },
      commissions: { none: {} },
    },
  })

  return { removed: true }
}

function deleteScoped(table: string, organizationId: string) {
  // The table name comes from the schema catalog, never from a caller, and is
  // quoted; the id is bound.
  return prisma.$executeRawUnsafe(
    `DELETE FROM "public"."${table}" WHERE "organizationId" = $1`,
    organizationId,
  )
}

/**
 * Every table carrying an `organizationId`, ordered so that each one is
 * emptied before the tables it points at.
 *
 * Discovered rather than listed, because a list would rot: a model added next
 * month with an `organizationId` would otherwise be silently left behind, and
 * a stale row pointing at a deleted company is worse than no row.
 */
async function tenantTablesInDeletionOrder(): Promise<string[]> {
  const [columns, references] = await Promise.all([
    prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'organizationId'
    `,
    prisma.$queryRaw<Array<{ child: string; parent: string }>>`
      SELECT child.relname AS child, parent.relname AS parent
        FROM pg_constraint c
        JOIN pg_class child ON child.oid = c.conrelid
        JOIN pg_class parent ON parent.oid = c.confrelid
       WHERE c.contype = 'f' AND child.relname <> parent.relname
    `,
  ])

  const tables = new Set(columns.map((row) => row.table_name))

  /** Who must be emptied before this table can be. */
  const dependents = new Map<string, Set<string>>()
  for (const table of tables) dependents.set(table, new Set())
  for (const edge of references) {
    if (!tables.has(edge.child) || !tables.has(edge.parent)) continue
    dependents.get(edge.parent)!.add(edge.child)
  }

  const ordered: string[] = []
  const done = new Set<string>()
  let remaining = [...tables]

  while (remaining.length > 0) {
    const ready = remaining.filter((table) =>
      [...dependents.get(table)!].every((child) => done.has(child)),
    )
    // A cycle among tenant tables: leave the rest to the retry pass.
    if (ready.length === 0) return [...ordered, ...remaining]

    for (const table of ready) {
      ordered.push(table)
      done.add(table)
    }
    remaining = remaining.filter((table) => !done.has(table))
  }

  return ordered
}

/**
 * Adds the demo company.
 *
 * Never destructive unless `replace` is asked for explicitly, and even then
 * only to the demo company itself.
 */
export async function installDemoData(
  options: { replace?: boolean } = {},
): Promise<InstallResult> {
  // Off production this is unconditional. On production it needs the deliberate
  // unlock: demo data is fictional companies and fictional homeowners, and
  // `replace` deletes a whole tenant, so it is permitted only when an operator
  // has said in so many words that this deployment holds the demo on purpose.
  assertDemoWriteAllowed('Loading the demo company')

  // Before the delete below, not after. `seedDemoData` checks this too, but by
  // then a replace has already removed the demo company — and a run that
  // deletes the thing it was asked to rebuild and then refuses to rebuild it is
  // the worst outcome available here.
  assertDemoPasswordIsSafe()

  let replaced = false

  if (options.replace) {
    const { removed } = await removeDemoData()
    replaced = removed
  }

  const blocked = await conflict()
  if (blocked) return { status: 'already-present', message: blocked }

  const summary = await seedDemoData()
  return { status: 'installed', summary, replaced }
}
