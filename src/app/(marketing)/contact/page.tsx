import type { Metadata } from 'next'
import Link from 'next/link'
import { Eyebrow, Headline, Lede, Section } from '@/components/marketing/section'
import { pageMetadata } from '@/lib/seo'
import { platformBranding } from '@/server/email/branding'

export const metadata: Metadata = pageMetadata({
  path: '/contact',
  title: 'Contact & support — Garage Door HQ',
  description:
    'Ask a question about Garage Door HQ, get help with your account, or report a problem.',
})

/**
 * Contact.
 *
 * The address comes from `EMAIL_SUPPORT_ADDRESS`, the same variable the
 * application puts in the Reply-To of every email it sends, so the address on
 * this page is the address that actually reaches somebody. If it is not
 * configured, the page says there is no published address yet rather than
 * printing an invented one.
 *
 * Nothing here claims a phone number, a street address or support hours,
 * because none of those exist.
 */

const ROUTES = [
  {
    title: 'Ask a question',
    body: 'Not sure whether Garage Door HQ does something, or how it would handle the way you work? Ask before you sign up. If the answer is "not yet", you will be told that.',
    subject: 'Question about Garage Door HQ',
  },
  {
    title: 'Get support',
    body: 'Already using it and stuck on something? Tell us what you were doing and what happened. Include your company name so we can find the account.',
    subject: 'Support request',
  },
  {
    title: 'Report a problem',
    body: 'Something broken, wrong, or behaving in a way that costs you time? Report it. Security problems in particular should come to us before they go anywhere else.',
    subject: 'Problem report',
  },
] as const

export default function ContactPage() {
  const support = platformBranding().supportEmail

  return (
    <>
      <Section surface="base" className="pt-12 sm:pt-16">
        <div className="max-w-3xl">
          <Eyebrow>Contact</Eyebrow>
          <Headline as="h1" className="mt-4">
            Talk to a person.
          </Headline>
          <Lede className="mt-6">
            Garage Door HQ is small. Mail reaches somebody who can actually change the product,
            which is the advantage of being small.
          </Lede>

          {support ? (
            <div className="mt-9 inline-flex flex-col rounded-[--radius-card] border border-brand-800 bg-brand-900/30 px-6 py-5">
              <span className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-brand-300">
                Email
              </span>
              <a
                href={`mailto:${support}`}
                className="mt-1.5 text-xl font-bold text-white underline decoration-brand-500 underline-offset-4 hover:text-brand-200 sm:text-2xl"
              >
                {support}
              </a>
            </div>
          ) : (
            <p className="mt-9 rounded-[--radius-card] border border-navy-800 bg-navy-900 px-6 py-5 text-base text-navy-200">
              A support address has not been published yet. If you already have an account, use
              the support link inside the app.
            </p>
          )}
        </div>
      </Section>

      <Section surface="raised" tight>
        <div className="grid gap-6 lg:grid-cols-3">
          {ROUTES.map((route) => (
            <div
              key={route.title}
              className="flex flex-col rounded-[--radius-card] border border-navy-800 bg-navy-950 p-6"
            >
              <h2 className="text-lg font-bold text-white">{route.title}</h2>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-navy-200">{route.body}</p>
              {support ? (
                <a
                  href={`mailto:${support}?subject=${encodeURIComponent(route.subject)}`}
                  className="mt-5 text-sm font-semibold text-brand-300 hover:text-brand-200"
                >
                  Email us about this →
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section surface="base">
        <div className="mx-auto max-w-2xl text-center">
          <Headline className="text-2xl sm:text-3xl">Already a customer?</Headline>
          <Lede className="mx-auto mt-4 text-center">
            Sign in and use the support link in the app — it tells us which account you are
            writing about, which usually saves a round trip.
          </Lede>
          <p className="mt-7">
            <Link
              href="/login"
              className="text-base font-semibold text-brand-300 hover:text-brand-200"
            >
              Sign in →
            </Link>
          </p>
        </div>
      </Section>
    </>
  )
}
