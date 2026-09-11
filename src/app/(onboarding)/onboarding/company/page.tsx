import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/session'
import { OnboardingSteps } from '../steps'
import { CompanyForm } from './company-form'

export const metadata: Metadata = { title: 'Your company' }

export default async function OnboardingCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  const user = await getAuthenticatedUser()
  if (user?.hasOrganization) redirect('/onboarding/size')

  const { ref } = await searchParams

  return (
    <div className="rounded-[--radius-card] bg-surface p-5 shadow-[--shadow-raised]">
      <OnboardingSteps current={1} />
      <h1 className="text-xl font-bold text-ink">Your company</h1>
      <p className="mt-1 text-sm text-ink-muted">
        This is what customers see on estimates and invoices. You can change it any time.
      </p>
      <CompanyForm referralCode={ref ?? ''} />
    </div>
  )
}
