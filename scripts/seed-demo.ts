/**
 * Add the demo company to a deployment, without destroying anything.
 *
 * Unlike `npm run db:seed`, this never truncates. It refuses if the demo
 * company is already there, so it is safe to leave in a start command or to
 * run twice by accident.
 */
import { prisma } from '../src/server/demo/data'
import { installDemoData } from '../src/server/demo/install'

async function main() {
  const result = await installDemoData()

  if (result.status === 'already-present') {
    console.log(`Nothing to do. ${result.message}`)
    return
  }

  const { summary } = result
  console.log(`
Demo company added.

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
