import type { ReactNode } from 'react'
import { requireUser } from '@/lib/session'
import { Logo } from '@/components/ui/logo'

export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  await requireUser()

  return (
    <div className="flex min-h-dvh flex-col bg-navy-900">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Logo tone="dark" />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
