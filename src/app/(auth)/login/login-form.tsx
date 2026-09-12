'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { authenticate, type LoginState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  )
}

export function LoginForm({ justReset }: { justReset?: boolean }) {
  const [state, formAction] = useActionState<LoginState, FormData>(authenticate, {})

  return (
    <form action={formAction} className="mt-5 space-y-4">
      {justReset ? (
        <p className="rounded-[--radius-control] bg-success-50 px-3 py-2.5 text-sm font-medium text-success-700">
          Your password has been changed. Sign in with the new one.
        </p>
      ) : null}

      <Field label="Email">
        <Input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@company.com"
        />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>

      <p className="-mt-1 text-right">
        <Link href="/forgot" className="text-sm font-semibold text-brand-600">
          Forgot your password?
        </Link>
      </p>

      {state.error ? (
        <p role="alert" className="rounded-[--radius-control] bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-700">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  )
}
