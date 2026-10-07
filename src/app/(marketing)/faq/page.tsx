import type { Metadata } from 'next'
import Link from 'next/link'
import { ButtonLink } from '@/components/ui/button'
import { Eyebrow, Headline, Lede, Section } from '@/components/marketing/section'
import { pageMetadata } from '@/lib/seo'
import { currentOffer, currentPriceLabel, trialLabel } from '@/lib/pricing'

export const metadata: Metadata = pageMetadata({
  path: '/faq',
  title: 'Frequently asked questions — Garage Door HQ',
  description:
    'What Garage Door HQ costs, whether you pay per technician, whether your customer needs an app, how signatures and card payments work, and what happens to your data if you cancel.',
})

/**
 * The FAQ.
 *
 * Every answer here is checked against what the application does, not what it
 * would be convenient to claim. Where the honest answer has a limit in it, the
 * limit is in the answer: card payments need a connected Stripe account;
 * cancelling leaves the account read-only rather than deleting it; spring
 * lookup matches a measured spring rather than calculating one.
 *
 * The price answers are interpolated from `@/lib/pricing`, so this page cannot
 * be the one that still says $39.99 after the offer changes.
 */

interface Entry {
  q: string
  /** Plain text. Always the structured-data answer, and the page's by default. */
  a: string
  /**
   * Rendered instead of `a` when the answer needs markup — a struck-through
   * price, say. The plain `a` still goes to the structured data, so the two
   * cannot say different things.
   */
  rich?: React.ReactNode
  /** Optional extra paragraph, page only. */
  more?: React.ReactNode
}

function entries(): Entry[] {
  const offer = currentOffer()
  return [
    {
      q: 'How much is Garage Door HQ?',
      a: offer.isFounding
        ? `${currentPriceLabel()} for Founding Members, down from $39.99/month or $399/year. It starts with a ${trialLabel()}, and everything is included.`
        : `${currentPriceLabel()}, with a ${trialLabel()}. Everything is included.`,
      rich: offer.isFounding ? (
        <>
          <strong className="num text-white">{currentPriceLabel()}</strong> for Founding Members,
          down from{' '}
          {offer.strikethroughCents.map((price, index) => (
            <span key={price.interval}>
              {index > 0 ? ' or ' : ''}
              <s className="num text-navy-400">
                ${price.cents / 100}/{price.interval}
              </s>
            </span>
          ))}
          . It starts with a {trialLabel()}, and everything is included.
        </>
      ) : undefined,
    },
    {
      q: 'Do you charge per technician?',
      a: 'No. There is no per-user fee and no per-technician fee. Adding someone to your team does not change what you pay.',
    },
    {
      q: 'Can a one-man garage door company use Garage Door HQ?',
      a: 'Yes, and it is set up for that by default. Choose "just me" at signup and your truck is called My Truck, the schedule is your schedule, and nothing asks you to assign work to yourself.',
    },
    {
      q: 'Do I have to use Good / Better / Best?',
      a: 'No. An estimate can have one option, two, or three. If the spring is broken and the repair is a spring, present one repair at one price. Good / Better / Best is there when you want to offer tiers.',
    },
    {
      q: 'Does my customer need an app?',
      a: 'No. Nothing is installed on the customer’s phone. They either sign on your device in Customer Presentation Mode, or open a link you send them in an ordinary web browser.',
    },
    {
      q: 'Can my customer sign on my phone or tablet?',
      a: 'Yes. That is Customer Presentation Mode: you hand over the device, it locks to that one estimate, and they read, choose and sign on it. A technician password is needed to get back out, so handing over your phone does not hand over your business.',
    },
    {
      q: 'Can I send estimates instead?',
      a: 'Yes. You can email a customer a link to the estimate and they can review and approve it in their own time. For a full installation proposal that is usually the better workflow.',
    },
    {
      q: 'Can I track multiple doors at one property?',
      a: 'Yes. A customer has properties and a property has as many doors as it has. Each door is its own record with its own equipment and its own history, named however you point at it — Front Garage, Left Bay, Shop.',
    },
    {
      q: 'Does Garage Door HQ track springs and openers?',
      a: 'Yes, as equipment on the door rather than as notes. A spring system records type, wire size, inside diameter, length, wind direction and cycle rating. An opener records make, model and serial. When either is replaced, the old one stays in the history instead of being overwritten.',
    },
    {
      q: 'Can I look up a spring?',
      a: 'Yes. Enter the wire size, inside diameter and length you measured and Garage Door HQ finds the matching parts in your price book and shows how many are on your truck, in the warehouse and on other trucks.',
      more: (
        <>
          What it deliberately does <strong className="text-white">not</strong> do is calculate a
          spring from a door weight. That is engineering, and a wrong answer puts somebody under a
          loaded door. The screen says so rather than guessing.
        </>
      ),
    },
    {
      q: 'Can I track inventory on individual trucks?',
      a: 'Yes. Every truck is its own stock location, separate from the warehouse. You can transfer parts between locations, set a minimum quantity per location, and see what is below it. Completing a job with parts on it takes them off the location they came from.',
    },
    {
      q: 'Can I accept card payments?',
      a: 'Yes, once you connect your own Stripe account from the payments settings. Your customer pays by card and the money settles into your account. You can also record cash and cheque payments without connecting anything.',
    },
    {
      q: 'Does Garage Door HQ hold my customer’s money?',
      a: 'No. Customer payments are charged directly on your own connected Stripe account — your business is the merchant of record, and the funds never pass through Garage Door HQ. The only thing we bill is your subscription.',
    },
    {
      q: 'Can I cancel?',
      a: 'Yes. Cancelling is done from the billing screen, which opens Stripe’s own portal, and takes effect at the end of the period you have already paid for.',
    },
    {
      q: 'What happens to my data if I cancel?',
      a: 'Your account becomes read-only. Every job, customer, door, photo, estimate and invoice stays visible and nothing is deleted automatically. If you come back later and activate again, it is all where you left it.',
    },
    {
      q: 'Can I get my data out?',
      a: 'Estimates and invoices download as PDFs from inside the app. For a full export of your account, contact support and we will arrange it.',
    },
  ]
}

export default function FaqPage() {
  const items = entries()

  // FAQPage structured data, generated from the same array the page renders,
  // so the two can never say different things.
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }

  return (
    <>
      {/*
        Rendered as a text child rather than through React's raw-HTML escape
        hatch. The product has one rule about raw HTML — it never writes any,
        and a test enforces it by scanning the source — and a search-engine
        nicety is not the thing to make the first exception for. React renders
        a string child of <script> as text content, and `<` is escaped so a
        future answer containing a closing script tag cannot end it early.
      */}
      <script type="application/ld+json">
        {JSON.stringify(structuredData).replaceAll('<', '\\u003c')}
      </script>

      <Section surface="base" className="pt-12 sm:pt-16">
        <div className="max-w-3xl">
          <Eyebrow>FAQ</Eyebrow>
          <Headline as="h1" className="mt-4">
            Questions worth a straight answer.
          </Headline>
          <Lede className="mt-6">
            Including the ones where the honest answer has a limit in it.
          </Lede>
        </div>
      </Section>

      <Section surface="raised" tight>
        <dl className="mx-auto max-w-3xl divide-y divide-navy-800">
          {items.map((item) => (
            <div key={item.q} className="py-7 first:pt-0 last:pb-0">
              <dt className="text-lg font-bold text-white sm:text-xl">{item.q}</dt>
              <dd className="mt-3 space-y-3 text-base leading-relaxed text-navy-200">
                <p>{item.rich ?? item.a}</p>
                {item.more ? <p>{item.more}</p> : null}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section surface="deep">
        <div className="mx-auto max-w-2xl text-center">
          <Headline>Something not answered here?</Headline>
          <Lede className="mx-auto mt-5 text-center">
            Ask. A real person reads it, and if the answer is &ldquo;not yet&rdquo; you will be
            told that rather than sold around it.
          </Lede>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <ButtonLink href="/contact" size="lg" className="w-full sm:w-auto">
              Contact us
            </ButtonLink>
            <Link
              href="/signup"
              className="text-sm font-semibold text-brand-300 hover:text-brand-200"
            >
              Or start the free trial →
            </Link>
          </div>
        </div>
      </Section>
    </>
  )
}
