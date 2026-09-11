import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/session'
import { Logo } from '@/components/ui/logo'
import { ButtonLink } from '@/components/ui/button'
import {
  BoxIcon,
  BriefcaseIcon,
  CalendarIcon,
  CardIcon,
  ChartIcon,
  DocumentIcon,
  DoorIcon,
  SpringIcon,
} from '@/components/ui/icons'

export const metadata: Metadata = {
  title: 'Garage Door HQ — Run your garage door business from one place',
}

/**
 * The marketing surface is the dark half of the brand. The application behind
 * the login is light, because that is what reads in a driveway at noon.
 */
const CAPABILITIES = [
  { icon: CalendarIcon, label: 'Schedule Jobs' },
  { icon: BriefcaseIcon, label: 'Manage Customers' },
  { icon: DoorIcon, label: 'Door History' },
  { icon: SpringIcon, label: 'Spring Lookup' },
  { icon: BoxIcon, label: 'Track Inventory' },
  { icon: DocumentIcon, label: 'Estimates & Invoices' },
  { icon: CardIcon, label: 'Get Paid' },
  { icon: ChartIcon, label: 'Grow Your Business' },
]

export default async function MarketingPage() {
  const user = await getAuthenticatedUser()
  if (user) redirect(user.hasOrganization ? '/today' : '/onboarding/company')

  return (
    <main className="min-h-dvh bg-navy-950 text-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Logo tone="dark" />
        <Link href="/login" className="text-sm font-semibold text-navy-200 hover:text-white">
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-5xl px-5 pb-16 pt-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-400">
          Built for the guy in the truck
        </p>
        <h1 className="mt-4 text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
          Less paperwork.
          <br />
          More doors.
          <br />
          <span className="text-brand-400">A stronger business.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-navy-200 sm:text-lg">
          Scheduling. Door history. Spring lookups. Estimates. Invoices. Inventory. Payments.
          Everything you need — built for garage door pros, not adapted from generic
          field-service software.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/signup" size="lg" className="sm:w-auto">
            Start your free trial
          </ButtonLink>
          <ButtonLink
            href="/login"
            size="lg"
            variant="secondary"
            className="border-navy-700 bg-navy-800 text-white hover:bg-navy-700 sm:w-auto"
          >
            Sign in
          </ButtonLink>
        </div>

        <div className="mt-10 inline-flex flex-col items-start rounded-[--radius-card] border border-brand-800 bg-brand-900/40 px-5 py-4">
          <p className="num text-3xl font-bold text-white">
            $39.99<span className="text-base font-semibold text-navy-200">/month</span>
          </p>
          <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-brand-300">
            Everything included. No limits.
          </p>
          <p className="mt-1 text-sm text-navy-200">
            No per-user fee. No per-technician fee. No job or customer limits.
          </p>
        </div>

        <ul className="mt-14 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
          {CAPABILITIES.map((capability) => {
            const Icon = capability.icon
            return (
              <li key={capability.label} className="flex flex-col items-start gap-3">
                <Icon className="h-7 w-7 text-white" />
                <span className="text-sm font-semibold leading-tight text-navy-100">
                  {capability.label}
                </span>
              </li>
            )
          })}
        </ul>

        <div className="mt-16 rounded-[--radius-card] border border-navy-800 bg-navy-900 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-400">
            What generic software does not know
          </p>
          <p className="mt-3 text-lg leading-relaxed text-navy-100">
            &ldquo;This customer has a 16x7 Clopay door with a LiftMaster 87504 opener, a torsion
            system on .225 x 2&quot; x 27&quot; springs replaced two years ago — and Truck #2 has
            the correct replacements on board right now.&rdquo;
          </p>
        </div>
      </section>

      <footer className="border-t border-navy-800">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
          <Logo tone="dark" />
          <p className="text-sm text-navy-300">
            $39.99/month. Everything included. One plan, every feature.
          </p>
        </div>
      </footer>
    </main>
  )
}
