'use client'

import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'
import { cn } from '@/lib/cn'
import { MinusIcon, PlusIcon } from './icons'

const CONTROL =
  'w-full rounded-[--radius-control] border border-hairline-strong bg-surface px-3.5 ' +
  'text-ink placeholder:text-ink-subtle transition-colors ' +
  'focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none ' +
  'disabled:bg-surface-sunken disabled:text-ink-subtle'

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[0.8125rem] font-semibold text-ink-muted"
    >
      {children}
    </label>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('w-full', className)}>
      {label ? <Label>{label}</Label> : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-[0.8125rem] font-medium text-danger-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[0.8125rem] text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  )
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(CONTROL, 'h-12', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(CONTROL, 'min-h-24 py-3', className)} {...props} />
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn(CONTROL, 'h-12 appearance-none pr-9', className)} {...props}>
      {children}
    </select>
  )
}

/**
 * Two or three mutually exclusive choices, sized for a thumb. Used for wind
 * direction, inventory scope, and date range on the money dashboard.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  name,
  className,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  name?: string
  className?: string
}) {
  const id = useId()
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={cn(
        'flex gap-1 rounded-[--radius-control] border border-hairline-strong bg-surface-sunken p-1',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            id={`${id}-${option.value}`}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-10 flex-1 rounded-[0.45rem] px-3 text-sm font-semibold transition-colors',
              selected
                ? 'bg-brand-500 text-white shadow-[--shadow-card]'
                : 'text-ink-muted active:bg-white',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Quantity control. Large +/- buttons because typing a number on a phone in a
 * garage is exactly the friction this product exists to remove.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  label,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`Decrease ${label ?? 'quantity'}`}
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        className="flex h-12 w-12 items-center justify-center rounded-[--radius-control] border border-hairline-strong bg-surface text-ink active:bg-surface-sunken disabled:opacity-40"
      >
        <MinusIcon className="h-5 w-5" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label ?? 'Quantity'}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(clamp(next))
        }}
        className={cn(CONTROL, 'num h-12 flex-1 text-center text-lg font-bold')}
      />
      <button
        type="button"
        aria-label={`Increase ${label ?? 'quantity'}`}
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        className="flex h-12 w-12 items-center justify-center rounded-[--radius-control] border border-hairline-strong bg-surface text-ink active:bg-surface-sunken disabled:opacity-40"
      >
        <PlusIcon className="h-5 w-5" />
      </button>
    </div>
  )
}
