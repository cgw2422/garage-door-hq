import { cn } from '@/lib/cn'

/**
 * The Garage Door HQ mark: a house silhouette whose body is a sectional
 * garage door. Drawn as a single scalable SVG so the same geometry serves the
 * horizontal logo, the app icon, the PWA icon and the favicon.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={cn('h-8 w-8', className)} aria-hidden="true">
      <path
        d="M4 20.5 24 6l20 14.5V43a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V20.5Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M12 25.5h24M12 31h24M12 36.5h24"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Logo({
  className,
  tone = 'dark',
  showTagline = false,
}: {
  className?: string
  /** `dark` for the navy marketing surface, `light` for the app chrome. */
  tone?: 'dark' | 'light'
  showTagline?: boolean
}) {
  const isDark = tone === 'dark'
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className={cn('h-7 w-7 shrink-0', isDark ? 'text-brand-400' : 'text-brand-500')} />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'display text-lg leading-none tracking-wide',
            isDark ? 'text-white' : 'text-ink',
          )}
        >
          Garage Door <span className={isDark ? 'text-brand-400' : 'text-brand-500'}>HQ</span>
        </span>
        {showTagline ? (
          <span
            className={cn(
              'mt-1 text-[0.5rem] font-medium uppercase tracking-[0.22em]',
              isDark ? 'text-navy-300' : 'text-ink-subtle',
            )}
          >
            Doors done right.
          </span>
        ) : null}
      </span>
    </span>
  )
}
