import Link from 'next/link'
import { billingNotice, type AccessState } from '@/server/billing/access'

/**
 * The one place the app talks to a company about their subscription.
 *
 * Quiet by design. It renders nothing for most of a trial, appears in the last
 * five days, and only becomes unavoidable once an account is actually
 * restricted. A full-screen paywall on day three of a fourteen-day trial is
 * how you lose someone who was going to pay.
 */
export function BillingBanner({ access }: { access: AccessState }) {
  const notice = billingNotice(access)
  if (!notice) return null

  const tone =
    notice.tone === 'danger'
      ? 'border-danger-200 bg-danger-50 text-danger-700'
      : notice.tone === 'warning'
        ? 'border-warning-200 bg-warning-50 text-warning-700'
        : 'border-brand-200 bg-brand-50 text-brand-800'

  return (
    <div className={`rounded-[--radius-card] border px-4 py-3.5 ${tone}`}>
      <p className="text-[0.9375rem] font-bold leading-snug">{notice.title}</p>
      <p className="mt-1 text-sm leading-relaxed opacity-90">{notice.body}</p>
      <Link
        href="/settings/billing"
        className="mt-3 flex h-11 w-full items-center justify-center rounded-[--radius-control] bg-ink font-semibold text-white active:opacity-90"
      >
        {notice.cta}
      </Link>
    </div>
  )
}

/**
 * Shown in place of a create button while an account is read-only, so the
 * reason is where the person is looking rather than only in a banner up top.
 */
export function RestrictedNotice({ access }: { access: AccessState }) {
  if (access.level === 'full') return null

  return (
    <div className="rounded-[--radius-card] border border-hairline-strong bg-surface-sunken px-4 py-4 text-center">
      <p className="text-[0.9375rem] font-bold text-ink">Your data is safe.</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        {access.restrictionReason}
      </p>
      <Link
        href="/settings/billing"
        className="mt-3 flex h-11 w-full items-center justify-center rounded-[--radius-control] bg-brand-500 font-semibold text-white active:bg-brand-700"
      >
        Activate Garage Door HQ
      </Link>
    </div>
  )
}
