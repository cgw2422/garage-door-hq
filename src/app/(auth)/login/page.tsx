import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser, landingFor } from '@/lib/session'
import { Logo } from '@/components/ui/logo'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>
}) {
  const user = await getAuthenticatedUser()
  if (user) redirect(landingFor(user))
  const { reset } = await searchParams

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <Logo tone="dark" showTagline />
      </div>
      <div className="rounded-[--radius-card] bg-surface p-5 shadow-[--shadow-raised]">
        <h1 className="text-xl font-bold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">Let&apos;s get to work.</p>
        <LoginForm justReset={reset === '1'} />
      </div>
      <p className="mt-6 text-center text-sm text-navy-300">
        New here?{' '}
        <Link href="/signup" className="font-semibold text-brand-400">
          Create an account
        </Link>
      </p>
    </div>
  )
}
