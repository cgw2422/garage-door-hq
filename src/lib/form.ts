import type { z } from 'zod'
import { isFrameworkControlFlow, userMessage } from './errors'

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

/**
 * Turn a thrown domain error into a message a technician can act on.
 *
 * The translation itself lives in `errors.ts`, behind an allowlist: only
 * messages this codebase wrote on purpose are shown. A Prisma constraint
 * violation, a Stripe developer message or a storage error is logged and
 * replaced, never rendered.
 *
 * Redirects are thrown by Next.js and must pass straight through — catching
 * one here would turn a working redirect into "something went wrong".
 */
/**
 * Run an authorization gate and turn a refusal into something the form can
 * render.
 *
 * `requireActiveSubscription` throws, which is right for a page — it belongs
 * above the render — but wrong for a server action, where an uncaught throw
 * becomes a generic server error instead of the calm sentence about the
 * account's data being safe.
 *
 *   const gate = await guarded(() => requireActiveSubscription('customer:write'))
 *   if (!gate.ok) return gate.state
 *   const session = gate.value
 */
export async function guarded<T>(
  gate: () => Promise<T>,
  formData?: FormData,
): Promise<{ ok: true; value: T } | { ok: false; state: FormState }> {
  try {
    return { ok: true, value: await gate() }
  } catch (error) {
    // A redirect from `requireSession` still has to reach the framework.
    if (isFrameworkControlFlow(error)) throw error
    return { ok: false, state: failure(error, formData, 'gate') }
  }
}

export function failure(error: unknown, formData?: FormData, context?: string): FormState {
  if (isFrameworkControlFlow(error)) throw error
  return {
    error: userMessage(error, context ?? 'action'),
    values: formData ? formValues(formData) : undefined,
  }
}
