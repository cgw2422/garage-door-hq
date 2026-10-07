import type { Metadata } from 'next'
import Link from 'next/link'
import { Bullets, Clause, LegalPage } from '@/components/marketing/legal'
import { pageMetadata } from '@/lib/seo'
import { platformBranding } from '@/server/email/branding'
import { currentPriceLabel, trialLabel } from '@/lib/pricing'

export const metadata: Metadata = pageMetadata({
  path: '/terms',
  title: 'Terms of Service — Garage Door HQ',
  description:
    'The terms you agree to when you use Garage Door HQ: what we provide, what you are responsible for, how billing and cancellation work, and who owns what.',
})

/** The date this text last changed. Update it when the text does. */
const UPDATED = '2026-10-07'

export default function TermsPage() {
  const support = platformBranding().supportEmail

  return (
    <LegalPage
      title="Terms of Service"
      updated={UPDATED}
      summary="These terms apply when you use Garage Door HQ. They are written to be read, not to be impressive."
    >
      <Clause heading="The agreement">
        <p>
          By creating an account or using Garage Door HQ you agree to these terms. If you are
          agreeing on behalf of a company, you confirm you are allowed to bind it.
        </p>
      </Clause>

      <Clause heading="What we provide">
        <p>
          Access to Garage Door HQ: scheduling, customers, properties and doors, inspections,
          estimates, Customer Presentation Mode, inventory, invoices, payments and reporting, as
          the product exists at the time you use it.
        </p>
        <p>
          We work to keep the service available but do not promise uninterrupted operation. We may
          add, change or remove features. If we remove something you rely on, we will tell account
          owners rather than letting you discover it.
        </p>
      </Clause>

      <Clause heading="Your account">
        <Bullets
          items={[
            'Keep your sign-in details secure, and do not share a login between people — invite them instead.',
            'You are responsible for what happens under your account, including what the people you invite do.',
            'Tell us promptly if you think somebody has gained access they should not have.',
            'Give us accurate account and billing information, and keep it current.',
          ]}
        />
      </Clause>

      <Clause heading="Your data, and your customers’ data">
        <p>
          Everything you put into Garage Door HQ remains yours. You grant us only the permission
          needed to host it, display it back to you, back it up, and send the things you ask the
          product to send.
        </p>
        <p>
          You are responsible for having the right to enter your customers&rsquo; details, for
          telling them what you do with them where you are required to, and for the accuracy of
          what you record. The{' '}
          <Link
            href="/privacy"
            className="font-semibold text-brand-300 underline hover:text-brand-200"
          >
            Privacy Policy
          </Link>{' '}
          explains how that information is handled.
        </p>
      </Clause>

      <Clause heading="Trial, billing and cancellation">
        <Bullets
          items={[
            <>
              New accounts start with a {trialLabel()}. No card is required to begin, and nothing
              is charged during it.
            </>,
            <>
              After the trial, access to create and change records requires an active
              subscription at the price you signed up at — currently {currentPriceLabel()}.
            </>,
            'Subscriptions renew automatically at the end of each period until cancelled. Billing is handled by Stripe; we never see your card number.',
            'You can cancel at any time from the billing screen. Cancellation takes effect at the end of the period you have already paid for, and we do not pro-rate partial periods.',
            'If the advertised price changes, your existing subscription stays at the price you subscribed to unless you are told otherwise in advance and choose to continue.',
            'If a payment fails, we will keep trying and tell you. Prolonged non-payment puts the account into the read-only state described below.',
          ]}
        />
      </Clause>

      <Clause heading="When a subscription ends">
        <p>
          Your account becomes read-only. You can still see everything — jobs, customers, doors,
          photos, estimates, invoices — but cannot create or change records until you activate
          again. We do not delete your data automatically when a subscription lapses.
        </p>
        <p>
          If you want your account and its contents deleted, ask us and we will do it, subject to
          records we are legally required to keep.
        </p>
      </Clause>

      <Clause heading="Payments from your customers">
        <p>
          Where you connect your own Stripe account, your customers&rsquo; payments are charged on
          that account. Your business is the merchant of record for that work, the funds go to
          you, and Stripe&rsquo;s own terms apply to that relationship. Garage Door HQ does not hold
          or transmit those funds and takes no percentage of them.
        </p>
        <p>
          Chargebacks, refunds and disputes about work you performed are between you and your
          customer.
        </p>
      </Clause>

      <Clause heading="Acceptable use">
        <p>You agree not to:</p>
        <Bullets
          items={[
            'Use the service to break the law, or to send unlawful or unsolicited messages.',
            'Attempt to reach another company’s data, or probe, scan or interfere with the service except as described on the security page.',
            'Resell or rebrand the service as your own without our written agreement.',
            'Upload anything that infringes somebody else’s rights.',
          ]}
        />
        <p>
          We may suspend an account that is causing harm to the service or to other users, and will
          tell you why.
        </p>
      </Clause>

      <Clause heading="Our intellectual property">
        <p>
          Garage Door HQ — the software, the design and the name — remains ours. These terms give
          you permission to use it, not ownership of it.
        </p>
      </Clause>

      <Clause heading="Estimates, inspections and professional judgement">
        <p>
          Garage Door HQ is a record-keeping and workflow tool. It does not inspect doors, size
          springs, or decide what repair is correct — your technicians do. In particular, the
          spring lookup matches a spring you have measured against parts you stock; it does not
          calculate a spring from a door weight, and nothing in the product should be treated as
          engineering advice.
        </p>
        <p>
          You remain responsible for the work you perform, the prices you quote, the warranties you
          offer and the safety of what you install.
        </p>
      </Clause>

      <Clause heading="Disclaimers and liability">
        <p>
          The service is provided as it is. To the fullest extent the law allows, we disclaim
          implied warranties of merchantability, fitness for a particular purpose and
          non-infringement.
        </p>
        <p>
          To the fullest extent the law allows, neither party is liable for indirect, incidental,
          special or consequential damages, or for lost profits. Our total liability arising out of
          these terms is limited to the amount you paid us in the twelve months before the claim.
        </p>
        <p>
          Nothing here limits liability that cannot be limited by law, including for fraud or for
          death or personal injury caused by negligence.
        </p>
      </Clause>

      <Clause heading="Changes to these terms">
        <p>
          We may update these terms. If a change is material we will tell account owners before it
          takes effect. Continuing to use the service after that means you accept the new version.
          The date at the top always reflects the current one.
        </p>
      </Clause>

      <Clause heading="Contact">
        <p>
          Questions about these terms can go to{' '}
          {support ? (
            <a
              href={`mailto:${support}`}
              className="font-semibold text-brand-300 underline hover:text-brand-200"
            >
              {support}
            </a>
          ) : (
            <Link
              href="/contact"
              className="font-semibold text-brand-300 underline hover:text-brand-200"
            >
              our contact page
            </Link>
          )}
          .
        </p>
      </Clause>
    </LegalPage>
  )
}
