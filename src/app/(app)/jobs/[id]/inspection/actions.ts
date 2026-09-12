'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { userMessage } from '@/lib/errors'
import { requirePermission, requireActiveSubscription } from '@/lib/session'
import { failure, type FormState, guarded } from '@/lib/form'
import {
  completeInspection,
  setItemNote,
  setItemStatus,
  startInspection,
} from '@/server/inspections/service'
import { addAllRemediesToEstimate, addRemedyToEstimate } from '@/server/estimates/builder'

const statusSchema = z.object({
  itemId: z.string().uuid(),
  status: z.enum(['NOT_CHECKED', 'GOOD', 'WORN', 'NEEDS_ATTENTION', 'FAILED', 'NOT_APPLICABLE']),
  jobId: z.string().uuid(),
})

export async function setStatusAction(input: z.infer<typeof statusSchema>) {
  const session = await requirePermission('job:write')
  const parsed = statusSchema.parse(input)
  await setItemStatus(session, { itemId: parsed.itemId, status: parsed.status })
  revalidatePath(`/jobs/${parsed.jobId}/inspection`)
}

const noteSchema = z.object({
  itemId: z.string().uuid(),
  note: z.string().max(2000).nullable(),
  jobId: z.string().uuid(),
})

/**
 * Save one finding's note.
 *
 * Returns an outcome rather than throwing: the field keeps a local copy of
 * what was typed and only discards it once this reports success, so a failure
 * here must be something the caller can see rather than an exception that
 * unmounts the screen.
 */
export async function setNoteAction(
  input: z.infer<typeof noteSchema>,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePermission('job:write')

  try {
    const parsed = noteSchema.parse(input)
    await setItemNote(session, { itemId: parsed.itemId, note: parsed.note })
    revalidatePath(`/jobs/${parsed.jobId}/inspection`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: userMessage(error, 'inspection.note') }
  }
}

const remedySchema = z.object({
  jobId: z.string().uuid(),
  itemId: z.string().uuid(),
  remedyId: z.string().uuid(),
})

/** One tap: the right work lands on the right tier of the job's estimate. */
export async function addRemedyAction(
  input: z.infer<typeof remedySchema>,
): Promise<{ ok: true; estimateId: string } | { ok: false; error: string }> {
  const gate = await guarded(() => requireActiveSubscription('estimate:write'))
  // This action answers with its own shape, so the gate's message is carried
  // across rather than returned as a form state.
  if (!gate.ok) return { ok: false, error: gate.state.error ?? 'That is not available.' }
  const session = gate.value
  const parsed = remedySchema.parse(input)

  try {
    const result = await addRemedyToEstimate(session, {
      jobId: parsed.jobId,
      inspectionItemId: parsed.itemId,
      remedyId: parsed.remedyId,
    })
    revalidatePath(`/jobs/${parsed.jobId}/inspection`)
    return { ok: true, estimateId: result.estimateId }
  } catch (error) {
    return { ok: false, error: failure(error).error ?? 'Could not add that option.' }
  }
}

const tieredSchema = z.object({
  jobId: z.string().uuid(),
  itemId: z.string().uuid(),
  componentKey: z.string().max(80),
})

/** Good, Better and Best on the estimate in a single tap. */
export async function addTieredOptionsAction(
  input: z.infer<typeof tieredSchema>,
): Promise<{ ok: true; estimateId: string } | { ok: false; error: string }> {
  const gate = await guarded(() => requireActiveSubscription('estimate:write'))
  // This action answers with its own shape, so the gate's message is carried
  // across rather than returned as a form state.
  if (!gate.ok) return { ok: false, error: gate.state.error ?? 'That is not available.' }
  const session = gate.value
  const parsed = tieredSchema.parse(input)

  try {
    const result = await addAllRemediesToEstimate(session, {
      jobId: parsed.jobId,
      inspectionItemId: parsed.itemId,
      componentKey: parsed.componentKey,
    })
    revalidatePath(`/jobs/${parsed.jobId}/inspection`)
    return { ok: true, estimateId: result.estimateId }
  } catch (error) {
    return { ok: false, error: failure(error).error ?? 'Could not add those options.' }
  }
}

export async function startInspectionAction(jobId: string) {
  const session = await requirePermission('job:write')
  await startInspection(session, jobId)
  revalidatePath(`/jobs/${jobId}/inspection`)
}

export async function finishInspectionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('job:write')
  const inspectionId = String(formData.get('inspectionId') ?? '')
  const jobId = String(formData.get('jobId') ?? '')
  const summary = formData.get('summary')

  try {
    await completeInspection(session, {
      inspectionId,
      summary: typeof summary === 'string' ? summary : null,
    })
  } catch (error) {
    return failure(error, formData)
  }

  redirect(`/jobs/${jobId}`)
}
