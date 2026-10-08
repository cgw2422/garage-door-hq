import type { Metadata } from 'next'
import Link from 'next/link'
import { ButtonLink } from '@/components/ui/button'
import { Eyebrow, Headline, Lede, Section } from '@/components/marketing/section'
import { Accordion, AccordionItem } from '@/components/marketing/accordion'
import { pageMetadata } from '@/lib/seo'
import { currentOffer, currentPriceLabel, trialLabel } from '@/lib/pricing'

export const metadata: Metadata = pageMetadata({
  path: '/faq',
  title: 'Frequently asked questions — Garage Door HQ',
  description:
    'What Garage Door HQ costs, whether you pay per technician, whether your customer needs an app, how signatures and card payments work, and what happens to your data if you cancel.',
})

/**
 * The FAQ, grouped and collapsed.
 *
 * Fifteen questions as one flat list of open answers was four screens of
 * scrolling to find the one you came for. Five topics of collapsed answers is
 * one screen, and the question you want is a heading rather than a paragraph
 * to skim. The first item in each group opens on load so the pattern is
 * obvious without instructions.
 *
 * Every answer is checked against what the application does. Where the honest
 * answer has a limit in it, the limit is in the answer — spring lookup matches
 * rather than sizes, cancelling leaves the account read-only rather than
 * deleting it, card payments need a connected Stripe account.
 *
 * The structured data is generated from the same array the page renders, so
 * the two cannot drift apart.
 */

interface Entry {
  q: string
  /** Plain text. Always the structured-data answer, and the page's by default. */
  a: string
  /** Rendered instead of `a` when the answer needs markup. */
  rich?: React.ReactNode
  /** An extra paragraph, page only. */
  more?: React.ReactNode
}

interface Group {
  id: string
  title: string
  blurb: string
  entries: Entry[]
}

function groups(): Group[] {
  const offer = currentOffer()

  return [
    {
      id: 'pricing',
      title: 'Pricing & Billing',
      blurb: 'What it costs, what happens at the end of the trial, and how to leave.',
      entries: [
        {
          q: 'How much is Garage Door HQ?',
          a: offer.isFounding
            ? `${currentPriceLabel()} for Founding Members, down from $39.99/month or $399/year. It starts with a ${trialLabel()}, and everything is included.`
            : `${currentPriceLabel()}, with a ${trialLabel()}. Everything is included.`,
          rich: offer.isFounding ? (
            <>
              <strong className="num text-[color:var(--m-heading)]">{currentPriceLabel()}</strong>{' '}
              for Founding Members, down from{' '}
              {offer.strikethroughCents.map((price, index) => (
                <span key={price.interval}>
                  {index > 0 ? ' or ' : ''}
                  <s className="num text-[color:var(--m-faint)]">
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
          q: 'Do I need a card to start the trial?',
          a: `No. You sign up, you get ${offer.trialDays} days, and card details are entered when you choose to activate. Nothing is charged before that.`,
        },
        {
          q: 'What happens when the trial ends?',
          a: 'Your account becomes read-only. Every job, customer, door, photo, estimate and invoice stays visible — you simply cannot create or change anything until you activate.',
        },
        {
          q: 'Can I cancel?',
          a: 'Yes. Cancelling is done from the billing screen, which opens Stripe’s own portal, and takes effect at the end of the period you have already paid for. Partial periods are not pro-rated.',
        },
        {
          q: 'Is my price locked in?',
          a: offer.isFounding
            ? 'Founding Members stay on the Stripe price they subscribed at. If the public price changes later, an existing subscription does not change with it.'
            : 'You stay on the price you subscribed at unless you deliberately change plan.',
        },
        {
          q: 'Does Garage Door HQ take a cut of what my customers pay me?',
          a: 'No. Your customers pay you through your own connected Stripe account, where your business is the merchant of record. Those funds never pass through Garage Door HQ, and the only thing we bill you is this subscription.',
        },
      ],
    },
    {
      id: 'getting-started',
      title: 'Getting Started',
      blurb: 'Whether it fits how you work today, and how long setup takes.',
      entries: [
        {
          q: 'Can a one-man garage door company use Garage Door HQ?',
          a: 'Yes, and it is set up for that by default. Choose "just me" at signup and your truck is called My Truck, the schedule is your schedule, and nothing asks you to assign work to yourself.',
        },
        {
          q: 'How long does it take to set up?',
          a: 'A new account arrives with a starter price book, garage-door job types, inspection remedies and an inventory location already in place, so you can add a customer, a door and a job in the first ten minutes. Replacing the starter prices with your own is the part that takes real time, and you can do it as you go.',
        },
        {
          q: 'Can I use it on a desktop as well as a phone?',
          a: 'Yes. It is the same application at any screen size. Field work suits a phone; the price book, the schedule and the money screen are easier from a desk.',
        },
        {
          q: 'What about the technicians I hire later?',
          a: 'Invite them by email. They get their own login and the technician role, which lets them do the work — jobs, inspections, estimates, photos, the parts on their truck — without seeing your pricing margins, your revenue, or your team settings. Your bill does not change.',
        },
      ],
    },
    {
      id: 'estimates',
      title: 'Estimates & Customers',
      blurb: 'How the customer sees the work, chooses it, and approves it.',
      entries: [
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
          a: 'Yes. You hand over the device, it locks to that one estimate, and they read, choose and sign on it. Navigating anywhere else is refused by the server rather than merely hidden, and a technician password is needed to get back out.',
        },
        {
          q: 'Can I send estimates instead?',
          a: 'Yes. You can email a customer a link to the estimate and they can review and approve it in their own time. For a full installation proposal that is usually the better workflow.',
        },
        {
          q: 'Is a customer link safe to email?',
          a: 'It carries a long random token, and only a hash of that token is stored, so the link cannot be reconstructed from our database. It opens that one document and nothing else — no account, no other customer — and it stops working after it expires or if you revoke it.',
        },
        {
          q: 'Can I track multiple doors at one property?',
          a: 'Yes. A customer has properties and a property has as many doors as it has. Each door is its own record with its own equipment and history, named however you point at it — Front Garage, Left Bay, Shop.',
        },
      ],
    },
    {
      id: 'equipment',
      title: 'Equipment & Inventory',
      blurb: 'The parts of the product that know what a garage door is.',
      entries: [
        {
          q: 'Does Garage Door HQ track springs and openers?',
          a: 'Yes, as equipment on the door rather than as notes. A spring system records type, wire size, inside diameter, length, wind direction and cycle rating. An opener records make, model and serial. When either is replaced, the old one stays in the history instead of being overwritten.',
        },
        {
          q: 'Can I look up a spring?',
          a: 'Yes. Enter the wire size, inside diameter and length you measured and Garage Door HQ finds the matching parts in your price book and shows how many are on your truck, in the warehouse and on other trucks.',
          more: (
            <>
              What it deliberately does <strong className="text-[color:var(--m-heading)]">not</strong>{' '}
              do is calculate a spring from a door weight. That is engineering, and a wrong answer
              puts somebody under a loaded door. The screen says so rather than guessing.
            </>
          ),
        },
        {
          q: 'Can I track inventory on individual trucks?',
          a: 'Yes. Every truck is its own stock location, separate from the warehouse. You can transfer parts between locations, set a minimum quantity per location, and see what is below it. Completing a job with parts on it takes them off the location they came from.',
        },
        {
          q: 'What does the inspection actually cover?',
          a: 'Twenty-three components in five groups: spring system, hardware, door, opener and safety. Each one takes the kind of answer that component has, rather than one Good/Worn/Failed scale applied to everything — a balance test is Balanced or Needs Adjustment, lubrication is Complete or Needed, auto-reverse passes or fails.',
        },
        {
          q: 'What happens if I lose signal mid-inspection?',
          a: 'Anything typed is saved on the device as you go and restored if the page reloads, so you do not lose your notes. It is a draft buffer rather than full offline sync — the inspection still needs signal to save to the server.',
        },
      ],
    },
    {
      id: 'security',
      title: 'Security & Data',
      blurb: 'Who can see what, and what happens to it if you leave.',
      entries: [
        {
          q: 'Can I accept card payments?',
          a: 'Yes, once you connect your own Stripe account from the payments settings. Your customer pays by card and the money settles into your account. You can also record cash and cheque payments without connecting anything.',
        },
        {
          q: 'Does Garage Door HQ hold my customer’s money?',
          a: 'No. Customer payments are charged directly on your own connected Stripe account — your business is the merchant of record, and the funds never pass through Garage Door HQ.',
        },
        {
          q: 'Is my company’s data separate from other companies?',
          a: 'Yes. Every record belongs to exactly one company, and the database connection the application uses is scoped to your company before a query is written. A request for somebody else’s record does not return the wrong answer; it returns nothing. Tests deliberately try to cross that boundary on every build.',
        },
        {
          q: 'What happens to my data if I cancel?',
          a: 'Your account becomes read-only. Everything stays visible and nothing is deleted automatically. If you come back later and activate again, it is all where you left it. If you want it deleted instead, ask and we will do it.',
        },
        {
          q: 'Can I get my data out?',
          a: 'Estimates and invoices download as PDFs from inside the app. For a full export of your account, contact support and we will arrange it.',
        },
        {
          q: 'Where are photos stored?',
          a: 'In private object storage, not on a public web address. The application hands out short-lived links to the specific person allowed to see a specific photo, so an address that leaks stops working rather than staying open.',
        },
      ],
    },
  ]
}

export default function FaqPage() {
  const topics = groups()
  const all = topics.flatMap((group) => group.entries)

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: all.map((item) => ({
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

      <Section surface="base" className="pt-12 sm:pt-16" size="tight">
        <div className="max-w-3xl">
          <Eyebrow>FAQ</Eyebrow>
          <Headline as="h1" size="large" className="mt-4">
            Questions worth a straight answer.
          </Headline>
          <Lede className="mt-6">
            Including the ones where the honest answer has a limit in it.
          </Lede>
        </div>

        <nav aria-label="Topics" className="mt-9">
          <ul className="flex flex-wrap gap-2.5">
            {topics.map((group) => (
              <li key={group.id}>
                <a
                  href={`#${group.id}`}
                  className="inline-block rounded-full border border-navy-700 bg-navy-900 px-4 py-2 text-sm font-semibold text-navy-100 transition-colors hover:border-brand-700 hover:text-white"
                >
                  {group.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Section>

      {topics.map((group, groupIndex) => (
        <Section
          key={group.id}
          id={group.id}
          surface={groupIndex % 2 === 0 ? 'light' : 'sunken'}
          size="tight"
        >
          <div className="grid gap-8 lg:grid-cols-[minmax(0,18rem)_1fr] lg:gap-14">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <Headline size="small">{group.title}</Headline>
              <p className="mt-2.5 text-sm leading-relaxed text-[color:var(--m-body)]">
                {group.blurb}
              </p>
            </div>

            <Accordion>
              {group.entries.map((item, index) => (
                <AccordionItem key={item.q} question={item.q} defaultOpen={index === 0}>
                  <p>{item.rich ?? item.a}</p>
                  {item.more ? <p>{item.more}</p> : null}
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Section>
      ))}

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
