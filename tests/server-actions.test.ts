import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Server actions are for submissions, not renders.
 *
 * This exists because of a real outage. The billing page awaited a function
 * from its `'use server'` actions file during render, to re-read the
 * subscription on return from Stripe Checkout. That function ended with
 * `revalidatePath`, which Next refuses to run inside a render — so the first
 * person to complete a real checkout on production was redirected from Stripe
 * to a server-error screen, seconds after being charged.
 *
 * Nothing caught it. It typechecked, it linted, the suite passed, and the code
 * path had never executed outside a test because no one had completed a live
 * checkout before. The only signal would have been running it.
 *
 * So: a page may not await an action during render. If a render needs the work
 * an action does, the work belongs in a plain server function that both can
 * call — which is exactly how the billing page is now written.
 */

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (/\.tsx?$/.test(path)) out.push(path)
  }
  return out
}

const APP_FILES = walk('src/app').map((path) => ({ path, text: readFileSync(path, 'utf8') }))

/** Files that declare themselves server actions. */
const ACTION_FILES = APP_FILES.filter((file) => /^['"]use server['"]/.test(file.text.trimStart()))

/** The things rendered rather than submitted: pages and layouts. */
const RENDERED = APP_FILES.filter((file) => /\/(page|layout|template)\.tsx$/.test(file.path))

describe('server actions', () => {
  it('are never awaited from a page or layout render', () => {
    // A render that awaits an action gets whatever that action does on top of
    // its own job — including revalidation, redirects and cache writes that
    // are illegal mid-render.
    const offenders = RENDERED.filter((file) => /await\s+\w*Action\s*\(/.test(file.text)).map(
      (file) => file.path,
    )
    expect(offenders).toEqual([])
  })

  it('keeps revalidatePath out of anything a render calls', () => {
    // The specific failure, in both places it existed: the return from Stripe
    // Checkout and the return from Stripe Connect onboarding. Both are called
    // during a render; if either revalidates again, that page 500s on the one
    // visit that matters most.
    for (const [file, fn] of [
      ['src/app/(app)/settings/billing/actions.ts', 'refreshBillingOnLoad'],
      ['src/app/(app)/settings/payments/actions.ts', 'refreshConnectOnLoad'],
    ] as const) {
      const text = readFileSync(file, 'utf8')
      const start = text.indexOf(`export async function ${fn}`)
      expect(start, `${fn} not found in ${file}`).toBeGreaterThan(-1)
      const body = text.slice(start, text.indexOf('\n}\n', start) + 2)

      expect(body, `${fn} must not revalidate`).not.toContain('revalidatePath')
      expect(body, `${fn} must not redirect`).not.toContain('redirect(')
    }
  })

  it('keeps its action files findable, so this scan sees them all', () => {
    // If an actions file loses its directive the checks above stop covering it
    // silently, so this asserts the scan found some. They live either beside
    // the route that uses them or under `src/app/actions/`.
    expect(ACTION_FILES.length).toBeGreaterThan(0)
    for (const file of ACTION_FILES) {
      expect(file.path).toMatch(/(actions\.ts$|src\/app\/actions\/)/)
    }
  })
})
