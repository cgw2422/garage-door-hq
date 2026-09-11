'use client'

import { useFormStatus } from 'react-dom'
import type { ComponentProps } from 'react'
import { Button, type ButtonBaseProps } from './button'

/**
 * Disables itself while the action is in flight. Double-submitting a job
 * completion or a payment is exactly the kind of mistake a thumb makes on a
 * phone, so every mutating form in the app uses this.
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: ButtonBaseProps &
  Omit<ComponentProps<'button'>, 'children'> & {
    children: React.ReactNode
    pendingLabel?: string
  }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending ? (pendingLabel ?? 'Working…') : children}
    </Button>
  )
}
