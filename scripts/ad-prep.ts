/**
 * Put the demo company into the state an advertisement should show.
 *
 * Run after `db:seed` and before `ad-screens.mjs`. Both changes are things the
 * owner of a settled company would have done months ago; neither invents
 * anything the product does not do.
 *
 * Usage:  ALLOW_SEED_RESET=true npm run db:seed && npx tsx scripts/ad-prep.ts
 */
import { prisma } from '@/lib/db'

async function main() {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { slug: 'precision-garage-door-demo' },
    select: { id: true },
  })

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      // "— DEMO" is honest on a live deployment and wrong in an advert.
      name: 'Precision Garage Door Services',
      // The setup checklist is correct on a new account and wrong in an
      // advert: nobody is sold software by a picture of an unfinished one.
      // This is the same thing the Dismiss button on the card does.
      setupChecklistDoneAt: new Date(),
      onboardingCompletedAt: new Date(),
    },
  })

  // A presentation left open by an earlier run makes /present show "this
  // presentation has ended" instead of starting a new one, and the capture
  // stops there. Clearing them makes the script repeatable.
  const { count } = await prisma.presentationSession.deleteMany({})
  if (count > 0) console.log(`Cleared ${count} presentation session(s) from an earlier run.`)

  console.log('Ready for screenshots: company renamed, setup checklist dismissed.')
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
