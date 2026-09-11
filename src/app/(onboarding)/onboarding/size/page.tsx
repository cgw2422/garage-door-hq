import type { Metadata } from 'next'
import { requireSession } from '@/lib/session'
import { OnboardingSteps } from '../steps'
import { SizeForm } from './size-form'

export const metadata: Metadata = { title: 'About your business' }

export default async function OnboardingSizePage() {
  await requireSession()

  return (
    <div className="rounded-[--radius-card] bg-surface p-5 shadow-[--shadow-raised]">
      <OnboardingSteps current={2} />
      <h1 className="text-xl font-bold text-ink">What best describes you?</h1>
      <p className="mt-1 text-sm text-ink-muted">
        This sets up your trucks. Nothing here limits what you can do.
      </p>
      <SizeForm />
    </div>
  )
}
