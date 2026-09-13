'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth'
import { AUTH_NOT_CONFIGURED, authSecretConfigured, warnIfAuthUnconfigured } from '@/lib/readiness'

export interface LoginState {
  error?: string
}

export async function authenticate(_prev: LoginState, formData: FormData): Promise<LoginState> {
  // A deployment missing AUTH_SECRET cannot sign anyone in. Say which
  // variable is missing rather than letting Auth.js answer with JSON.
  if (!authSecretConfigured()) {
    warnIfAuthUnconfigured()
    return { error: AUTH_NOT_CONFIGURED }
  }

  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/today',
    })
    return {}
  } catch (error) {
    if (error instanceof AuthError) {
      // Never distinguish "no such account" from "wrong password".
      return { error: 'That email and password do not match an account.' }
    }
    throw error
  }
}
