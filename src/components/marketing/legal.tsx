import type { ReactNode } from 'react'
import { Headline, Section } from './section'

/**
 * Typography for the privacy policy and the terms.
 *
 * These are the two pages on the site somebody reads properly rather than
 * skims, usually because they are deciding whether to trust a business with
 * their customers' addresses. So: a narrow measure, generous line height, real
 * heading hierarchy, and a visible last-updated date at the top rather than
 * buried at the bottom.
 */

export function LegalPage({
  title,
  updated,
  summary,
  children,
}: {
  title: string
  /** ISO date; rendered long-form and machine-readable. */
  updated: string
  summary: string
  children: ReactNode
}) {
  const date = new Date(`${updated}T00:00:00Z`)
  return (
    <>
      <Section surface="base" className="pt-12 sm:pt-16" size="tight">
        <div className="mx-auto max-w-3xl">
          <Headline as="h1">{title}</Headline>
          <p className="mt-5 text-base leading-relaxed text-[color:var(--m-body)] sm:text-lg">{summary}</p>
          <p className="mt-6 text-sm text-[color:var(--m-faint)]">
            Last updated{' '}
            <time dateTime={updated}>
              {date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </time>
          </p>
        </div>
      </Section>

      <Section surface="light" size="tight">
        <div className="mx-auto max-w-3xl space-y-10">{children}</div>
      </Section>
    </>
  )
}

export function Clause({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-[color:var(--m-heading)] sm:text-2xl">{heading}</h2>
      <div className="mt-3.5 space-y-3.5 text-base leading-relaxed text-[color:var(--m-body)]">{children}</div>
    </section>
  )
}

export function Bullets({ items }: { items: readonly ReactNode[] }) {
  return (
    <ul className="space-y-2.5 pl-1">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--m-accent)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
