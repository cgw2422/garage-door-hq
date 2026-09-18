import type { Metadata } from 'next'
import Link from 'next/link'
import { landingFor, requireUser } from '@/lib/session'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Card, SectionHeading } from '@/components/ui/card'
import { PasswordForm } from './password-form'

export const metadata: Metadata = { title: 'Your account' }
export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const user = await requireUser()

  return (
    <>
      <PageHeader title="Your account" subtitle={user.email} backHref={landingFor(user)} />
      <PageBody>
        <Card>
          <SectionHeading>Who you are</SectionHeading>
          <dl className="mt-2 space-y-2 text-[0.9375rem]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-subtle">Name</dt>
              <dd className="min-w-0 truncate text-right text-ink">{user.fullName}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-subtle">Email</dt>
              <dd className="min-w-0 truncate text-right text-ink">{user.email}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
            Your email is how you sign in and where your links arrive. Ask whoever owns the
            company account to change it for you.
          </p>
        </Card>

        <Card>
          <SectionHeading>Change your password</SectionHeading>
          <PasswordForm />
        </Card>

        <Card>
          <SectionHeading>Forgotten it instead?</SectionHeading>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            If you cannot remember your current password, sign out and use{' '}
            <Link href="/forgot" className="font-semibold text-brand-600">
              Forgot password
            </Link>
            . That sends a link to your email, so it needs your company&rsquo;s email to be set
            up.
          </p>
        </Card>
      </PageBody>
    </>
  )
}
