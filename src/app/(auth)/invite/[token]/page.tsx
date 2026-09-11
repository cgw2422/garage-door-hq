import type { Metadata } from 'next'
import Link from 'next/link'
import { previewInvitation } from '@/server/team/service'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/roles'
import { Logo } from '@/components/ui/logo'
import { Alert } from '@/components/ui/alert'
import { AcceptInviteForm } from './form'

export const metadata: Metadata = { title: 'Join a team' }
export const dynamic = 'force-dynamic'

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const invitation = await previewInvitation(token)

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <Logo tone="dark" showTagline />
      </div>

      <div className="rounded-[--radius-card] bg-surface p-5 shadow-[--shadow-raised]">
        {!invitation ? (
          <>
            <h1 className="text-xl font-bold text-ink">This link isn&apos;t valid</h1>
            <p className="mt-1 text-sm text-ink-muted">
              It may have been cancelled or replaced. Ask whoever invited you for a new one.
            </p>
          </>
        ) : invitation.used ? (
          <>
            <h1 className="text-xl font-bold text-ink">Already used</h1>
            <p className="mt-1 text-sm text-ink-muted">
              This invitation has been accepted. Sign in with {invitation.email}.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block font-semibold text-brand-600"
            >
              Go to sign in
            </Link>
          </>
        ) : invitation.revoked || invitation.expired ? (
          <>
            <h1 className="text-xl font-bold text-ink">
              {invitation.revoked ? 'Invitation cancelled' : 'Invitation expired'}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Ask {invitation.organizationName} to send you a new link.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-ink">
              Join {invitation.organizationName}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              You&apos;ve been invited as a{' '}
              <span className="font-semibold">{ROLE_LABELS[invitation.role]}</span>.
            </p>
            <Alert tone="info" className="mt-3">
              {ROLE_DESCRIPTIONS[invitation.role]}
            </Alert>

            <AcceptInviteForm
              token={token}
              email={invitation.email}
              hasAccount={invitation.hasAccount}
              firstName={invitation.firstName}
            />
          </>
        )}
      </div>
    </div>
  )
}
