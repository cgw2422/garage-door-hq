import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { Logo } from '@/components/ui/logo'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage() {
  if (await getSession()) redirect('/today')

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <Logo tone="dark" showTagline />
      </div>
      <div className="rounded-[--radius-card] bg-surface p-5 shadow-[--shadow-raised]">
        <h1 className="text-xl font-bold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">Let&apos;s get to work.</p>
        <LoginForm />
      </div>
      <p className="mt-6 text-center text-sm text-navy-300">
        $39.99/month. Everything included. No limits.
      </p>
    </div>
  )
}
