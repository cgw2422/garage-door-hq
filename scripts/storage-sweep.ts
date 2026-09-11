/**
 * Reclaim storage objects left behind by uploads that never completed.
 *
 * Run on a schedule (hourly is plenty). See src/server/media/cleanup.ts for the
 * full lifecycle and why an orphan is possible at all.
 *
 *   npm run storage:sweep
 */
import { sweepAbandonedUploads } from '../src/server/media/cleanup'
import { sweepRateLimits } from '../src/lib/rate-limit'
import { prisma } from '../src/lib/db'

async function main() {
  const uploads = await sweepAbandonedUploads()
  const rateLimitRows = await sweepRateLimits()

  console.log(
    `Swept ${uploads.rowsRemoved} abandoned upload rows, ` +
      `${uploads.objectsRemoved} objects removed, ${uploads.objectsFailed} failed. ` +
      `Removed ${rateLimitRows} expired rate-limit windows.`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
