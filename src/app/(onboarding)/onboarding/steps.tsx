import { cn } from '@/lib/cn'

/** Three short screens. The count is visible so nobody wonders how long this is. */
export function OnboardingSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="mb-5 flex items-center gap-1.5" aria-label={`Step ${current} of 3`}>
      {[1, 2, 3].map((step) => (
        <li
          key={step}
          className={cn(
            'h-1.5 flex-1 rounded-full',
            step <= current ? 'bg-brand-500' : 'bg-navy-700',
          )}
        />
      ))}
    </ol>
  )
}
