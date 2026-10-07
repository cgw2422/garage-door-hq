import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser, landingFor } from '@/lib/session'
import { ButtonLink } from '@/components/ui/button'
import { INCLUDED_FEATURES, currentOffer, trialLabel } from '@/lib/pricing'
import { PriceBlock } from '@/components/marketing/chrome'
import { CheckList, Eyebrow, FactList, Headline, Lede, Section } from '@/components/marketing/section'
import { Aside, FeatureSection } from '@/components/marketing/feature'
import { BrowserShot, PhonePair, PhoneShot } from '@/components/marketing/screens'
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
 * It is built around one claim — that this was made for garage door companies
 * rather than adapted for them — and that claim is only credible if the
 * visitor can see the product. So every section leads with a real screen, and
 * the words beside it describe what is on it.
 *
 * Order matters: value before price. Pricing appears once near the bottom and
 * once, small, beside the hero's call to action, because somebody who has not
 * yet seen a Door Passport has no way to judge whether $249 is a lot.
 */

/** The arc of one service call, which is also the order of the sections below. */
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
  'Door Passport Updates',
] as const

const INSPECTION_COVERS = [
  'Springs, cables and drums',
  'Bearings and shaft',
  'Rollers, hinges and tracks',
  'Brackets and bottom fixtures',
  'Panels, seals and weather stripping',
  'Door balance',
  'Opener, wall control, remotes and keypad',
  'Photo eyes and auto-reverse',
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

const INVENTORY_TRACKS = [
  'Springs, rollers and cables',
  'Openers and remotes',
  'Truck inventory, per truck',
  'Warehouse inventory',
  'Transfers between locations',
  'Minimum quantities and low stock',
] as const

const MONEY_SHOWS = [
  'Revenue collected',
  'Jobs completed',
  'Average ticket',
  'Parts cost',
  'Processing fees',
  'Outstanding invoices',
  'Estimated gross profit',
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
            <Headline as="h1" className="mt-4">
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
          </div>

          <PhonePair
            priority
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

      {/* ------------------------------------------------------------ Workflow */}
      <Section surface="raised" tight>
        <Eyebrow>One service call</Eyebrow>
        <Headline className="mt-3">From the first call to getting paid.</Headline>
        <Lede className="mt-5">
          Every step below happens in Garage Door HQ, and each one hands the next what it needs.
          Nothing is re-typed, and nothing is remembered in a notebook.
        </Lede>

        <ol className="mt-9 flex flex-wrap items-center gap-x-2.5 gap-y-3">
          {WORKFLOW.map((step, index) => (
            <li key={step} className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-navy-700 bg-navy-800 px-3.5 py-2 text-sm font-semibold text-navy-50">
                <span className="num text-xs text-brand-400">{index + 1}</span>
                {step}
              </span>
              {index < WORKFLOW.length - 1 ? (
                <span aria-hidden className="text-navy-600">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </Section>

      {/* --------------------------------------------------------------- Today */}
      <FeatureSection
        eyebrow="Today"
        headline="Open the app. Know what needs done."
        lede="The first screen of the day answers the only questions that matter at 7am: where am I going, who am I seeing, and how did yesterday go."
        media={
          <PhoneShot
            name="today"
            width={320}
            sizes="(max-width: 640px) 78vw, 320px"
            alt="The Today screen showing $747 revenue from 2 completed jobs, 3 jobs remaining, a $373.50 average ticket, and the 10:30am next job for Sarah Wilson with call, text and directions buttons"
          />
        }
      >
        <FactList
          items={[
            'The next job, with the time and the address',
            'Call, text or get directions in one tap',
            "Today's full schedule underneath",
            'Jobs completed and jobs remaining',
            "Today's revenue",
            'Average ticket',
          ]}
        />
      </FeatureSection>

      {/* ---------------------------------------------------------- Inspection */}
      <FeatureSection
        surface="raised"
        flip
        eyebrow="Inspection"
        headline="Inspect the door. Build the repair."
        lede="A garage-door inspection, not a generic checklist with the word 'garage' at the top. Twenty-three components grouped the way the door is built — spring system, hardware, door, opener, safety."
        media={
          <PhonePair
            front={{
              name: 'inspection-finding',
              alt: 'The inspection checklist with Springs marked Failed, and a Build Options button appearing',
            }}
            behind={{
              name: 'inspection-to-estimate',
              alt: 'Inspection findings converted into estimate line items, each marked Added',
            }}
          />
        }
      >
        <FactList items={INSPECTION_COVERS} />
        <Aside className="mt-6">
          Each component takes the kind of answer that component actually has. Springs wear, so
          they are Good, Worn, Needs Attention or Failed. A balance test is Balanced, Needs
          Adjustment or Unable to Test. Lubrication is Complete or Needed. Noise is Normal or
          Excessive. Nothing is forced onto one scale that fits none of them.
        </Aside>
        <p className="mt-5 text-base font-semibold text-white">
          Findings become recommended work. Tap Build Options and the failed spring is already a
          line on the estimate.
        </p>
      </FeatureSection>

      {/* ----------------------------------------------------------- Estimates */}
      <FeatureSection
        eyebrow="Estimates"
        headline="Give the customer the right options."
        lede="Sometimes there is one correct repair. Sometimes there are three ways to go about it. Garage Door HQ does both, and never makes you pad an estimate to fill a template."
        media={
          <PhoneShot
            name="estimate-options"
            width={320}
            sizes="(max-width: 640px) 78vw, 320px"
            alt="An estimate showing multiple priced repair options the customer can choose between"
          />
        }
      >
        <FactList
          items={[
            'One option, when there is one answer',
            'Two or three options, when there is a choice',
            'Good / Better / Best, if you want it',
            'Reusable packages from your price book',
            'Parts and labour priced from your own catalogue',
            'Photos from the inspection attached',
          ]}
        />
        <Aside className="mt-6">
          Good / Better / Best is available, not required. If the spring is broken and the fix is
          a spring, you can present one option for one price.
        </Aside>
      </FeatureSection>

      {/* -------------------------------------------- Customer Presentation Mode */}
      <Section surface="deep">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div>
            <Eyebrow>Customer Presentation Mode</Eyebrow>
            <Headline className="mt-3">Hand them your phone.</Headline>
            <Lede className="mt-5">
              Your phone or tablet becomes the customer&rsquo;s estimate. They read the work,
              choose when there is a choice, and sign — standing in their own driveway, on the
              device already in the technician&rsquo;s hand.
            </Lede>

            <ol className="mt-8 space-y-3.5">
              {[
                'Technician completes the inspection',
                'Builds the estimate from the findings',
                'Taps Present to Customer',
                'Hands over the phone or tablet',
                'Customer reviews the work that was found',
                'Chooses an option, when there is one to choose',
                'Signs',
                'Hands the device back',
              ].map((step, index) => (
                <li key={step} className="flex gap-3.5 text-base text-navy-100">
                  <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            <p className="mt-8 text-base font-semibold text-white">
              The customer does not need to find their phone, open an email, or download anything
              to approve normal service work.
            </p>

            <div className="mt-6 rounded-[--radius-card] border border-navy-800 bg-navy-900/60 p-5">
              <p className="text-base font-bold text-white">Need to send it instead? You can.</p>
              <p className="mt-2 text-sm leading-relaxed text-navy-200">
                For a full installation proposal, sending it over for the customer to review later
                — and talk about with whoever else lives there — is usually the better workflow.
                Both are built in.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-8">
            <PhonePair
              front={{
                name: 'presentation-customer',
                alt: "Customer Presentation Mode: the homeowner's view of the estimate, with the work found and the options to choose from",
              }}
              behind={{
                name: 'presentation-handover',
                alt: 'The hand-over screen the technician sees before passing the device to the customer',
              }}
            />
            <PhoneShot
              name="presentation-signature"
              width={280}
              sizes="(max-width: 640px) 70vw, 280px"
              alt="The customer signing on the phone: the chosen option at $499.00, a signature drawn on the pad, and an Approve button"
            />
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------- Door Passport */}
      <FeatureSection
        surface="raised"
        flip
        eyebrow="Door Passport"
        headline={
          <>
            Every door has a story.
            <br />
            Garage Door HQ remembers it.
          </>
        }
        lede="The next time you pull into that driveway, don't start from zero. Every door at every property has its own record, and it survives the technician who wrote it."
        media={
          <PhonePair
            front={{
              name: 'door-passport',
              alt: "Sarah Wilson's Door Passport: a 16 by 7 foot insulated Clopay steel door, 178 pounds, 2 inch standard lift track, with a .225 by 2 by 27 inch torsion spring pair",
            }}
            behind={{
              name: 'door-passport-history',
              alt: 'The service history on the same door, showing installation, spring replacement and opener replacement with dates',
            }}
          />
        }
      >
        <FactList items={PASSPORT_HOLDS} />
        <p className="mt-6 text-base font-semibold text-white">
          Equipment history is kept, not overwritten.
        </p>
        <Aside className="mt-3">
          When a spring or an opener is replaced, the one that came off stays in the record. Two
          years later you can see what was on the door, when it was changed, and what went on
          instead.
        </Aside>
      </FeatureSection>

      {/* ------------------------------------------- Spring lookup + inventory */}
      <FeatureSection
        eyebrow="Spring lookup"
        headline="Know the spring. Know if you have it."
        lede={
          <>
            Measure the spring on the door — <span className="num font-semibold text-white">.225 × 2&quot; × 27&quot;</span>{' '}
            — and Garage Door HQ finds the matching parts in your price book and tells you
            where they are. On the truck, in the warehouse, or on somebody else&rsquo;s truck.
          </>
        }
        media={
          <PhonePair
            front={{
              name: 'spring-lookup-matches',
              alt: 'Spring lookup results: two matching .225 by 2 by 27 inch springs, one with "You have 2 on Truck #1" and the stock split between Truck #1 and the warehouse',
            }}
            behind={{
              name: 'spring-lookup',
              alt: 'The spring measurement form filled in with a wire size of 0.225, inside diameter 2 inches and length 27 inches',
            }}
          />
        }
      >
        <FactList
          items={[
            'Wire size, inside diameter and length',
            'Wind direction',
            'Cycle rating, with higher-cycle matches flagged as upgrades',
            'Quantity needed',
            'Stock on your truck',
            'Stock in the warehouse and on other trucks',
            'Add the match straight to the estimate',
          ]}
        />
        <Aside className="mt-6">
          This matches a spring you have measured against parts you stock. It does not calculate
          a spring from a door weight — that is engineering, and getting it wrong puts somebody
          under a loaded door. Garage Door HQ says so on the screen rather than guessing.
        </Aside>
      </FeatureSection>

      {/* ----------------------------------------------------------- Inventory */}
      <FeatureSection
        surface="raised"
        flip
        eyebrow="Inventory"
        headline="Your truck isn't a mystery."
        lede="Every truck is a stock location. So is the warehouse. You can see what is on each one, move parts between them, and find out you are low before you are standing in a driveway without the part."
        media={
          <PhoneShot
            name="truck-inventory"
            width={320}
            sizes="(max-width: 640px) 78vw, 320px"
            alt="Truck inventory listing springs, rollers, openers and cables with the quantity held at each location"
          />
        }
      >
        <FactList items={INVENTORY_TRACKS} />
        <p className="mt-6 text-base font-semibold text-white">
          Use a part on the job and Garage Door HQ records the usage.
        </p>
        <Aside className="mt-3">
          Completing a job with parts on it moves them out of the location they came from. The
          truck count goes down because the work happened, not because somebody remembered to
          update a spreadsheet.
        </Aside>
      </FeatureSection>

      {/* ------------------------------------------------------------ Customer */}
      <FeatureSection
        eyebrow="Customers"
        headline="The whole customer relationship in one place."
        lede="A customer has properties. A property has doors. A door has history. That chain is the point — not the contact record at the top of it."
        media={
          <PhonePair
            front={{
              name: 'customer',
              alt: 'A customer record showing their property, the doors at it, and their job and invoice history',
            }}
            behind={{
              name: 'door-passport-equipment',
              alt: "The equipment section of a door record, showing the opener and spring system fitted to it",
            }}
          />
        }
      >
        <FactList
          items={[
            'Customer, with every way to reach them',
            'One or many properties',
            'Multiple doors at a property, named the way you point at them',
            'Every job, on every door',
            'Estimates and invoices',
            'The communication history',
          ]}
        />
        <Aside className="mt-6">
          Plenty of software stores a customer. The part that matters here is that the customer
          connects down to the actual equipment on the actual door, so &ldquo;the one at the back
          with the bad opener&rdquo; is a record rather than a memory.
        </Aside>
      </FeatureSection>

      {/* --------------------------------------------------------------- Money */}
      <FeatureSection
        surface="raised"
        flip
        eyebrow="Money"
        headline="Know what came in today."
        lede="What you collected, what it cost you in parts and fees, and what is still owed — without exporting anything or waiting for your bookkeeper."
        media={
          <PhoneShot
            name="money"
            width={320}
            sizes="(max-width: 640px) 78vw, 320px"
            alt="The Money screen showing revenue, jobs completed, average ticket, parts cost, processing fees and outstanding invoices"
          />
        }
      >
        <FactList items={MONEY_SHOWS} />
        <Aside className="mt-6">
          Gross profit here is an estimate built from what you charged and what the parts cost
          you. It is for deciding whether a job was worth doing. It is not accounting, and it is
          not a substitute for your books.
        </Aside>
      </FeatureSection>

      {/* -------------------------------------------------------- Differentiator */}
      <Section surface="deep">
        <div className="mx-auto max-w-4xl text-center">
          <Headline className="text-navy-300">
            Generic software knows you have an appointment.
          </Headline>
          <Headline className="mt-4 text-white">Garage Door HQ knows the door.</Headline>
        </div>

        <div className="mx-auto mt-12 max-w-3xl rounded-[--radius-card] border border-navy-800 bg-navy-900/70 p-6 sm:p-8">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-brand-400">
            123 Maple Street · Front Garage
          </p>
          <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {[
              ['Door', '16′ × 7′ Clopay, insulated steel'],
              ['Weight', '178 lb, measured'],
              ['Opener', 'LiftMaster 87504-267 belt drive'],
              ['Spring system', 'Torsion, .225 × 2″ × 27″, 10,000 cycle'],
              ['Last service', 'Springs replaced, two years ago'],
              ['On the truck', '2 matching springs, Truck #1'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-navy-400">
                  {label}
                </dt>
                <dd className="num mt-1 text-base font-semibold text-white sm:text-lg">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-balance text-center text-lg leading-relaxed text-navy-200">
          That is the difference. Not a better calendar — a system that knows what is on the door
          before the truck pulls up.
        </p>
      </Section>

      {/* ------------------------------------------------------- Owner-operator */}
      <Section surface="base">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <Eyebrow>One truck, or ten</Eyebrow>
            <Headline className="mt-3">Just you? Perfect.</Headline>
            <Lede className="mt-5">
              Garage Door HQ sets up as a one-person company by default. Your truck is called My
              Truck, the schedule is your schedule, and nothing asks you to assign a job to
              yourself.
            </Lede>

            <div className="mt-8 flex flex-wrap gap-2.5">
              {['My Jobs', 'My Truck', 'My Schedule'].map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-brand-800 bg-brand-900/40 px-4 py-2 text-sm font-semibold text-brand-200"
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="mt-8 rounded-[--radius-card] border border-navy-800 bg-navy-900 p-6">
              <p className="text-xl font-bold text-white">Hire another technician? Add them.</p>
              <p className="mt-2 text-base leading-relaxed text-navy-200">
                Your software bill does not go up. No per-user fee, no per-technician fee, no
                upgrade to a &ldquo;team&rdquo; plan.
              </p>
            </div>
          </div>

          <BrowserShot
            name="desktop-schedule"
            sizes="(max-width: 1024px) 92vw, 560px"
            alt="The schedule on a desktop browser, showing the day's jobs laid out by time and technician"
          />
        </div>
      </Section>

      {/* ------------------------------------------------------------- Pricing */}
      <Section surface="raised" id="pricing">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow className="text-center">Pricing</Eyebrow>
          <Headline className="mt-3">One plan. Everything in it.</Headline>
          <Lede className="mx-auto mt-5 text-center">
            No tiers to compare, nothing held back for a higher plan, and no charge for putting
            another technician in another truck.
          </Lede>
        </div>

        <div className="mx-auto mt-12 max-w-2xl rounded-[--radius-card] border border-brand-800 bg-gradient-to-b from-brand-900/50 to-navy-900 p-7 sm:p-10">
          <PriceBlock align="center" />
          <CheckList items={INCLUDED_FEATURES} className="mt-9" />
          <div className="mt-9">
            <ButtonLink href="/signup" size="lg" fullWidth>
              Start Your {offer.trialDays}-Day Free Trial
            </ButtonLink>
            <p className="mt-3 text-center text-sm text-navy-300">
              {trialLabel()}. No charge until it ends.{' '}
              <Link href="/pricing" className="font-semibold text-brand-300 hover:text-brand-200">
                Full pricing details
              </Link>
            </p>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------ Final CTA */}
      <Section surface="deep">
        <div className="mx-auto max-w-3xl text-center">
          <p className="display text-sm uppercase tracking-[0.3em] text-brand-400 sm:text-base">
            Your garage door business. One HQ.
          </p>
          <Headline className="mt-6">
            Less paperwork. More doors.
            <br />
            <span className="text-brand-400">A stronger business.</span>
          </Headline>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <ButtonLink href="/signup" size="lg" className="w-full sm:w-auto">
              Start Your {offer.trialDays}-Day Free Trial
            </ButtonLink>
            <ButtonLink
              href="/features"
              size="lg"
              variant="secondary"
              className="w-full border-navy-700 bg-navy-800 text-white hover:bg-navy-700 sm:w-auto"
            >
              See everything it does
            </ButtonLink>
          </div>

          <p className="mt-6 text-sm text-navy-300">
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
