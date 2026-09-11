import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-card',
  secondary:
    'bg-white text-ink border border-hairline-strong hover:bg-surface-sunken active:bg-navy-50',
  ghost: 'bg-transparent text-brand-600 hover:bg-brand-50 active:bg-brand-100',
  danger: 'bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-700',
  success: 'bg-success-500 text-white hover:bg-success-600 active:bg-success-700',
}

const SIZES: Record<Size, string> = {
  sm: 'h-10 px-3.5 text-sm gap-1.5',
  // `md` is the field default and never drops below the 48px tap target.
  md: 'h-12 px-4 text-[0.9375rem] gap-2',
  lg: 'h-14 px-5 text-base gap-2.5',
}

const BASE =
  'inline-flex items-center justify-center rounded-[--radius-control] font-semibold ' +
  'transition-colors select-none disabled:opacity-50 disabled:pointer-events-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500'

export interface ButtonBaseProps {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  icon?: ReactNode
  children?: ReactNode
  className?: string
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  icon,
  children,
  className,
  ...props
}: ButtonBaseProps & ComponentProps<'button'>) {
  return (
    <button
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {icon ? <span className="[&>svg]:h-[1.15em] [&>svg]:w-[1.15em]">{icon}</span> : null}
      {children}
    </button>
  )
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth,
  icon,
  children,
  className,
  ...props
}: ButtonBaseProps & ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {icon ? <span className="[&>svg]:h-[1.15em] [&>svg]:w-[1.15em]">{icon}</span> : null}
      {children}
    </Link>
  )
}

/**
 * Round action used for Call / Text / Directions on a job card. Labelled
 * underneath rather than by tooltip, because a technician in a garage has no
 * hover.
 */
export function CircleAction({
  icon,
  label,
  href,
  tone = 'brand',
}: {
  icon: ReactNode
  label: string
  href: string
  tone?: 'brand' | 'success'
}) {
  return (
    <Link href={href} className="flex flex-1 flex-col items-center gap-1.5 py-1">
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full [&>svg]:h-5 [&>svg]:w-5',
          tone === 'success'
            ? 'bg-success-50 text-success-600'
            : 'bg-brand-50 text-brand-600',
        )}
      >
        {icon}
      </span>
      <span className="text-xs font-medium text-ink-muted">{label}</span>
    </Link>
  )
}
