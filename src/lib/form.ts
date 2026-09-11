import type { z } from 'zod'

/** Shape every server action returns to a `useActionState` form. */
export interface FormState {
  error?: string
  fieldErrors?: Record<string, string>
  /** Echoed so a failed submit never wipes what the technician typed. */
  values?: Record<string, string>
}

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string' && key !== 'password' && key !== 'confirmPassword') {
      values[key] = value
    }
  }
  return values
}

/**
 * Validate a form, returning either the parsed data or a state the form can
 * render directly. Empty strings become `undefined` so optional fields do not
 * have to special-case the difference between "blank" and "absent".
 */
export function parseForm<T extends z.ZodTypeAny>(
  schema: T,
  formData: FormData,
): { ok: true; data: z.infer<T> } | { ok: false; state: FormState } {
  const raw: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string') continue
    raw[key] = value === '' ? undefined : value
  }

  const parsed = schema.safeParse(raw)
  if (parsed.success) return { ok: true, data: parsed.data }

  const fieldErrors: Record<string, string> = {}
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.')
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
  }

  return {
    ok: false,
    state: {
      error: Object.keys(fieldErrors).length > 0 ? undefined : parsed.error.issues[0]?.message,
      fieldErrors,
      values: formValues(formData),
    },
  }
}

/** Turn a thrown domain error into a message a technician can act on. */
export function failure(error: unknown, formData?: FormData): FormState {
  const message =
    error instanceof Error && error.name !== 'Error'
      ? error.message
      : 'Something went wrong. Try that again.'
  if (error instanceof Error && error.name === 'Error') {
    console.error('[action] unexpected error', error)
  }
  return { error: message, values: formData ? formValues(formData) : undefined }
}
