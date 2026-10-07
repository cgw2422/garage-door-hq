import type { Metadata } from 'next'
import Link from 'next/link'
import { Eyebrow, Headline, Lede, Section } from '@/components/marketing/section'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  path: '/security',
  title: 'Security — Garage Door HQ',
  description:
    'How Garage Door HQ keeps one company’s data separate from another’s, who inside your company can see what, how customer links and photos are protected, and how card payments are handled.',
})

/**
 * Security, written for a garage door company owner.
 *
 * Two rules shaped this page. It does not publish the internal audit, the
 * attack methodology or the infrastructure layout — that helps an attacker
 * more than it helps a customer. And it does not claim anything that has not
 * been built: no "100% secure", no "unhackable", no compliance badge nobody
 * has been audited against, and no backup guarantee beyond what is actually
 * verified.
 *
 * Where something is the operator's responsibility rather than the software's,
 * it says so.
 */

const TOPICS = [
  {
    title: 'Your company’s data is separate from every other company’s',
    body: 'Every customer, door, job, estimate, invoice and photo belongs to exactly one company. The database connection the application uses is scoped to your company before a query is written, so a request for somebody else’s record does not return the wrong answer — it returns nothing. This is enforced in one place rather than remembered screen by screen, and it is covered by tests that deliberately try to reach across the boundary.',
  },
  {
    title: 'People in your company see what their role should see',
    body: 'Owner, admin and technician are different. A technician can do their work — jobs, inspections, estimates, photos, the parts on their truck — without being able to change your pricing, see your revenue, or manage your team. Permissions are checked on the server for every action, not just hidden in the interface, so a URL typed by hand is refused the same way a missing button is.',
  },
  {
    title: 'Links you send a customer open one thing and expire',
    body: 'When you send an estimate or an invoice to a customer, the link carries a long random token. Only a hash of that token is stored, so the link cannot be reconstructed from the database. It opens that one document and nothing else — no account, no other customer, no part of your business — and it stops working after it expires.',
  },
  {
    title: 'Handing a customer your phone does not hand over your business',
    body: 'Customer Presentation Mode locks the device to a single estimate. Navigating anywhere else is refused by the server, not just hidden, and photos are limited to the ones on that estimate. Getting back out needs a technician password. The customer can read, choose and sign; they cannot browse.',
  },
  {
    title: 'Photos are private',
    body: 'Job and door photos are stored in private object storage, not on a public web address. The application hands out short-lived links to the specific person who is allowed to see a specific photo, so an address that leaks stops working rather than staying open.',
  },
  {
    title: 'We never see a card number',
    body: 'Card details are entered on Stripe’s own pages, never on ours. Your subscription is billed by Stripe; your customers pay you through your own connected Stripe account, where your business is the merchant of record. Garage Door HQ stores the card brand and the last four digits for recognition and nothing else — no number we could charge with.',
  },
  {
    title: 'A signed estimate stays the estimate that was signed',
    body: 'The signature is stored with the estimate and with the specific option the customer chose, at the moment they chose it. Estimate and invoice numbers are assigned once and never reused or renumbered, so a document a customer already has keeps the number it was sent with.',
  },
  {
    title: 'Passwords and sessions',
    body: 'Passwords are stored hashed, never in a form anyone can read. Changing a password, or resetting it, immediately signs out every other session on every other device — so a phone left in a van is handled by changing a password rather than by hoping.',
  },
] as const

export default function SecurityPage() {
  return (
    <>
      <Section surface="base" className="pt-12 sm:pt-16">
        <div className="max-w-3xl">
          <Eyebrow>Security</Eyebrow>
          <Headline as="h1" className="mt-4">
            Your customers&rsquo; details are your reputation.
          </Headline>
          <Lede className="mt-6">
            Names, addresses, phone numbers, photos of the inside of people&rsquo;s garages, and
            what they paid. Here is how that is handled, in plain terms.
          </Lede>
        </div>
      </Section>

      <Section surface="raised" tight>
        <div className="mx-auto max-w-3xl space-y-10">
          {TOPICS.map((topic) => (
            <article key={topic.title}>
              <h2 className="text-xl font-bold text-white sm:text-2xl">{topic.title}</h2>
              <p className="mt-3 text-base leading-relaxed text-navy-200">{topic.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section surface="base">
        <div className="mx-auto max-w-3xl">
          <Headline className="text-2xl sm:text-3xl">What we will not claim</Headline>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-navy-200">
            <p>
              No software is unbreakable, and anyone who tells you theirs is has told you
              something useful about themselves. Garage Door HQ is built carefully, tested
              adversarially against the failures that would matter most to you, and reviewed when
              it changes — but it is software, written by people, and that is the honest size of
              the promise.
            </p>
            <p>
              We do not hold a compliance certification, and we will not print a badge for an
              audit nobody has carried out. If that is a requirement for your business, tell us
              and we will give you a straight answer about where we are rather than a
              reassuring one.
            </p>
          </div>

          <div className="mt-10 rounded-[--radius-card] border border-navy-800 bg-navy-900 p-6">
            <h2 className="text-lg font-bold text-white">Found something?</h2>
            <p className="mt-2 text-base leading-relaxed text-navy-200">
              If you believe you have found a security problem, please{' '}
              <Link
                href="/contact"
                className="font-semibold text-brand-300 underline hover:text-brand-200"
              >
                report it to us
              </Link>{' '}
              before publishing it. We will acknowledge it, tell you what we find, and fix it.
            </p>
          </div>
        </div>
      </Section>
    </>
  )
}
