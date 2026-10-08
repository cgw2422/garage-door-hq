import Image from 'next/image'
import Link from 'next/link'
import { Eyebrow, Headline, Lede, Section } from './section'
import {
  FOUNDER,
  TESTIMONIALS,
  USAGE,
  founderInitials,
  hasFounder,
  usageLabel,
} from '@/lib/social-proof'
import { cn } from '@/lib/cn'

/**
 * The three social-proof surfaces.
 *
 * Each one returns `null` when its content in `@/lib/social-proof` is empty,
 * so an unfilled slot is an absent section rather than a section full of
 * placeholder. That is deliberate: a visibly empty testimonial rail is worse
 * for a sceptical buyer than no testimonials at all, because it says the
 * product was built to display proof that never arrived.
 */

// ---------------------------------------------------------------------------

/**
 * "41 garage door companies", with the date it was true.
 *
 * The date is not decoration. A number with no date is a claim; a number with
 * a date is a measurement, and this site's voice is measurements.
 */
export function UsageCounter({ className }: { className?: string }) {
  if (!USAGE) return null

  const asOf = new Date(`${USAGE.asOf}T00:00:00Z`)
  return (
    <p className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm', className)}>
      <span className="num font-bold text-[color:var(--m-heading)]">{usageLabel(USAGE)}</span>
      <span className="text-[color:var(--m-body)]">running on Garage Door HQ</span>
      <span className="text-[color:var(--m-faint)]">
        as of{' '}
        <time dateTime={USAGE.asOf}>
          {asOf.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
        </time>
      </span>
    </p>
  )
}

// ---------------------------------------------------------------------------

/**
 * Named operator quotes.
 *
 * Name, company and town on every one, because those are what make a quote
 * checkable — a trade buyer recognises a town, and can look up a company. A
 * quote without them reads as written in-house, which is usually what it is.
 */
export function Testimonials({
  surface = 'sunken',
  id,
}: {
  surface?: 'base' | 'raised' | 'deep' | 'light' | 'sunken' | 'brand'
  id?: string
}) {
  if (TESTIMONIALS.length === 0) return null

  return (
    <Section surface={surface} id={id}>
      <div className="max-w-3xl">
        <Eyebrow>From the trucks</Eyebrow>
        <Headline className="mt-3">What it changed, in their words.</Headline>
      </div>

      <ul className="mt-12 grid gap-6 lg:grid-cols-3">
        {TESTIMONIALS.map((item) => (
          <li
            key={`${item.name}-${item.company}`}
            className="flex flex-col rounded-[--radius-card] border border-[color:var(--m-panel-border)] bg-[color:var(--m-panel)] p-6"
          >
            <blockquote className="flex-1 text-pretty text-base leading-relaxed text-[color:var(--m-heading)] sm:text-lg">
              &ldquo;{item.quote}&rdquo;
            </blockquote>
            <figcaption className="mt-6 flex items-center gap-3.5">
              {item.photo ? (
                <Image
                  src={item.photo}
                  alt=""
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0 rounded-full object-cover"
                />
              ) : null}
              <span className="text-sm leading-snug">
                <span className="block font-bold text-[color:var(--m-heading)]">{item.name}</span>
                <span className="block text-[color:var(--m-body)]">
                  {item.company} · {item.location}
                </span>
              </span>
            </figcaption>
          </li>
        ))}
      </ul>
    </Section>
  )
}

// ---------------------------------------------------------------------------

/**
 * The person behind the subscription.
 *
 * The photograph is optional and the initials are the fallback, because a
 * stock portrait is the single easiest thing on a page to catch out. Initials
 * derived from a real name claim nothing that is not true.
 */
export function FounderCard({ supportEmail }: { supportEmail: string | null }) {
  if (!hasFounder()) return null

  return (
    <div className="grid gap-8 sm:grid-cols-[auto_1fr] sm:gap-10">
      <div className="shrink-0">
        {FOUNDER.photo ? (
          <Image
            src={FOUNDER.photo}
            alt={`${FOUNDER.name}, ${FOUNDER.role}`}
            width={FOUNDER.photoSize?.width ?? 320}
            height={FOUNDER.photoSize?.height ?? 320}
            sizes="(max-width: 640px) 40vw, 180px"
            className="h-40 w-40 rounded-[--radius-card] object-cover sm:h-44 sm:w-44"
            priority
          />
        ) : (
          <span
            aria-hidden
            className="num flex h-40 w-40 items-center justify-center rounded-[--radius-card] border border-[color:var(--m-panel-border)] bg-[color:var(--m-chip-bg)] text-4xl font-bold text-[color:var(--m-accent)] sm:h-44 sm:w-44"
          >
            {founderInitials()}
          </span>
        )}
      </div>

      <div>
        <p className="text-xl font-bold text-[color:var(--m-heading)] sm:text-2xl">
          {FOUNDER.name}
        </p>
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--m-accent)]">
          {FOUNDER.role}
        </p>

        <div className="mt-5 space-y-3.5 text-base leading-relaxed text-[color:var(--m-body)]">
          {FOUNDER.story.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold">
          {supportEmail ? (
            <a
              href={`mailto:${supportEmail}`}
              className="text-[color:var(--m-accent)] underline underline-offset-4 hover:text-[color:var(--m-accent-strong)]"
            >
              {supportEmail}
            </a>
          ) : (
            <Link
              href="/contact"
              className="text-[color:var(--m-accent)] underline underline-offset-4 hover:text-[color:var(--m-accent-strong)]"
            >
              Get in touch
            </Link>
          )}
          {FOUNDER.profileUrl ? (
            <a
              href={FOUNDER.profileUrl}
              rel="me noopener noreferrer"
              target="_blank"
              className="text-[color:var(--m-accent)] underline underline-offset-4 hover:text-[color:var(--m-accent-strong)]"
            >
              {FOUNDER.profileLabel ?? 'Profile'}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * The whole About page body, so the page file stays a page.
 *
 * Renders with or without the founder card. The page exists either way:
 * `/about` returning a 404 is itself a trust problem, and the company-level
 * answer to "who is behind this" is true today.
 */
export function AboutBody({ supportEmail }: { supportEmail: string | null }) {
  return (
    <>
      <Section surface="base" className="pt-12 sm:pt-16" size="tight">
        <div className="max-w-3xl">
          <Eyebrow>About</Eyebrow>
          <Headline as="h1" size="large" className="mt-4">
            Who is behind this.
          </Headline>
          <Lede className="mt-6">
            You are about to put your customers&rsquo; addresses, your pricing and your money
            into somebody else&rsquo;s software. It is fair to want to know whose.
          </Lede>
        </div>
      </Section>

      {hasFounder() ? (
        <Section surface="light">
          <FounderCard supportEmail={supportEmail} />
        </Section>
      ) : null}

      <Section surface={hasFounder() ? 'sunken' : 'light'}>
        <div className="mx-auto max-w-3xl space-y-10">
          <section>
            <h2 className="text-xl font-bold text-[color:var(--m-heading)] sm:text-2xl">
              It is a small operation, on purpose
            </h2>
            <p className="mt-3.5 text-base leading-relaxed text-[color:var(--m-body)]">
              Garage Door HQ is not a general field-service product with a garage door option in
              a dropdown. It models the door — the springs on it, the opener fitted to it, what
              was replaced and when — because that is the part of the job generic software
              cannot hold. Being small is what makes that possible: mail reaches somebody who
              can actually change the product.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[color:var(--m-heading)] sm:text-2xl">
              What you can check for yourself
            </h2>
            <p className="mt-3.5 text-base leading-relaxed text-[color:var(--m-body)]">
              Every screenshot on this site is the real application against seeded demo data, not
              a mockup. The{' '}
              <Link
                href="/security"
                className="font-semibold text-[color:var(--m-accent)] underline underline-offset-4 hover:text-[color:var(--m-accent-strong)]"
              >
                security page
              </Link>{' '}
              says what is protected and names what we will not claim. The{' '}
              <Link
                href="/pricing"
                className="font-semibold text-[color:var(--m-accent)] underline underline-offset-4 hover:text-[color:var(--m-accent-strong)]"
              >
                pricing page
              </Link>{' '}
              answers what happens if you cancel before you have paid anything.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[color:var(--m-heading)] sm:text-2xl">
              Where your money goes, and does not
            </h2>
            <p className="mt-3.5 text-base leading-relaxed text-[color:var(--m-body)]">
              Your subscription is billed by Stripe. Your customers&rsquo; payments go to your own
              connected Stripe account, where your business is the merchant of record — those
              funds never pass through Garage Door HQ, and we take no percentage of the work you
              do.
            </p>
          </section>
        </div>
      </Section>
    </>
  )
}
