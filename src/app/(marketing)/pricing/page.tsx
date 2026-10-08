import type { Metadata } from 'next'
import Link from 'next/link'
import { ButtonLink } from '@/components/ui/button'
import { CheckList, Eyebrow, Headline, Lede, Section } from '@/components/marketing/section'
import { PriceBlock } from '@/components/marketing/chrome'
import { pageMetadata } from '@/lib/seo'
import { INCLUDED_FEATURES, currentOffer, currentPriceLabel, trialLabel } from '@/lib/pricing'

export const metadata: Metadata = pageMetadata({
  path: '/pricing',
  title: `Pricing — ${currentPriceLabel()}, everything included`,
  description: `One plan, ${currentPriceLabel()}, with a ${trialLabel()}. Unlimited users and technicians, no per-technician fee, and every feature included.`,
})

/**
 * Pricing.
 *
 * Deliberately short. There is one plan, so the only honest page is the price,
 * what is in it, and the questions a buyer has about the things a price page
 * usually hides — whether hiring costs more, what happens at the end of the
 * trial, and what happens to the data if they leave.
 *
 * Every number comes from `@/lib/pricing`. There are no countdowns, no seat
 * limits and no expiry date, because none of those are true.
 */
export default function PricingPage() {
  const offer = currentOffer()

  return (
    <>
      <Section surface="base" className="pt-12 sm:pt-16" size="tight">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow className="text-center">Pricing</Eyebrow>
          <Headline as="h1" className="mt-4">
            {offer.isFounding ? 'Founding Member pricing.' : 'One plan. Everything in it.'}
          </Headline>
          <Lede className="mx-auto mt-6 text-center">
            One plan, every feature, however many people you put in trucks.
          </Lede>
        </div>

        <div className="mx-auto mt-12 max-w-2xl rounded-[--radius-card] border border-brand-800 bg-gradient-to-b from-brand-900/50 to-navy-900 p-7 sm:p-10">
          <PriceBlock align="center" />

          <div className="mt-9">
            <ButtonLink href="/signup" size="lg" fullWidth>
              Start Your {offer.trialDays}-Day Free Trial
            </ButtonLink>
            <p className="mt-3 text-center text-sm text-[color:var(--m-muted)]">
              No charge for {offer.trialDays} days. Card details are entered when you activate,
              not before.
            </p>
          </div>

          <div className="mt-9 border-t border-[color:var(--m-rule)] pt-8">
            <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-[color:var(--m-faint)]">
              Included
            </h2>
            <CheckList items={INCLUDED_FEATURES} className="mt-4" />
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-2xl rounded-[--radius-card] border border-navy-800 bg-navy-900 p-6 sm:p-7">
          <p className="text-lg font-bold text-[color:var(--m-heading)] sm:text-xl">
            Hire another technician? Your Garage Door HQ subscription stays the same.
          </p>
          <p className="mt-2.5 text-sm leading-relaxed text-[color:var(--m-body)] sm:text-base">
            There is no per-user fee and no per-technician fee. A one-truck owner-operator and a
            six-truck company pay the same {currentPriceLabel()}.
          </p>
        </div>
      </Section>

      <Section surface="light">
        <div className="mx-auto max-w-2xl">
          <Headline className="text-3xl sm:text-4xl">The things a price page usually skips</Headline>

          <dl className="mt-9 space-y-8">
            {[
              {
                q: 'What happens when the trial ends?',
                a: 'Your account becomes read-only. Everything you entered is still there and still visible — jobs, customers, doors, photos, invoices. You simply cannot create or change anything until you activate.',
              },
              {
                q: 'Can I cancel?',
                a: 'Yes, from the billing screen, which opens Stripe’s own portal. Cancelling takes effect at the end of the period you have already paid for.',
              },
              {
                q: 'What happens to my data if I cancel?',
                a: 'The same read-only state. Your data stays visible and nothing is deleted automatically. If you come back, everything is where you left it.',
              },
              {
                q: 'Do you take a cut of what my customers pay me?',
                a: 'No. Your customers pay you through your own Stripe account. Garage Door HQ is never the merchant and never holds that money; the only thing we charge you is this subscription.',
              },
              {
                q: 'Is the price locked in?',
                a: offer.isFounding
                  ? 'Founding Members stay on the price they subscribed at. If the public price changes later, your subscription does not change with it.'
                  : 'You stay on the price you subscribed at unless you deliberately change plan.',
              },
            ].map((item) => (
              <div key={item.q}>
                <dt className="text-base font-bold text-[color:var(--m-heading)] sm:text-lg">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-[color:var(--m-body)] sm:text-base">{item.a}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-10 text-sm text-[color:var(--m-muted)]">
            More questions?{' '}
            <Link href="/faq" className="font-semibold text-[color:var(--m-accent)] hover:text-[color:var(--m-accent-strong)]">
              Read the FAQ
            </Link>{' '}
            or{' '}
            <Link href="/contact" className="font-semibold text-[color:var(--m-accent)] hover:text-[color:var(--m-accent-strong)]">
              get in touch
            </Link>
            .
          </p>
        </div>
      </Section>
    </>
  )
}
