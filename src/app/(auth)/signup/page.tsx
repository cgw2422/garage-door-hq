import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser, landingFor } from '@/lib/session'
import { Logo } from '@/components/ui/logo'
import { SignupForm } from './signup-form'
import { trialDays } from '@/server/organizations/provision'

export const metadata: Metadata = { title: 'Create your account' }

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  const user = await getAuthenticatedUser()
  if (user) redirect(landingFor(user))

  const { ref } = await searchParams

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <Logo tone="dark" showTagline />
      </div>
      <div className="rounded-[--radius-card] bg-surface p-5 shadow-[--shadow-raised]">
        <h1 className="text-xl font-bold text-ink">Create your account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {trialDays()} days free. No card needed.
        </p>
        <SignupForm referralCode={ref ?? ''} />
      </div>
      <p className="mt-6 text-center text-sm text-navy-300">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-brand-400">
          Sign in
        </Link>
      </p>
    </div>
  )
}
