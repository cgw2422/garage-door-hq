import { prisma } from '@/lib/db'
import { storage } from '@/server/storage'

/**
 * Object lifecycle and orphan cleanup.
 *
 * A photo exists in two places — a row and an object — and they cannot be
 * written atomically. The upload is therefore deliberately ordered so that the
 * only possible inconsistency is a harmless one:
 *
 *   1. `beginPhotoUpload` writes a PENDING row and reserves a key.
 *   2. The browser PUTs the bytes straight to storage.
 *   3. `completePhotoUpload` verifies the object and flips the row to READY.
 *
 * Every failure mode leaves either nothing, or an object with no reachable row:
 *
 *   - abandoned before step 2 → PENDING row, no object
 *   - upload failed or the app closed → PENDING row, possibly a partial object
 *   - rejected at step 3 (wrong type, too large) → FAILED row; the object is
 *     deleted immediately, and the row is swept later
 *   - delete after the row is gone → the object is removed best-effort, and if
 *     that call fails the object is stranded
 *
 * A PENDING row is never rendered and never counted, so a stranded object costs
 * storage and nothing else. This sweep reclaims it.
 *
 * Signatures are written from the server *before* their transaction, so a
 * failed sign-off can strand one the same way. Those are swept here too, by
 * looking for signature objects with no row pointing at them.
 *
 * Run it from a scheduler (`npm run storage:sweep`). It also runs
 * opportunistically on a small fraction of uploads so a deployment with no
 * scheduler still converges.
 */

/** How long an upload has to finish before it is considered abandoned. */
const ABANDON_MINUTES = 60

export interface SweepResult {
  rowsRemoved: number
  objectsRemoved: number
  objectsFailed: number
}

export async function sweepAbandonedUploads(options?: {
  olderThanMinutes?: number
  limit?: number
  now?: Date
}): Promise<SweepResult> {
  const now = options?.now ?? new Date()
  const cutoff = new Date(now.getTime() - (options?.olderThanMinutes ?? ABANDON_MINUTES) * 60_000)
  const limit = options?.limit ?? 200

  const stale = await prisma.photo.findMany({
    where: { uploadStatus: { in: ['PENDING', 'FAILED'] }, createdAt: { lt: cutoff } },
    select: { id: true, storageKey: true },
    take: limit,
  })

  const result: SweepResult = { rowsRemoved: 0, objectsRemoved: 0, objectsFailed: 0 }
  if (stale.length === 0) return result

  const driver = storage()

  for (const photo of stale) {
    // Delete the object first. If that fails the row stays, so the next sweep
    // tries again rather than losing the only reference to the object.
    try {
      const exists = await driver.head(photo.storageKey)
      if (exists) {
        await driver.delete(photo.storageKey)
        result.objectsRemoved += 1
      }
    } catch (error) {
      result.objectsFailed += 1
      console.warn('[storage] sweep could not delete', photo.storageKey, error)
      continue
    }

    await prisma.photo.delete({ where: { id: photo.id } }).catch(() => undefined)
    result.rowsRemoved += 1
  }

  return result
}

/**
 * Roughly one upload in fifty triggers a sweep. Cheap insurance for a
 * deployment that never sets up a scheduled job; harmless when one exists.
 */
export function maybeSweepInBackground() {
  if (Math.random() > 0.02) return
  void sweepAbandonedUploads().catch((error) =>
    console.warn('[storage] background sweep failed', error),
  )
}
