import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { Alert } from '@/components/ui/alert'
import { resolveResetToken } from '@/server/auth/password-reset'
import { ResetForm } from './reset-form'

export const metadata: Metadata = { title: 'Choose a new password' }
export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  // Unknown, expired, revoked and already-used all arrive here as null.
  const resolved = await resolveResetToken(token)

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <Logo tone="dark" />
      </div>
      <div className="rounded-[--radius-card] bg-surface p-5 shadow-[--shadow-raised]">
        {resolved ? (
          <>
            <h1 className="text-xl font-bold text-ink">Choose a new password</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Pick something you don&apos;t use anywhere else.
            </p>
            <ResetForm token={token} email={resolved.email} />
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-ink">This link has expired</h1>
            <div className="mt-4">
              <Alert tone="warning">
                Reset links last an hour and can only be used once. Ask for a new one and it will
                work straight away.
              </Alert>
            </div>
            <Link
              href="/forgot"
              className="mt-4 flex h-12 w-full items-center justify-center rounded-[--radius-control] bg-brand-500 font-semibold text-white active:bg-brand-700"
            >
              Send a new link
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
