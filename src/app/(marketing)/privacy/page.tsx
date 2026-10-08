import type { Metadata } from 'next'
import Link from 'next/link'
import { Bullets, Clause, LegalPage } from '@/components/marketing/legal'
import { pageMetadata } from '@/lib/seo'
import { platformBranding } from '@/server/email/branding'

export const metadata: Metadata = pageMetadata({
  path: '/privacy',
  title: 'Privacy Policy — Garage Door HQ',
  description:
    'What Garage Door HQ collects, what it does with it, who it is shared with, and what happens to your data when you leave.',
})

/** The date this text last changed. Update it when the text does. */
const UPDATED = '2026-10-07'

export default function PrivacyPage() {
  const support = platformBranding().supportEmail

  return (
    <LegalPage
      title="Privacy Policy"
      updated={UPDATED}
      summary="Garage Door HQ holds two kinds of information: details about your company, and details about your customers that you put into it. This explains what happens to both."
    >
      <Clause heading="Who this covers">
        <p>
          &ldquo;We&rdquo; and &ldquo;Garage Door HQ&rdquo; mean the service at this website.
          &ldquo;You&rdquo; means the garage door business using it. &ldquo;Your
          customers&rdquo; means the homeowners and businesses whose details you enter.
        </p>
        <p>
          For your customers&rsquo; information, you are the one who decides what is collected and
          why; we hold and process it on your behalf, under your instructions, to run the service.
        </p>
      </Clause>

      <Clause heading="What we collect about you">
        <Bullets
          items={[
            'Account details: your name, email address, phone number and the company you work for.',
            'Company details: business name, address, tax settings, branding and the preferences you set.',
            'Billing details: your subscription status and the brand and last four digits of the card on file. Card numbers are entered on Stripe’s pages and never reach us.',
            'Usage and security records: sign-in times, the actions taken in your account, and an audit trail of changes that matter — who changed a price, who voided an invoice, who changed somebody’s role.',
            'Technical records kept to run and protect the service, such as request logs and error reports.',
          ]}
        />
      </Clause>

      <Clause heading="What we hold on your behalf">
        <p>Whatever you put in. In practice that is:</p>
        <Bullets
          items={[
            'Your customers’ names, addresses, phone numbers and email addresses.',
            'Their properties, and the garage doors at them — equipment, measurements, serial numbers and service history.',
            'Photographs taken on the job.',
            'Inspections, estimates, the option a customer chose, their signature, invoices and payment records.',
            'Messages sent to a customer from inside the app.',
          ]}
        />
        <p>
          We do not sell any of it, we do not share it with other customers of Garage Door HQ, and
          we do not use it to train anything.
        </p>
      </Clause>

      <Clause heading="Why we hold it">
        <Bullets
          items={[
            'To provide the service you are paying for.',
            'To bill you, and to let your customers pay you.',
            'To send the emails the product sends — invitations, password resets, estimates and invoices you choose to send.',
            'To keep the service secure, including detecting and investigating abuse.',
            'To support you when you ask us for help.',
            'To meet legal and tax obligations.',
          ]}
        />
      </Clause>

      <Clause heading="Who else is involved">
        <p>
          Running this requires a small number of service providers. Each receives only what it
          needs:
        </p>
        <Bullets
          items={[
            <>
              <strong className="text-[color:var(--m-heading)]">Our hosting and database provider</strong>, which runs
              the application and stores its data.
            </>,
            <>
              <strong className="text-[color:var(--m-heading)]">Cloudflare R2</strong>, which stores photographs and
              documents in a private bucket.
            </>,
            <>
              <strong className="text-[color:var(--m-heading)]">Stripe</strong>, which handles your subscription and,
              where you have connected your own Stripe account, your customers&rsquo; card
              payments. Those payments are charged on your account, with your business as the
              merchant of record.
            </>,
            <>
              <strong className="text-[color:var(--m-heading)]">Resend</strong>, which delivers the emails the product
              sends.
            </>,
          ]}
        />
        <p>
          We may also disclose information where the law requires it, or where it is necessary to
          protect the service or somebody&rsquo;s safety. If a business transfer ever happened, your
          information would move with the service and this policy would continue to apply until
          you were told otherwise.
        </p>
      </Clause>

      <Clause heading="How long it is kept">
        <p>
          While your account is active, your data stays. If your subscription lapses or you cancel,
          your account becomes read-only: everything stays visible and nothing is deleted
          automatically, so you can come back to it.
        </p>
        <p>
          If you want your account and its contents deleted, ask us and we will do it. Some records
          we are required to keep — billing and tax records in particular — are retained for as
          long as the law requires, and backups age out on their own schedule rather than being
          edited.
        </p>
      </Clause>

      <Clause heading="Security">
        <p>
          Each company&rsquo;s data is isolated from every other company&rsquo;s, access inside your
          company is limited by role, photographs are kept in private storage behind short-lived
          links, and passwords are stored hashed.{' '}
          <Link
            href="/security"
            className="font-semibold text-[color:var(--m-accent)] underline hover:text-[color:var(--m-accent-strong)]"
          >
            The security page
          </Link>{' '}
          explains this in more detail, including what we will not claim.
        </p>
      </Clause>

      <Clause heading="Your choices and rights">
        <p>
          You can view, correct and export much of your information from inside the app, and you
          can ask us for anything you cannot reach yourself. Depending on where you live you may
          have rights to access, correct, delete or object to the handling of your personal
          information. Ask and we will help you exercise them.
        </p>
        <p>
          If one of your customers asks you to delete their details, you can do that yourself; if
          you need our help, ask.
        </p>
      </Clause>

      <Clause heading="Children">
        <p>
          Garage Door HQ is a tool for businesses. It is not directed at children and we do not
          knowingly collect information from them.
        </p>
      </Clause>

      <Clause heading="Changes">
        <p>
          If this policy changes materially we will tell account owners rather than quietly
          updating the date at the top. The date at the top always reflects the current version.
        </p>
      </Clause>

      <Clause heading="Contact">
        <p>
          Questions about any of this{support ? ', or a request about your data,' : ''} can go to{' '}
          {support ? (
            <a
              href={`mailto:${support}`}
              className="font-semibold text-[color:var(--m-accent)] underline hover:text-[color:var(--m-accent-strong)]"
            >
              {support}
            </a>
          ) : (
            <Link
              href="/contact"
              className="font-semibold text-[color:var(--m-accent)] underline hover:text-[color:var(--m-accent-strong)]"
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
