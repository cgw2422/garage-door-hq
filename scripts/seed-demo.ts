/**
 * Add the demo company to a deployment, without destroying anything.
 *
 *   npm run db:demo              — add it, or say it is already there
 *   npm run db:demo:replace      — delete the demo company and load it fresh
 *
 * Unlike `npm run db:seed`, neither of these truncates. `--replace` deletes
 * the demo company and nothing else: every statement behind it is scoped to
 * that one organization.
 */
import { prisma } from '../src/server/demo/data'
import { installDemoData } from '../src/server/demo/install'

const replace = process.argv.includes('--replace') || process.env.DEMO_REPLACE === 'true'

async function main() {
  if (replace) console.log('Replacing the demo company…')

  const result = await installDemoData({ replace })

  if (result.status === 'already-present') {
    console.log(`
Nothing to do. ${result.message}

  To load it fresh, run:  npm run db:demo:replace
`)
    return
  }

  const { summary } = result
  console.log(`
${result.replaced ? 'Demo company replaced.' : 'Demo company added.'}

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
