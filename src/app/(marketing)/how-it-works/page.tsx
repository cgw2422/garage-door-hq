import type { Metadata } from 'next'
import { ButtonLink } from '@/components/ui/button'
import { Eyebrow, Headline, Lede, Section } from '@/components/marketing/section'
import { Phase, Step } from '@/components/marketing/feature'
import { PhoneShot, Showcase } from '@/components/marketing/screens'
import { pageMetadata } from '@/lib/seo'
import { currentOffer } from '@/lib/pricing'

export const metadata: Metadata = pageMetadata({
  path: '/how-it-works',
  title: 'How It Works — one service call, start to finish',
  description:
    'Follow one garage door service call through Garage Door HQ: the phone ringing, the schedule, the inspection, the estimate, the signature, the parts, the invoice and the Door Passport.',
})

/**
 * One service call, in four phases.
 *
 * The first version of this page was ten full-width sections of identical
 * shape, which made ten steps in one job read as ten unrelated things and ran
 * to about eight screens. Grouping them into phases with a visible spine does
 * the opposite: the steps inside a phase obviously belong together, and the
 * four phases obviously follow one another.
 *
 * Surfaces alternate, and only two phases carry a screenshot panel, so the
 * page has a rhythm rather than a drumbeat.
 */

export default function HowItWorksPage() {
  const offer = currentOffer()

  return (
    <>
      {/* ---------------------------------------------------------------- Intro */}
      <Section surface="base" className="pt-12 sm:pt-16" size="tight">
        <div className="max-w-3xl">
          <Eyebrow>How it works</Eyebrow>
          <Headline as="h1" size="large" className="mt-4">
            One service call, start to finish.
          </Headline>
          <Lede className="mt-6">
            A broken spring on Maple Street. Ten steps from the phone ringing to the door&rsquo;s
            own record being updated — every one of them a screen in the real product, grouped
            into the four parts of the job.
          </Lede>
        </div>

        <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { phase: 'Before the truck moves', steps: 'Steps 1–2' },
            { phase: 'At the door', steps: 'Steps 3–5' },
            { phase: 'The conversation', steps: 'Steps 6–7' },
            { phase: 'Done and paid', steps: 'Steps 8–10' },
          ].map((item, index) => (
            <li
              key={item.phase}
              className="rounded-[--radius-card] border border-navy-800 bg-navy-900 px-5 py-4"
            >
              <span className="num text-xs font-bold text-brand-400">
                Phase {index + 1}
              </span>
              <p className="mt-1 font-bold leading-snug text-white">{item.phase}</p>
              <p className="mt-0.5 text-sm text-navy-300">{item.steps}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* -------------------------------------------- Phase 1 — before the truck */}
      <Section surface="light">
        <Phase
          index={1}
          name="Before the truck moves"
          summary="The call comes in, and the job already knows which door it is about."
          media={
            <PhoneShot
              name="schedule"
              width={260}
              sizes="(max-width: 640px) 68vw, 260px"
              alt="The schedule showing the day's jobs laid out by time"
            />
          }
          steps={
            <>
              <Step number={1} title="Customer calls">
                Find them if they have called before, create them if they have not. A customer
                has properties; a property has doors. If this is the same house as last February,
                the door is already there with everything on it.
              </Step>
              <Step number={2} title="Schedule">
                Put the job on the calendar with the door it is for and what they said is wrong. A
                one-person company does not assign it to anyone; a larger one picks the
                technician.
              </Step>
            </>
          }
        />
      </Section>

      {/* ------------------------------------------------- Phase 2 — at the door */}
      <Section surface="sunken">
        <Phase
          index={2}
          name="At the door"
          summary="The technician arrives already knowing the equipment, and leaves with a priced repair."
          media={
            <PhoneShot
              name="inspection-finding"
              width={260}
              sizes="(max-width: 640px) 68vw, 260px"
              alt="The inspection checklist with Springs marked Failed and a Build Options button appearing"
            />
          }
          steps={
            <>
              <Step number={3} title="Arrive">
                The job opens with the address, the phone number, the door, the opener, the
                springs on it and what was done last time. Nobody reads the history out over the
                phone.
              </Step>
              <Step number={4} title="Inspect">
                Work down the door: spring system, hardware, door, opener, safety. Each component
                takes the kind of answer it has — springs are Good through Failed, a balance test
                is Balanced or Needs Adjustment, lubrication is Complete or Needed, auto-reverse
                passes or fails.
              </Step>
              <Step number={5} title="Build the repair">
                Findings that need work become estimate items. Tap Build Options and the failed
                spring is a line with a price from your own price book. Offer one option, or
                three — whatever this door needs.
              </Step>
            </>
          }
        />
      </Section>

      {/* ------------------------------------------- Phase 3 — the conversation */}
      <Section surface="base">
        <Phase
          index={3}
          name="The conversation"
          summary="The customer sees what was found, picks when there is a choice, and signs."
          media={
            <PhoneShot
              name="presentation-signature"
              width={260}
              sizes="(max-width: 640px) 68vw, 260px"
              alt="The customer signing on the phone, with the chosen option and total above the signature pad"
            />
          }
          steps={
            <>
              <Step number={6} title="Present">
                Tap Present to Customer and hand them the phone. The device locks to that one
                estimate — they cannot wander into your pricing, your other customers or your
                schedule. For a full installation proposal, send it instead and let them think
                about it.
              </Step>
              <Step number={7} title="Approve">
                They read what was found, pick an option when there is one to pick, type their
                name and sign with a finger. The signature is stored with the estimate and the
                option they chose, not with a different version of it.
              </Step>
            </>
          }
        />
      </Section>

      {/* ----------------------------------------------- Phase 4 — done and paid */}
      <Section surface="sunken">
        <Phase
          index={4}
          name="Done and paid"
          summary="The work happens, the parts come off the truck, the money arrives, and the door remembers."
          last
          media={
            <PhoneShot
              name="invoice"
              width={260}
              sizes="(max-width: 640px) 68vw, 260px"
              alt="An invoice showing the approved work, the parts used and the amount due"
            />
          }
          steps={
            <>
              <Step number={8} title="Do the work">
                Fit the springs. Record the parts you used. Completing the job moves those parts
                out of the truck they came off, so the count is right without anybody updating a
                spreadsheet in the evening.
              </Step>
              <Step number={9} title="Invoice and payment">
                The invoice is built from the approved work and the parts used. Take a card on the
                spot, or record cash or a cheque. Card payments settle into your own Stripe
                account — Garage Door HQ never holds your money.
              </Step>
              <Step number={10} title="Door Passport updates">
                The door now knows it has new springs, when they went on and what came off. Next
                February, whoever pulls into that driveway starts from there instead of from
                nothing.
              </Step>
            </>
          }
        />
      </Section>

      {/* ------------------------------------------------- Where it all ends up */}
      <Section surface="light">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>And then</Eyebrow>
          <Headline className="mt-3">The door keeps the record.</Headline>
          <Lede className="mx-auto mt-5 text-center">
            Everything the call produced lands in one place. The next visit starts here rather
            than with a phone call to whoever went last time.
          </Lede>
        </div>
        <Showcase
          className="mt-12"
          name="desktop-door-passport"
          alt="The Door Passport after the job: the door's specifications, its current torsion spring system and the dates each piece of equipment was fitted"
          caption="The same door, after the work. The springs it now has, and when they went on."
        />
      </Section>

      {/* ------------------------------------------------------------- Final CTA */}
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
