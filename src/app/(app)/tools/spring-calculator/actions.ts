'use server'

import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { matchInventorySprings, type SpringMatchResult } from '@/server/springs/calculator'

const schema = z.object({
  wireSizeInches: z.coerce.number().gt(0).lt(1),
  insideDiameterInches: z.coerce.number().gt(0).lt(12),
  lengthInches: z.coerce.number().gt(0).lt(120),
  wind: z.enum(['LEFT_HAND', 'RIGHT_HAND']).optional(),
  quantity: z.coerce.number().int().min(1).max(8).default(2),
  existingCycleRating: z.coerce.number().int().positive().optional(),
  jobId: z.string().uuid().optional(),
  doorId: z.string().uuid().optional(),
})

export interface MatchState {
  result?: SpringMatchResult
  error?: string
  /** Echoed back so the form keeps what the technician typed. */
  values?: Record<string, string>
}

/**
 * Look up catalog springs that match what is on the door, with live truck and
 * warehouse counts. This is a search, not an engineering calculation - see the
 * note at the top of src/server/springs/calculator.ts.
 */
export async function findMatchingSprings(
  _prev: MatchState,
  formData: FormData,
): Promise<MatchState> {
  const session = await requirePermission('inventory:read')

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>
  const parsed = schema.safeParse({
    ...raw,
    wind: raw.wind === '' ? undefined : raw.wind,
    existingCycleRating: raw.existingCycleRating === '' ? undefined : raw.existingCycleRating,
    jobId: raw.jobId === '' ? undefined : raw.jobId,
    doorId: raw.doorId === '' ? undefined : raw.doorId,
  })

  if (!parsed.success) {
    return {
      error: 'Check the measurements — wire size, inside diameter and length are all required.',
      values: raw,
    }
  }

  const result = await matchInventorySprings(session.db, parsed.data, {
    myLocationId: session.defaultLocationId,
  })

  // Record what was measured so the door's history keeps it, even when the
  // technician does not sell anything today.
  if (parsed.data.jobId || parsed.data.doorId) {
    await session.db.springMeasurement.create({
      data: {
        // The tenant client overwrites this with the session's organization;
        // it is supplied here only to satisfy Prisma's create input type.
        organizationId: session.organizationId,
        jobId: parsed.data.jobId ?? null,
        doorId: parsed.data.doorId ?? null,
        wireSizeInches: parsed.data.wireSizeInches,
        insideDiameterInches: parsed.data.insideDiameterInches,
        lengthInches: parsed.data.lengthInches,
        wind: parsed.data.wind ?? null,
        quantity: parsed.data.quantity,
        existingCycleRating: parsed.data.existingCycleRating ?? null,
        createdById: session.userId,
      },
    })
  }

  return { result, values: raw }
}
