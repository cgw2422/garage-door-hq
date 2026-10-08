import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser, landingFor } from '@/lib/session'
import { ButtonLink } from '@/components/ui/button'
import { INCLUDED_FEATURES, currentOffer, trialLabel } from '@/lib/pricing'
import { PriceBlock } from '@/components/marketing/chrome'
import {
  Aside,
  CheckList,
  Chip,
  Eyebrow,
  FactList,
  Headline,
  Lede,
  Panel,
  Section,
} from '@/components/marketing/section'
import {
  CapabilityGrid,
  Caveat,
  ShowcaseFeature,
  SplitFeature,
  StatBand,
} from '@/components/marketing/feature'
import { PhoneGallery, PhonePair, PhoneShot, Showcase } from '@/components/marketing/screens'
import { Testimonials, UsageCounter } from '@/components/marketing/proof'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  path: '/',
  title: 'Garage Door HQ — Run your entire garage door business from one place',
  description:
    'Jobs, customers, doors, inspections, estimates, Customer Presentation Mode, truck inventory, invoices and payments in one app built for garage door companies.',
})

/**
 * The homepage.
 *
 * It makes one claim — this was built for garage door companies rather than
 * adapted for them — and that claim is only credible if the visitor can see
 * the product. So the page is a sequence of real screens with the argument
 * written beside them.
 *
 * Two things shape the structure. Surfaces alternate light and dark, because
 * nine navy sections in a row read as one section. And the page sells rather
 * than documents: the Door Passport, the inspection-to-signature arc, and the
 * spring-to-truck connection get room, while everything else is compressed
 * into a grid with a link to `/features`. The earlier version gave twelve
 * things equal weight, which is the same as giving none of them any.
 *
 * Price appears twice — once small beside the hero's call to action, once
 * properly near the end — because somebody who has not yet seen a Door
 * Passport has no way to judge whether $249 is a lot.
 */

const WORKFLOW = [
  'Call',
  'Schedule',
  'Inspect',
  'Build Repair',
  'Present',
  'Sign',
  'Do the Work',
  'Invoice',
  'Get Paid',
  'Passport Updates',
] as const

const PASSPORT_HOLDS = [
  'Size and panel count',
  'Manufacturer, model and serial',
  'Material, colour and insulation',
  'Measured door weight',
  'Track type and radius',
  'Opener make and model',
  'Spring system, wind and cycle rating',
  'Warranty dates',
  'Service and replacement history',
  'Photos from every visit',
] as const

const INSPECTION_COVERS = [
  'Springs, cables, drums',
  'Bearings and shaft',
  'Rollers, hinges, tracks',
  'Brackets and bottom fixtures',
  'Panels, seals, weather stripping',
  'Door balance',
  'Opener, wall control, remotes',
  'Photo eyes and auto-reverse',
] as const

/** The long tail, compressed. Each of these has its own section on /features. */
const ALSO_INCLUDED = [
  {
    name: 'Today',
    detail: "The next job, the day's schedule, what is done and what is left, revenue and average ticket.",
  },
  {
    name: 'Scheduling',
    detail: 'Put jobs on the calendar and move them when the day changes, which it does.',
  },
  {
    name: 'Customers and properties',
    detail: 'A customer has properties; a property has doors. Every job hangs off the right one.',
  },
  {
    name: 'Truck and warehouse inventory',
    detail: 'Each truck is its own stock location. Transfer between them, set minimums, see what is low.',
  },
  {
    name: 'Parts usage',
    detail: 'Completing a job with parts on it takes them off the location they came from.',
  },
  {
    name: 'Price book',
    detail: 'Your parts and labour at your prices, with reusable packages for the repairs you do weekly.',
  },
  {
    name: 'Invoices and payments',
    detail: 'Built from the approved work. Card, cash or cheque, with cards settling into your own account.',
  },
  {
    name: 'Money',
    detail: 'Revenue, jobs, average ticket, parts cost, processing fees, outstanding invoices.',
  },
  {
    name: 'Team and roles',
    detail: 'Owner, admin and technician. A technician does the work without seeing your margins.',
  },
] as const

export default async function HomePage() {
  const user = await getAuthenticatedUser()
  if (user) redirect(landingFor(user))

  const offer = currentOffer()

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <Section surface="base" className="relative overflow-hidden pt-10 sm:pt-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-[34rem] w-[64rem] -translate-x-1/2 rounded-full bg-brand-600/15 blur-[120px]"
        />
        <div className="relative grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <div>
            <Eyebrow>Built for garage door pros</Eyebrow>
            <Headline as="h1" size="large" className="mt-4">
              Run your entire garage door business from one place.
            </Headline>
            <Lede className="mt-6">
              From the first call to the final payment, Garage Door HQ keeps your jobs,
              customers, doors, estimates, inventory and money together.
            </Lede>
            <p className="mt-4 max-w-xl text-pretty text-base font-semibold leading-relaxed text-white">
              Built for the guy in the truck — not adapted from generic field-service software.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/signup" size="lg" className="sm:w-auto">
                Start Your {offer.trialDays}-Day Free Trial
              </ButtonLink>
              <ButtonLink
                href="/how-it-works"
                size="lg"
                variant="secondary"
                className="border-navy-700 bg-navy-800 text-white hover:bg-navy-700 sm:w-auto"
              >
                See How It Works
              </ButtonLink>
            </div>

            <div className="mt-8 inline-flex rounded-[--radius-card] border border-brand-800/80 bg-brand-900/30 px-5 py-4">
              <PriceBlock size="md" />
            </div>

            {/* Renders only when there is a true number to print. */}
            <UsageCounter className="mt-5" />
          </div>

          <PhonePair
            priority
            size="large"
            front={{
              name: 'today',
              alt: "Garage Door HQ's Today screen: today's revenue, jobs remaining and completed, average ticket, and the next job with call, text and directions",
            }}
            behind={{
              name: 'door-passport',
              alt: 'A Door Passport showing a 16 by 7 foot Clopay door, its material, weight, track and torsion spring system',
            }}
            className="lg:pl-6"
          />
        </div>
      </Section>

      {/* ------------------------------------------------- Workflow, as a strip */}
      <Section surface="light" size="tight">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="lg:max-w-sm">
            <Eyebrow>One service call</Eyebrow>
            <Headline size="small" className="mt-2.5">
              From the first call to getting paid.
            </Headline>
          </div>
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-2.5">
            {WORKFLOW.map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                <Chip className="px-3 py-1.5 text-[0.8125rem]">
                  <span className="num text-[0.6875rem] text-[color:var(--m-accent)]">
                    {index + 1}
                  </span>
                  {step}
                </Chip>
                {index < WORKFLOW.length - 1 ? (
                  <span aria-hidden className="text-[color:var(--m-faint)]">
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* ------------------------------------------------------- Door Passport */}
      <ShowcaseFeature
        surface="sunken"
        eyebrow="Door Passport"
        headline={
          <>
            Every door has a story.
            <br />
            Garage Door HQ remembers it.
          </>
        }
        lede="The next time you pull into that driveway, don't start from zero. Every door at every property has its own record — and it outlasts the technician who wrote it."
        media={
          <Showcase
            name="desktop-door-passport"
            alt="A Door Passport for Sarah Wilson's front garage: a 16 by 7 foot insulated Clopay Premium Series 4050 in almond steel, 178 pounds measured, 2 inch standard lift track with a 15 inch radius, serial CLP-4050-882314, and a torsion spring system of two .225 by 2 by 27 inch 10,000-cycle springs on a 1 inch shaft"
            caption="One door, as the application actually shows it. Nothing here was typed twice."
          />
        }
        below={
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <FactList items={PASSPORT_HOLDS} />
            <Caveat title="History, not overwrites">
              When a spring or an opener is replaced, the one that came off stays in the record.
              Two years later you can still see what was on the door, when it changed, and what
              went on instead.
            </Caveat>
          </div>
        }
      />

      {/* -------------------------------- Inspection → estimate → signed, as one */}
      <Section surface="base">
        <div className="max-w-3xl">
          <Eyebrow>Inspection → Estimate → Signature</Eyebrow>
          <Headline className="mt-3">Inspect the door. Build the repair. Get it signed.</Headline>
          <Lede className="mt-5">
            Three screens, one continuous motion. What the technician finds becomes what the
            customer is offered, and what the customer approves becomes the work — without
            anything being re-typed on the way.
          </Lede>
        </div>

        <PhoneGallery
          className="mt-12"
          width={244}
          screens={[
            {
              name: 'inspection-finding',
              alt: 'The inspection checklist with Springs marked Failed and a Build Options button appearing',
              label: '1 · Find it',
            },
            {
              name: 'inspection-to-estimate',
              alt: 'The finding turned into estimate line items, each marked Added',
              label: '2 · Price it',
            },
            {
              name: 'presentation-customer',
              alt: 'Customer Presentation Mode showing the homeowner the work found and the repair options',
              label: '3 · Present it',
            },
            {
              name: 'presentation-signature',
              alt: 'The customer signing on the phone: the chosen option at $499.00, a signature on the pad, and an Approve button',
              label: '4 · Sign it',
            },
          ]}
        />

        <div className="mt-14 grid gap-10 lg:grid-cols-3">
          <div>
            <h3 className="text-lg font-bold text-white">A garage-door inspection</h3>
            <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-navy-200">
              Twenty-three components grouped the way the door is built. Each one takes the kind
              of answer it actually has — springs wear, a balance test passes or fails,
              lubrication is done or it is not.
            </p>
            <FactList items={INSPECTION_COVERS} columns={1} className="mt-5" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-white">Options, not a template</h3>
            <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-navy-200">
              Offer one repair, two, or three. Good / Better / Best is available when you want to
              present tiers and absent when you do not. If the spring is broken and the fix is a
              spring, present one price.
            </p>
            <Aside className="mt-5">
              Nothing makes you pad an estimate to fill a layout.
            </Aside>
          </div>

          <div>
            <h3 className="text-lg font-bold text-white">Signed in the driveway</h3>
            <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-navy-200">
              The signature is stored with the estimate and with the option the customer chose, at
              the moment they chose it — not with a version of it edited afterwards.
            </p>
            <Aside className="mt-5">
              Need to send it instead? For a full installation proposal, that is usually the
              better workflow, and it is built in.
            </Aside>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------- Customer Presentation Mode */}
      <SplitFeature
        surface="light"
        flip
        eyebrow="Customer Presentation Mode"
        headline="Hand them your phone."
        lede="Your phone or tablet becomes the customer's estimate. They read the work, choose when there is a choice, and sign — standing in their own driveway, on the device already in the technician's hand."
        media={
          <PhoneShot
            name="presentation-customer"
            width={360}
            sizes="(max-width: 640px) 80vw, 360px"
            alt="The homeowner's view of an estimate on the technician's phone: the estimate number, the work found on their door, and the repair options to choose between with prices"
          />
        }
      >
        <p className="text-base font-semibold text-ink">
          No app to install. No email to find. No &ldquo;I&rsquo;ll call you back.&rdquo;
        </p>
        <Caveat title="Handing over the phone is not handing over the business">
          The device locks to that one estimate. Navigating anywhere else is refused by the
          server, not merely hidden, and photos are limited to the ones on that estimate. Getting
          back out needs a technician password.
        </Caveat>
      </SplitFeature>

      {/* --------------------------------------- Spring lookup meets the truck */}
      <ShowcaseFeature
        surface="raised"
        eyebrow="Spring lookup + inventory"
        headline="Know the spring. Know if you have it."
        lede={
          <>
            Measure what is on the door —{' '}
            <span className="num font-semibold text-white">.225 × 2&quot; × 27&quot;</span> — and
            Garage Door HQ finds the matching parts in your price book and tells you where they
            are. On the truck, in the warehouse, or on somebody else&rsquo;s truck.
          </>
        }
        media={
          <Showcase
            name="desktop-spring-lookup"
            alt="Spring lookup results for a .225 by 2 by 27 inch spring: two matching parts from the price book, the first showing you have 2 on Truck #1 with 9 more in the warehouse, the second flagged as only 1 on Truck #1"
            caption="The measurement is the question. The stock on your truck is the answer."
          />
        }
        below={
          <Caveat title="Matching, not engineering">
            This matches a spring you have measured against parts you stock. It does not calculate
            a spring from a door weight — that is engineering, and a wrong answer puts somebody
            under a loaded door. Garage Door HQ says so on the screen rather than guessing.
          </Caveat>
        }
      />

      {/* -------------------------------------------------------- Testimonials */}
      {/*
        Named operator quotes, or nothing at all. The section disappears while
        `TESTIMONIALS` is empty rather than showing a frame with placeholder in
        it — on a page whose security section refuses to claim the product is
        unhackable, an invented quote would undo the rest.
      */}
      <Testimonials surface="sunken" id="customers" />

      {/* -------------------------------------------------------- Differentiator */}
      <Section surface="deep" size="loose">
        <div className="mx-auto max-w-4xl text-center">
          <Headline className="text-navy-400">
            Generic software knows you have an appointment.
          </Headline>
          <Headline className="mt-4">Garage Door HQ knows the door.</Headline>
        </div>

        <StatBand
          className="mx-auto mt-14 max-w-5xl"
          items={[
            { value: '16′ × 7′', label: 'Clopay Premium Series 4050, insulated steel' },
            { value: '178 lb', label: 'Measured door weight, never inferred' },
            { value: '.225 × 2″ × 27″', label: 'Torsion pair, 10,000 cycle' },
            { value: '2 on Truck #1', label: 'Matching springs, in stock, right now' },
          ]}
        />

        <p className="mx-auto mt-12 max-w-2xl text-balance text-center text-lg leading-relaxed text-navy-200">
          Not a better calendar. A system that knows what is on the door before the truck pulls
          up.
        </p>
      </Section>

      {/* --------------------------------------------- Everything else, compact */}
      <Section surface="light">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <Eyebrow>And the rest of the day</Eyebrow>
            <Headline className="mt-3">The unglamorous parts, done properly.</Headline>
            <Lede className="mt-5">
              The work between the interesting screens still has to happen. None of it costs
              extra, and none of it is held back for a higher plan.
            </Lede>
            <p className="mt-7">
              <Link
                href="/features"
                className="text-base font-semibold text-brand-600 hover:text-brand-700"
              >
                See every feature in detail →
              </Link>
            </p>
          </div>
          <CapabilityGrid items={ALSO_INCLUDED} columns={2} />
        </div>
      </Section>

      {/* ------------------------------------------------------- Owner-operator */}
      <SplitFeature
        surface="sunken"
        eyebrow="One truck, or ten"
        headline="Just you? Perfect."
        lede="Garage Door HQ sets up as a one-person company by default. Your truck is called My Truck, the schedule is your schedule, and nothing asks you to assign a job to yourself."
        media={
          <PhoneShot
            name="today"
            width={290}
            sizes="(max-width: 640px) 74vw, 290px"
            alt="The Today screen for a solo operator, showing the day's jobs and revenue without any technician assignment"
          />
        }
      >
        <div className="flex flex-wrap gap-2.5">
          {['My Jobs', 'My Truck', 'My Schedule'].map((label) => (
            <Chip key={label}>{label}</Chip>
          ))}
        </div>
        <Panel className="mt-7">
          <p className="text-lg font-bold text-ink">Hire another technician? Add them.</p>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
            Your software bill does not go up. No per-user fee, no per-technician fee, no upgrade
            to a &ldquo;team&rdquo; plan.
          </p>
        </Panel>
      </SplitFeature>

      {/* ------------------------------------------------------------- Pricing */}
      <Section surface="base" id="pricing">
        <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <Eyebrow>Pricing</Eyebrow>
            <Headline className="mt-3">One plan. Everything in it.</Headline>
            <UsageCounter className="mt-5" />
            <Lede className="mt-5">
              No tiers to compare, nothing held back for a higher plan, and no charge for putting
              another technician in another truck.
            </Lede>
            <p className="mt-6 text-sm text-navy-300">
              <Link
                href="/pricing"
                className="font-semibold text-brand-300 hover:text-brand-200"
              >
                Full pricing details
              </Link>
              {' · '}
              <Link href="/faq" className="font-semibold text-brand-300 hover:text-brand-200">
                Questions answered
              </Link>
            </p>
          </div>

          <div className="rounded-[--radius-card] border border-brand-800 bg-gradient-to-b from-brand-900/50 to-navy-900 p-7 sm:p-9">
            <PriceBlock align="center" />
            <CheckList items={INCLUDED_FEATURES} className="mt-8" />
            <div className="mt-8">
              <ButtonLink href="/signup" size="lg" fullWidth>
                Start Your {offer.trialDays}-Day Free Trial
              </ButtonLink>
              <p className="mt-3 text-center text-sm text-navy-300">
                {trialLabel()}. Card details are entered when you activate, not before.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------ Final CTA */}
      <Section surface="brand" size="loose">
        <div className="mx-auto max-w-3xl text-center">
          <p className="display text-sm uppercase tracking-[0.3em] text-brand-100 sm:text-base">
            Your garage door business. One HQ.
          </p>
          <Headline size="large" className="mt-6">
            Less paperwork. More doors.
            <br />
            A stronger business.
          </Headline>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <ButtonLink
              href="/signup"
              size="lg"
              className="w-full bg-white text-brand-700 hover:bg-brand-50 active:bg-brand-100 sm:w-auto"
            >
              Start Your {offer.trialDays}-Day Free Trial
            </ButtonLink>
            <ButtonLink
              href="/features"
              size="lg"
              variant="secondary"
              className="w-full border-brand-400 bg-transparent text-white hover:bg-brand-700 sm:w-auto"
            >
              See everything it does
            </ButtonLink>
          </div>

          <p className="mt-6 text-sm text-brand-100">
            {offer.isFounding ? 'Founding Members · ' : ''}
            <span className="num font-semibold text-white">
              ${offer.priceCents / 100}/{offer.interval}
            </span>{' '}
            · Everything included
          </p>
        </div>
      </Section>
    </>
  )
}
