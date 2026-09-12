import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { isFrameworkControlFlow, userMessage } from '@/lib/errors'
import { failure } from '@/lib/form'
import { friendlyStripeError } from '@/server/billing/stripe'
import { createTestCompany } from './helpers'

/**
 * What a garage door owner is allowed to read when something breaks.
 *
 * The rule: only wording this codebase wrote on purpose. A Prisma constraint
 * name, a Stripe developer message, a storage key or a stack trace reaching a
 * screen is a bug, not a rough edge.
 */

describe('database errors', () => {
  it('never shows the constraint that failed', async () => {
    const { session } = await createTestCompany()

    // A real unique violation, produced the way the app would produce one.
    let thrown: unknown = null
    try {
      await prisma.organization.create({
        data: { name: 'Duplicate', slug: session.organizationSlug },
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).not.toBeNull()
    const message = userMessage(thrown, 'test')

    expect(message).toBe('That already exists. Check for a duplicate and try again.')
    // None of Prisma's own vocabulary survives.
    expect(message).not.toMatch(/constraint/i)
    expect(message).not.toMatch(/prisma/i)
    expect(message).not.toMatch(/slug|organization/i)
    expect(message).not.toMatch(/P\d{4}/)
  })

  it('never shows a record id', async () => {
    let thrown: unknown = null
    try {
      await prisma.customer.update({
        where: { id: '00000000-0000-0000-0000-000000000000' },
        data: { firstName: 'Nobody' },
      })
    } catch (error) {
      thrown = error
    }

    const message = userMessage(thrown, 'test')
    expect(message).toBe('That record no longer exists. Refresh the page and try again.')
    expect(message).not.toContain('00000000')
  })

  it('falls back to something generic for an error it does not recognise', () => {
    const message = userMessage(new Error('Internal: connection pool timeout at 0x7f'), 'test')
    expect(message).toBe('Something went wrong. Try that again.')
    expect(message).not.toContain('0x7f')
    expect(message).not.toContain('pool')
  })
})

describe('domain errors', () => {
  it('shows the message when this codebase wrote it on purpose', () => {
    class InventoryError extends Error {
      constructor(message: string) {
        super(message)
        this.name = 'InventoryError'
      }
    }
    expect(userMessage(new InventoryError('Enter how many, as a positive number.'))).toBe(
      'Enter how many, as a positive number.',
    )
  })

  it('does not show one that was never meant for a user', () => {
    class WebhookSignatureError extends Error {
      constructor(message: string) {
        super(message)
        this.name = 'WebhookSignatureError'
      }
    }
    // A webhook caller must not learn why its signature was rejected.
    expect(userMessage(new WebhookSignatureError('Signature verification failed.'))).toBe(
      'Something went wrong. Try that again.',
    )
  })

  it('keeps the allowlist in step with the errors the code actually raises', () => {
    const declared = new Set(
      [
        ...readFileSync(join(process.cwd(), 'src/lib/errors.ts'), 'utf8').matchAll(
          /^ {2}'(\w+)',$/gm,
        ),
      ].map((match) => match[1]!),
    )

    // Deliberately withheld; see the note in errors.ts.
    const withheld = new Set(['EmailConfigError', 'WebhookSignatureError'])

    const raised = new Set<string>()
    for (const file of walk(join(process.cwd(), 'src'))) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue
      for (const match of readFileSync(file, 'utf8').matchAll(/this\.name = '(\w+)'/g)) {
        raised.add(match[1]!)
      }
    }

    const missing = [...raised].filter(
      (name) => !declared.has(name) && !withheld.has(name),
    )
    expect(missing).toEqual([])
  })
})

describe('payment provider errors', () => {
  it('translates a Stripe failure into a sentence', () => {
    const error = Object.assign(new Error('No such price: price_xyz'), {
      name: 'StripeInvalidRequestError',
    })
    const message = friendlyStripeError(error)
    expect(message).not.toContain('price_xyz')
    expect(message).toMatch(/billing/i)
  })

  it('does not leak a Stripe error that reaches the generic mapper', () => {
    const error = Object.assign(new Error('No such customer: cus_ABC123'), {
      name: 'StripeInvalidRequestError',
    })
    const message = userMessage(error, 'test')
    expect(message).not.toContain('cus_ABC123')
  })
})

describe('framework control flow', () => {
  it('recognises a Next.js redirect', () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/today;307;',
    })
    expect(isFrameworkControlFlow(redirect)).toBe(true)
  })

  it('lets a redirect through rather than turning it into an error message', () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/today;307;',
    })
    // Swallowing this would turn a working redirect into "something went wrong".
    expect(() => failure(redirect)).toThrow()
  })

  it('does not mistake an ordinary error for control flow', () => {
    expect(isFrameworkControlFlow(new Error('nope'))).toBe(false)
    expect(isFrameworkControlFlow({ digest: 'something else' })).toBe(false)
    expect(isFrameworkControlFlow(null)).toBe(false)
  })
})

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else yield full
  }
}
