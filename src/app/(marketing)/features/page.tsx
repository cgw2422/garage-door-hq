import type { Metadata } from 'next'
import { ButtonLink } from '@/components/ui/button'
import { Eyebrow, Headline, Lede, Section } from '@/components/marketing/section'
import { BrowserShot, PhoneShot, ScreenFigure } from '@/components/marketing/screens'
import type { ScreenName } from '@/components/marketing/screens'
import { pageMetadata } from '@/lib/seo'
import { currentOffer } from '@/lib/pricing'

export const metadata: Metadata = pageMetadata({
  path: '/features',
  title: 'Features — Garage Door HQ',
  description:
    'Everything Garage Door HQ does, organised the way a garage door business runs: the day, the door, the sale, the work, getting paid, and running the business.',
})

/**
 * Features, grouped by when you use them rather than by what they are.
 *
 * An icon grid tells somebody that thirty features exist. It does not tell
 * them whether the software understands their work. These six groups are the
 * shape of the business — the day, the door, the sale, the work, the money,
 * the back office — so reading the page is reading a description of the job.
 */

interface Feature {
  name: string
  detail: string
}

interface Group {
  id: string
  eyebrow: string
  headline: string
  lede: string
  features: Feature[]
  screen: { name: ScreenName; alt: string; caption: string; kind: 'phone' | 'browser' }
}

const GROUPS: Group[] = [
  {
    id: 'run-the-day',
    eyebrow: 'Run the day',
    headline: 'Where am I going, and who am I seeing?',
    lede: 'The part of the software a technician opens twenty times a day, built to answer that in one screen.',
    features: [
      { name: 'Today', detail: "The next job, today's schedule, what is done and what is left, revenue and average ticket." },
      { name: 'Scheduling', detail: 'Put jobs on the calendar, move them when the day changes, and see the whole week.' },
      { name: 'Jobs', detail: 'A job carries its customer, property, door, inspection, estimate, parts and invoice.' },
      { name: 'Customers', detail: 'Customers, their properties, and every door at each one.' },
      { name: 'Team', detail: 'Invite technicians, assign work, and set what each role can do.' },
    ],
    screen: {
      kind: 'phone',
      name: 'today',
      alt: "The Today screen: today's revenue, jobs remaining and completed, average ticket, and the next job with call, text and directions",
      caption: 'Today, on the phone in the truck.',
    },
  },
  {
    id: 'at-the-door',
    eyebrow: 'At the door',
    headline: 'Everything about this specific door.',
    lede: 'Garage Door HQ models the equipment, not just the appointment. This is the part generic field-service software does not have.',
    features: [
      { name: 'Door Passport', detail: 'Size, manufacturer, model, serial, material, colour, insulation, weight, track and headroom.' },
      { name: 'Openers', detail: 'Make, model and serial of the opener fitted, kept through every replacement.' },
      { name: 'Spring systems', detail: 'Torsion or extension, wire size, inside diameter, length, wind direction and cycle rating.' },
      { name: 'Inspection', detail: 'Twenty-three components grouped by spring system, hardware, door, opener and safety.' },
      { name: 'Photos', detail: 'Taken on the job, attached to the door, and visible on the next visit.' },
      { name: 'Service history', detail: 'What was done, when, and what equipment went on or came off.' },
    ],
    screen: {
      kind: 'phone',
      name: 'door-passport',
      alt: 'A Door Passport for a 16 by 7 foot insulated Clopay steel door with its measured weight, track type and torsion spring pair',
      caption: 'A Door Passport. Every door at every property has one.',
    },
  },
  {
    id: 'sell-the-work',
    eyebrow: 'Sell the work',
    headline: 'The customer understands, chooses and signs.',
    lede: 'Findings become options, options become an estimate, and the estimate gets approved in the driveway or in their inbox.',
    features: [
      { name: 'Flexible estimates', detail: 'One option when there is one answer. Several when there is a choice.' },
      { name: 'One or multiple options', detail: 'The customer picks; the choice is recorded with what they agreed to.' },
      { name: 'Optional Good / Better / Best', detail: 'Available when you want to present tiers. Never required.' },
      { name: 'Customer Presentation Mode', detail: 'Your device becomes the customer’s estimate, locked to that estimate until a technician unlocks it.' },
      { name: 'Sent estimates', detail: 'Send a proposal to review later — the better workflow for a full installation.' },
      { name: 'Signatures', detail: 'Signed on the device, stored with the estimate and the option they chose.' },
    ],
    screen: {
      kind: 'phone',
      name: 'presentation-customer',
      alt: 'Customer Presentation Mode showing the homeowner what was found and the repair options to choose from',
      caption: 'Customer Presentation Mode — what the homeowner sees.',
    },
  },
  {
    id: 'do-the-work',
    eyebrow: 'Do the work',
    headline: 'The parts, and where they are.',
    lede: 'Stock lives on trucks and in the warehouse, moves between them, and comes off the count when it goes on a door.',
    features: [
      { name: 'Parts', detail: 'Your own catalogue, with cost and price, searchable by specification.' },
      { name: 'Truck inventory', detail: 'Each truck is a location with its own counts.' },
      { name: 'Warehouse inventory', detail: 'The shop stock, separate from what is on the road.' },
      { name: 'Transfers', detail: 'Move parts between the warehouse and a truck, or between trucks.' },
      { name: 'Minimum quantities', detail: 'Set a minimum per location and see what is below it.' },
      { name: 'Parts usage', detail: 'Completing a job with parts on it moves them out of the location they came from.' },
    ],
    screen: {
      kind: 'phone',
      name: 'truck-inventory',
      alt: 'Truck inventory showing springs, rollers, openers and cables with the quantity at each location',
      caption: 'What is actually on the truck.',
    },
  },
  {
    id: 'get-paid',
    eyebrow: 'Get paid',
    headline: 'Invoice it and take the money.',
    lede: 'The invoice is built from the work that was approved and the parts that were used, so it matches the job.',
    features: [
      { name: 'Invoices', detail: 'Generated from the approved estimate and the completed job, with their own numbering.' },
      { name: 'Payments', detail: 'Record cash, cheque or card. Card payments go through your own connected Stripe account.' },
    ],
    screen: {
      kind: 'phone',
      name: 'invoice',
      alt: 'An invoice showing the approved work, the parts used and the amount due',
      caption: 'An invoice, built from the job it came from.',
    },
  },
  {
    id: 'run-the-business',
    eyebrow: 'Run the business',
    headline: 'What it cost, what it made, what it is worth.',
    lede: 'The office half: your pricing, your people, your settings, and an honest read on whether the work is making money.',
    features: [
      { name: 'Money', detail: 'Revenue, jobs, average ticket, parts cost, processing fees and outstanding invoices.' },
      { name: 'Price book', detail: 'Your parts and labour, your prices, and reusable packages for the repairs you do every week.' },
      { name: 'Team', detail: 'Owner, admin and technician roles, each seeing what that role should see.' },
      { name: 'Settings', detail: 'Company details, tax, numbering, document terms and branding.' },
      { name: 'Estimated profitability', detail: 'Charged less parts cost less fees. For judging a job, not for your accounts.' },
    ],
    screen: {
      kind: 'browser',
      name: 'desktop-price-book',
      alt: 'The price book on a desktop browser, listing parts and labour with cost and price',
      caption: 'The price book, on the office machine.',
    },
  },
]

export default function FeaturesPage() {
  const offer = currentOffer()

  return (
    <>
      <Section surface="base" className="pt-12 sm:pt-16">
        <div className="max-w-3xl">
          <Eyebrow>Features</Eyebrow>
          <Headline as="h1" className="mt-4">
            Everything it does, in the order you do it.
          </Headline>
          <Lede className="mt-6">
            Garage Door HQ is one product with one price, so this is not a list of what you would
            get on a higher plan. It is a list of what is in front of you on day one, grouped the
            way a garage door business actually runs.
          </Lede>
        </div>

        <nav aria-label="Feature groups" className="mt-10">
          <ul className="flex flex-wrap gap-2.5">
            {GROUPS.map((group) => (
              <li key={group.id}>
                <a
                  href={`#${group.id}`}
                  className="inline-block rounded-full border border-navy-700 bg-navy-900 px-4 py-2 text-sm font-semibold text-navy-100 transition-colors hover:border-brand-700 hover:text-white"
                >
                  {group.eyebrow}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Section>

      {GROUPS.map((group, index) => (
        <Section key={group.id} id={group.id} surface={index % 2 === 0 ? 'raised' : 'base'}>
          <div
            className={`grid items-start gap-10 ${
              group.screen.kind === 'browser' ? 'lg:grid-cols-[1fr_1.1fr]' : 'lg:grid-cols-[1.25fr_0.75fr]'
            } lg:gap-14`}
          >
            <div className={index % 2 === 0 ? '' : 'lg:order-2'}>
              <Eyebrow>{group.eyebrow}</Eyebrow>
              <Headline className="mt-3">{group.headline}</Headline>
              <Lede className="mt-5">{group.lede}</Lede>

              <dl className="mt-8 space-y-6">
                {group.features.map((feature) => (
                  <div key={feature.name}>
                    <dt className="text-base font-bold text-white sm:text-lg">{feature.name}</dt>
                    <dd className="mt-1.5 text-sm leading-relaxed text-navy-200 sm:text-base">
                      {feature.detail}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className={index % 2 === 0 ? 'lg:order-2' : ''}>
              <ScreenFigure caption={group.screen.caption}>
                {group.screen.kind === 'phone' ? (
                  <PhoneShot
                    name={group.screen.name}
                    alt={group.screen.alt}
                    width={300}
                    sizes="(max-width: 640px) 76vw, 300px"
                  />
                ) : (
                  <BrowserShot
                    name={group.screen.name}
                    alt={group.screen.alt}
                    sizes="(max-width: 1024px) 92vw, 600px"
                  />
                )}
              </ScreenFigure>
            </div>
          </div>
        </Section>
      ))}

      <Section surface="deep">
        <div className="mx-auto max-w-2xl text-center">
          <Headline>See it with your own doors in it.</Headline>
          <Lede className="mx-auto mt-5 text-center">
            Add a customer, a door and a job in the first ten minutes. Nothing here needs setting
            up before it works.
          </Lede>
          <div className="mt-9">
            <ButtonLink href="/signup" size="lg">
              Start Your {offer.trialDays}-Day Free Trial
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  )
}
