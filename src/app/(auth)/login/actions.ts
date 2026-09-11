'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth'

export interface LoginState {
  error?: string
}

export async function authenticate(_prev: LoginState, formData: FormData): Promise<LoginState> {
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
