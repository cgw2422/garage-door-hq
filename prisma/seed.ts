/**
 * Reset this database and fill it with the demo company.
 *
 * For development. It truncates every table first, which is why it refuses to
 * run against a production database without ALLOW_SEED_RESET. To add the demo
 * company to a live deployment without destroying anything, use
 * `npm run db:demo` or the /api/admin/seed-demo endpoint instead.
 */
import { prisma, resetDatabase, seedDemoData } from '../src/server/demo/data'

async function main() {
  console.log('Seeding Garage Door HQ demo data…')
  await resetDatabase()
  const summary = await seedDemoData()

  console.log(`
Demo data ready.

  Organization : ${summary.organization}
  Catalog      : ${summary.catalog} items · ${summary.packages} packages · ${summary.remedies} inspection remedies
  Owner login  : ${summary.ownerEmail}
  Tech login   : ${summary.techEmail}
  Platform     : ${summary.platformEmail}
  Password     : ${summary.password}
`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
