'use server'

import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { completeOnboarding } from '@/server/organizations/onboarding'

export async function finishOnboarding() {
  const session = await requireSession()
  await completeOnboarding(session.organizationId)
  redirect('/today')
}
