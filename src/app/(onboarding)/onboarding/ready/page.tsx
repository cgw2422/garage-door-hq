import type { Metadata } from 'next'
import Link from 'next/link'
import { requireSession } from '@/lib/session'
import { formatDate } from '@/server/jobs/queries'
import { OnboardingSteps } from '../steps'
import { SubmitButton } from '@/components/ui/submit-button'
import { CheckIcon } from '@/components/ui/icons'
import { finishOnboarding } from './actions'

export const metadata: Metadata = { title: "You're set up" }
export const dynamic = 'force-dynamic'

export default async function OnboardingReadyPage() {
  const session = await requireSession()

  const [catalogCount, locations, subscription] = await Promise.all([
    session.db.priceBookItem.count({ where: { isActive: true } }),
    session.db.inventoryLocation.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
    session.db.subscription.findUnique({
      where: { organizationId: session.organizationId },
      select: { trialEndsAt: true },
    }),
  ])

  return (
    <div className="rounded-[--radius-card] bg-surface p-5 shadow-[--shadow-raised]">
      <OnboardingSteps current={3} />
      <h1 className="text-xl font-bold text-ink">You&apos;re set up</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {session.organizationName} is ready. Here is what we put in place.
      </p>

      <ul className="mt-5 space-y-3">
        <ReadyItem>
          <strong className="font-semibold">{catalogCount} price book items</strong> covering
          springs, hardware, openers and labor, with reusable Good/Better/Best packages.
        </ReadyItem>
        <ReadyItem>
          <strong className="font-semibold">
            {locations.map((location) => location.name).join(' and ')}
          </strong>{' '}
          ready for inventory, so parts come off the right truck automatically.
        </ReadyItem>
        <ReadyItem>
          <strong className="font-semibold">Garage door job types</strong> and a residential
          inspection, with every finding wired to the work that fixes it.
        </ReadyItem>
      </ul>

      <div className="mt-5 rounded-[--radius-control] bg-warning-50 px-3.5 py-3 text-sm text-warning-700">
        <p className="font-semibold">Review your prices before you quote</p>
        <p className="mt-0.5 leading-relaxed">
          The starter price book uses suggested numbers, not yours. Set your own in{' '}
          <Link href="/settings/price-book" className="font-semibold underline">
            Price Book
          </Link>
          .
        </p>
      </div>

      {subscription?.trialEndsAt ? (
        <p className="mt-3 text-center text-xs text-ink-subtle">
          Free trial through {formatDate(subscription.trialEndsAt, session.timezone)} · then
          $39.99/month, everything included
        </p>
      ) : null}

      <form action={finishOnboarding} className="mt-5">
        <SubmitButton size="lg" fullWidth pendingLabel="Opening…">
          Go to Today
        </SubmitButton>
      </form>
    </div>
  )
}

function ReadyItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-600">
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
      <span className="text-sm leading-relaxed text-ink">{children}</span>
    </li>
  )
}
