import type { Metadata } from 'next'
import { ButtonLink } from '@/components/ui/button'
import { Eyebrow, Headline, Lede, Section } from '@/components/marketing/section'
import { PhoneShot } from '@/components/marketing/screens'
import type { ScreenName } from '@/components/marketing/screens'
import { pageMetadata } from '@/lib/seo'
import { currentOffer } from '@/lib/pricing'

export const metadata: Metadata = pageMetadata({
  path: '/how-it-works',
  title: 'How It Works — one service call, start to finish',
  description:
    'Follow one garage door service call through Garage Door HQ: the phone ringing, the schedule, the inspection, the estimate, the signature, the parts, the invoice and the Door Passport.',
})

/**
 * One service call, all the way through.
 *
 * A feature list asks the reader to imagine how the pieces connect. This page
 * does the connecting: ten steps in order, each with the screen you would
 * actually be looking at. Somebody who reads it should be able to picture
 * Tuesday morning.
 */

interface Step {
  title: string
  body: string
  screen: { name: ScreenName; alt: string } | null
  /** The thing the previous step handed this one. */
  carried?: string
}

const STEPS: Step[] = [
  {
    title: 'Customer calls',
    body: 'Find them if they have called before, create them if they have not. A customer has properties; a property has doors. If this is the same house as last February, their door is already there with everything on it.',
    screen: {
      name: 'customers',
      alt: 'The customer list, searchable by name',
    },
  },
  {
    title: 'Schedule',
    body: 'Put the job on the calendar with the door it is for and what they said is wrong. A one-person company does not assign it to anyone; a larger one picks the technician.',
    carried: 'The customer, the property and the specific door',
    screen: {
      name: 'schedule',
      alt: "The schedule showing the day's jobs laid out by time",
    },
  },
  {
    title: 'Arrive',
    body: 'The technician opens the job and already has the address, the phone number, the door, the opener, the springs that are on it, and what was done last time. Nobody reads the history out over the phone.',
    carried: 'Everything the Door Passport already knew',
    screen: {
      name: 'job',
      alt: 'A job screen showing the customer, address, the door it is for, and the work requested',
    },
  },
  {
    title: 'Inspect',
    body: 'Work down the door: spring system, hardware, door, opener, safety. Each component takes the kind of answer it has — springs are Good through Failed, a balance test is Balanced or Needs Adjustment, lubrication is Complete or Needed, auto-reverse passes or fails.',
    screen: {
      name: 'inspection',
      alt: 'The inspection checklist grouped by spring system, hardware, door, opener and safety',
    },
  },
  {
    title: 'Build the repair',
    body: 'The findings that need work become estimate items. Tap Build Options and the failed spring is a line with a price from your own price book. Offer one option, or two, or three — whatever this door actually needs.',
    carried: 'Every finding worth quoting',
    screen: {
      name: 'inspection-to-estimate',
      alt: 'Inspection findings turned into estimate line items, each marked Added',
    },
  },
  {
    title: 'Present',
    body: 'Tap Present to Customer and hand them the phone. The device locks to that one estimate — they cannot wander into your pricing, your other customers or your schedule. For a full installation proposal, send it instead and let them think about it.',
    screen: {
      name: 'presentation-customer',
      alt: 'Customer Presentation Mode showing the homeowner the work found and the repair options',
    },
  },
  {
    title: 'Approve',
    body: 'They read what was found, pick an option when there is one to pick, type their name and sign with a finger. The signature is stored with the estimate and with the option they chose, not with a different version of it.',
    carried: 'What they agreed to, and what they agreed to pay',
    screen: {
      name: 'presentation-signature',
      alt: 'The customer signing on the phone, with the chosen option and total shown above the signature pad',
    },
  },
  {
    title: 'Do the work',
    body: 'Fit the springs. Record the parts you used. Completing the job moves those parts out of the truck they came off, so the count is right without anybody updating a spreadsheet in the evening.',
    screen: {
      name: 'truck-inventory',
      alt: 'Truck inventory showing the parts held on each truck and in the warehouse',
    },
  },
  {
    title: 'Invoice and payment',
    body: 'The invoice is built from the approved work and the parts used. Take a card on the spot, or record cash or a cheque. Card payments settle into your own Stripe account — Garage Door HQ never holds your money.',
    carried: 'The approved option and the parts that went on',
    screen: {
      name: 'invoice',
      alt: 'An invoice showing the approved work, the parts used and the amount due',
    },
  },
  {
    title: 'Door Passport updates',
    body: 'The door now knows it has new springs, when they went on, who fitted them and what came off. Next February, the technician who pulls into that driveway starts from there instead of from nothing.',
    screen: {
      name: 'door-passport-history',
      alt: 'The service history on a door, showing installation, spring replacement and opener replacement with dates',
    },
  },
]

export default function HowItWorksPage() {
  const offer = currentOffer()

  return (
    <>
      <Section surface="base" className="pt-12 sm:pt-16">
        <div className="max-w-3xl">
          <Eyebrow>How it works</Eyebrow>
          <Headline as="h1" className="mt-4">
            One service call, start to finish.
          </Headline>
          <Lede className="mt-6">
            A broken spring on Maple Street. Ten steps from the phone ringing to the door&rsquo;s
            own record being updated — every one of them a screen in the real product.
          </Lede>
        </div>
      </Section>

      {STEPS.map((step, index) => (
        <Section key={step.title} surface={index % 2 === 0 ? 'raised' : 'base'}>
          <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16">
            <div className={index % 2 === 0 ? '' : 'lg:order-2'}>
              <div className="flex items-baseline gap-4">
                <span className="num text-4xl font-bold leading-none text-brand-500 sm:text-5xl">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <Headline as="h2" className="text-2xl sm:text-3xl lg:text-4xl">
                  {step.title}
                </Headline>
              </div>

              <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-navy-200 sm:text-lg">
                {step.body}
              </p>

              {step.carried ? (
                <p className="mt-5 inline-flex items-center gap-2.5 rounded-full border border-brand-800/70 bg-brand-900/30 px-4 py-2 text-sm font-semibold text-brand-200">
                  <span aria-hidden>↳</span>
                  Carried forward: {step.carried}
                </p>
              ) : null}
            </div>

            {step.screen ? (
              <div className={`flex justify-center ${index % 2 === 0 ? 'lg:order-2' : ''}`}>
                <PhoneShot
                  name={step.screen.name}
                  alt={step.screen.alt}
                  width={280}
                  sizes="(max-width: 640px) 72vw, 280px"
                />
              </div>
            ) : null}
          </div>
        </Section>
      ))}

      <Section surface="deep">
        <div className="mx-auto max-w-2xl text-center">
          <Headline>That is the whole loop.</Headline>
          <Lede className="mx-auto mt-5 text-center">
            Run it once on a real job and the next one is faster, because the door already knows
            what happened the first time.
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
