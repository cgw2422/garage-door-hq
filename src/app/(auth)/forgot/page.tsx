import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser, landingFor } from '@/lib/session'
import { Logo } from '@/components/ui/logo'
import { ForgotForm } from './forgot-form'

export const metadata: Metadata = { title: 'Reset your password' }
export const dynamic = 'force-dynamic'

export default async function ForgotPasswordPage() {
  const user = await getAuthenticatedUser()
  if (user) redirect(landingFor(user))

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <Logo tone="dark" />
      </div>
      <div className="rounded-[--radius-card] bg-surface p-5 shadow-[--shadow-raised]">
        <h1 className="text-xl font-bold text-ink">Reset your password</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Enter your email and we&apos;ll send you a link to choose a new one.
        </p>
        <ForgotForm />
      </div>
    </div>
  )
}
