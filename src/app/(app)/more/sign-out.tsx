'use client'

import { Button } from '@/components/ui/button'
import { signOutAction } from './actions'

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="secondary" size="lg" fullWidth>
        Sign out
      </Button>
    </form>
  )
}
