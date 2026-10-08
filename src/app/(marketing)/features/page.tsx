import type { Metadata } from 'next'
import Link from 'next/link'
import { ButtonLink } from '@/components/ui/button'
import {
  Aside,
  Eyebrow,
  FactList,
  Headline,
  Lede,
  Section,
} from '@/components/marketing/section'
import {
  CapabilityGrid,
  Caveat,
  ShowcaseFeature,
  SplitFeature,
} from '@/components/marketing/feature'
import { PhoneGallery, PhonePair, Showcase } from '@/components/marketing/screens'
import { pageMetadata } from '@/lib/seo'
import { currentOffer } from '@/lib/pricing'

export const metadata: Metadata = pageMetadata({
  path: '/features',
  title: 'Features — Garage Door HQ',
  description:
    'Door Passports, garage-door inspections, flexible estimates, Customer Presentation Mode, spring lookup and truck inventory — plus everything else, organised the way a garage door business runs.',
})

/**
 * Features, with a hierarchy.
 *
 * The first version gave six groups equal weight and equal shape, which is the
 * same as giving none of them any. Four things are the reason somebody would
 * choose this over generic field-service software — the Door Passport, the
 * inspection-to-estimate path, Presentation Mode, and spring lookup meeting
 * truck stock — so those get a full-width screen each. Everything else is a
 * compact grid, which is the right size for "yes, it schedules jobs".
 */

const RUN_THE_DAY = [
  { name: 'Today', detail: "The next job, the day's schedule, what is done and what is left, revenue and average ticket." },
  { name: 'Scheduling', detail: 'Put jobs on the calendar, move them when the day changes, see the whole week.' },
  { name: 'Jobs', detail: 'A job carries its customer, property, door, inspection, estimate, parts and invoice.' },
  { name: 'Customers', detail: 'Customers, their properties, and every door at each one.' },
  { name: 'Global search', detail: 'One box across customers, jobs and parts.' },
  { name: 'Team and roles', detail: 'Owner, admin and technician, each seeing what that role should.' },
] as const

const DO_THE_WORK = [
  { name: 'Parts catalogue', detail: 'Your own, with cost and price, searchable by specification.' },
  { name: 'Truck inventory', detail: 'Each truck is a stock location with its own counts.' },
  { name: 'Warehouse inventory', detail: 'The shop stock, kept separate from what is on the road.' },
  { name: 'Transfers', detail: 'Move parts warehouse-to-truck, or truck-to-truck.' },
  { name: 'Minimum quantities', detail: 'Set a minimum per location and see what is below it.' },
  { name: 'Parts usage', detail: 'Completing a job moves its parts out of the location they came from.' },
] as const

const GET_PAID = [
  { name: 'Invoices', detail: 'Built from the approved estimate and the completed job, with their own numbering.' },
  { name: 'Card payments', detail: 'Through your own connected Stripe account, with your business as merchant of record.' },
  { name: 'Cash and cheque', detail: 'Recorded against the invoice without connecting anything.' },
  { name: 'Customer links', detail: 'Send an estimate or invoice as a link that opens that one document and expires.' },
  { name: 'PDFs', detail: 'Estimates and invoices download as PDFs carrying your branding.' },
  { name: 'Money', detail: 'Revenue, jobs, average ticket, parts cost, processing fees, outstanding invoices.' },
] as const

const AT_THE_DOOR_FACTS = [
  'Size, panel count and style',
  'Manufacturer, model and serial',
  'Material, colour and insulation',
  'Measured door weight',
  'Track type, radius and headroom',
  'Opener make, model and serial',
  'Spring type, wire size, wind, cycles',
  'Warranty dates, door and labour',
  'Full service history',
  'Photos from every visit',
] as const

export default function FeaturesPage() {
  const offer = currentOffer()

  return (
    <>
      {/* ---------------------------------------------------------------- Intro */}
      <Section surface="base" className="pt-12 sm:pt-16" size="tight">
        <div className="max-w-3xl">
          <Eyebrow>Features</Eyebrow>
          <Headline as="h1" size="large" className="mt-4">
            Four things generic software doesn&rsquo;t have.
          </Headline>
          <Lede className="mt-6">
            Then everything else you would expect, included at the same price. Garage Door HQ is
            one product with one plan, so this is not a list of what you would get if you paid
            more — it is what is in front of you on day one.
          </Lede>
        </div>

        <nav aria-label="Feature groups" className="mt-10">
          <ul className="flex flex-wrap gap-2.5">
            {[
              ['door-passport', 'Door Passport'],
              ['inspection', 'Inspection → Estimate'],
              ['presentation', 'Presentation Mode'],
              ['springs', 'Spring Lookup + Inventory'],
              ['everything-else', 'Everything else'],
            ].map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-block rounded-full border border-navy-700 bg-navy-900 px-4 py-2 text-sm font-semibold text-navy-100 transition-colors hover:border-brand-700 hover:text-white"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Section>

      {/* -------------------------------------------------- 1 · Door Passport */}
      <ShowcaseFeature
        id="door-passport"
        surface="light"
        eyebrow="01 · Door Passport"
        headline="Every door is a record, not a line on an invoice."
        lede="A customer has properties. A property has doors. Each door carries its own equipment, measurements and history — and keeps them when the technician who wrote them down leaves."
        media={
          <Showcase
            name="desktop-door-passport"
            alt="A Door Passport for a 16 by 7 foot insulated Clopay Premium Series 4050 in almond steel, 178 pounds measured, 2 inch standard lift track with a 15 inch radius, and a torsion system of two .225 by 2 by 27 inch 10,000-cycle springs"
            caption="One door, as the application shows it."
          />
        }
        below={
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <FactList items={AT_THE_DOOR_FACTS} />
            <Caveat title="Replacements are history, not overwrites">
              Fit new springs and the old ones stay in the record with the date they came off.
              The passport tells you what is on the door now and what was on it before.
            </Caveat>
          </div>
        }
      />

      {/* --------------------------------------------- 2 · Inspection → Estimate */}
      <Section surface="sunken" id="inspection">
        <div className="max-w-3xl">
          <Eyebrow>02 · Inspection → Estimate</Eyebrow>
          <Headline className="mt-3">
            A garage-door inspection, and the repair it produces.
          </Headline>
          <Lede className="mt-5">
            Twenty-three components grouped the way the door is built. What the technician finds
            becomes what the customer is offered, without anything being written out twice.
          </Lede>
        </div>

        <Showcase
          className="mt-12"
          name="desktop-inspection"
          alt="The inspection checklist grouped into spring system, hardware, door, opener and safety, with each component showing the answer set that applies to it"
          caption="The checklist, grouped the way you work down a door."
        />

        <div className="mt-14 grid gap-10 lg:grid-cols-3">
          <div>
            <h3 className="text-lg font-bold text-ink">Each question has its own answers</h3>
            <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
              One Good/Worn/Failed scale is wrong for most of a door, and wrong in a way that
              shows. Springs wear, so they are Good, Worn, Needs Attention or Failed. A balance
              test is Balanced, Needs Adjustment or Unable to Test. Lubrication is Complete or
              Needed. Noise is Normal or Excessive. Auto-reverse passes or fails.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold text-ink">Findings become line items</h3>
            <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
              Anything worth quoting can be added to the estimate in one tap, priced from your own
              price book, with the inspection photos attached. The remedy mapping is yours to
              change.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold text-ink">One option, or three</h3>
            <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
              Good / Better / Best is available when you want to present tiers. It is not
              required, and nothing pads an estimate to fill a layout. If the fix is a spring,
              present one price.
            </p>
            <Aside className="mt-4">
              Anything typed during an inspection is saved on the device as you go and restored
              if the page reloads, so a driveway with one bar does not cost you your notes. It
              is a draft buffer, not full offline sync — the job still needs signal to save.
            </Aside>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------- 3 · Presentation Mode */}
      <Section surface="base" id="presentation">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div>
            <Eyebrow>03 · Customer Presentation Mode</Eyebrow>
            <Headline className="mt-3">Hand them your phone.</Headline>
            <Lede className="mt-5">
              Your device becomes the customer&rsquo;s estimate. They read what was found, choose
              when there is a choice, and sign — without installing anything or finding an email.
            </Lede>

            <ol className="mt-8 space-y-3">
              {[
                'Technician taps Present to Customer',
                'Hands over the phone or tablet',
                'Customer reviews the work that was found',
                'Chooses an option, when there is one',
                'Signs with a finger',
                'Hands the device back',
              ].map((step, index) => (
                <li key={step} className="flex gap-3.5 text-[0.9375rem] text-navy-100">
                  <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            <Caveat title="Locked to one estimate, server-side">
              Navigating anywhere else is refused by the server, not merely hidden in the
              interface, and photos are limited to the ones on that estimate. Getting back out
              needs a technician password, so handing over your phone is not handing over your
              pricing, your other customers or your schedule.
            </Caveat>

            <p className="mt-6 text-[0.9375rem] leading-relaxed text-navy-200">
              <strong className="text-white">Need to send it instead?</strong> For a full
              installation proposal, emailing a link the customer can open later — and talk over
              with whoever else lives there — is usually the better workflow. Both are built in.
            </p>
          </div>

          <PhoneGallery
            width={212}
            screens={[
              {
                name: 'presentation-handover',
                alt: 'The hand-over screen the technician sees before passing the device across',
                label: 'Hand over',
              },
              {
                name: 'presentation-customer',
                alt: 'The homeowner reading the work found on their door and the repair options',
                label: 'They choose',
              },
              {
                name: 'presentation-signature',
                alt: 'The customer signing on the phone with the chosen option and total above the pad',
                label: 'They sign',
              },
            ]}
          />
        </div>
      </Section>

      {/* -------------------------------------- 4 · Spring lookup + inventory */}
      <ShowcaseFeature
        id="springs"
        surface="light"
        eyebrow="04 · Spring lookup + truck inventory"
        headline="Know the spring. Know if you have it."
        lede="Measure what is on the door and Garage Door HQ finds the matching parts in your price book — then tells you how many are on your truck, in the warehouse, and on everybody else's truck."
        media={
          <Showcase
            name="desktop-spring-lookup"
            alt="Spring lookup results for a .225 by 2 by 27 inch spring: two matching parts, the first showing 2 on Truck #1 and 9 in the warehouse, the second flagged as only 1 on Truck #1"
            caption="Measurements in, matching parts and live stock out."
          />
        }
        below={
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
            <FactList
              items={[
                'Wire size, inside diameter, length',
                'Wind direction',
                'Cycle rating, upgrades flagged',
                'Quantity needed',
                'Stock on your truck',
                'Stock in the warehouse and other trucks',
                'Add the match straight to an estimate',
                'Open the part in inventory',
              ]}
            />
            <Caveat title="Matching, not engineering">
              This matches a spring you have measured against parts you stock. It does not
              calculate a spring from a door weight — that is engineering, and a wrong answer puts
              somebody under a loaded door. The screen says so rather than guessing.
            </Caveat>
          </div>
        }
      />

      {/* ----------------------------------------------------- Everything else */}
      <Section surface="raised" id="everything-else">
        <div className="max-w-3xl">
          <Eyebrow>Everything else</Eyebrow>
          <Headline className="mt-3">The rest of the job, included.</Headline>
          <Lede className="mt-5">
            None of this costs extra and none of it is held back for a higher plan, because there
            is no higher plan.
          </Lede>
        </div>

        <div className="mt-12 space-y-12">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-brand-400">
              Run the day
            </h3>
            <CapabilityGrid items={RUN_THE_DAY} className="mt-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-brand-400">
              Do the work
            </h3>
            <CapabilityGrid items={DO_THE_WORK} className="mt-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-brand-400">
              Get paid
            </h3>
            <CapabilityGrid items={GET_PAID} className="mt-5" />
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------- The office machine */}
      <SplitFeature
        surface="sunken"
        wide
        eyebrow="On the desktop too"
        headline="Not just a phone app."
        lede="The same product, laid out for a screen with room on it. Price book, schedule and money are easier from a desk, and nothing is missing from either side."
        media={
          <PhonePair
            front={{
              name: 'money',
              alt: 'The Money screen on a phone, showing revenue, jobs, average ticket and outstanding invoices',
            }}
            behind={{
              name: 'truck-inventory',
              alt: 'Truck inventory on a phone, listing springs, rollers and openers with quantities per location',
            }}
          />
        }
      >
        <Aside>
          Estimated gross profit on the Money screen is charged less parts cost less processing
          fees. It is for judging whether a job was worth doing. It is not accounting, and it does
          not replace your books.
        </Aside>
      </SplitFeature>

      {/* ------------------------------------------------------------- Final CTA */}
      <Section surface="deep">
        <div className="mx-auto max-w-2xl text-center">
          <Headline>See it with your own doors in it.</Headline>
          <Lede className="mx-auto mt-5 text-center">
            Add a customer, a door and a job in the first ten minutes. Nothing here needs setting
            up before it works.
          </Lede>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <ButtonLink href="/signup" size="lg" className="w-full sm:w-auto">
              Start Your {offer.trialDays}-Day Free Trial
            </ButtonLink>
            <Link
              href="/how-it-works"
              className="text-sm font-semibold text-brand-300 hover:text-brand-200"
            >
              Or follow one service call through →
            </Link>
          </div>
        </div>
      </Section>
    </>
  )
}
