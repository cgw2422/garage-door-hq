import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { AlertIcon, CheckIcon } from './icons'

export function Alert({
  tone = 'danger',
  title,
  children,
  className,
}: {
  tone?: 'danger' | 'warning' | 'success' | 'info'
  title?: string
  children?: ReactNode
  className?: string
}) {
  const styles = {
    danger: 'bg-danger-50 text-danger-700',
    warning: 'bg-warning-50 text-warning-700',
    success: 'bg-success-50 text-success-700',
    info: 'bg-brand-50 text-brand-700',
  }[tone]

  const Icon = tone === 'success' ? CheckIcon : AlertIcon

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-2.5 rounded-[--radius-control] px-3.5 py-3', styles, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 text-sm">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5', 'leading-relaxed')}>{children}</div> : null}
      </div>
    </div>
  )
}
