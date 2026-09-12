'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { CheckIcon } from '@/components/ui/icons'
import type { SetupChecklist } from '@/server/organizations/setup-checklist'
import { dismissSetupChecklistAction } from '@/app/actions/setup'

/**
 * What is left to set up.
 *
 * Collapsed to a single progress line by default and opened on tap, because a
 * seven-item list is the wrong first thing to see every morning. It never
 * blocks anything and it can be dismissed outright.
 */
export function SetupChecklistCard({ checklist }: { checklist: SetupChecklist }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  if (checklist.dismissed || checklist.finished) return null

  const remaining = checklist.total - checklist.completed

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block text-[0.9375rem] font-bold text-ink">
            Finish setting up
          </span>
          <span className="block text-sm text-ink-muted">
            {checklist.completed} of {checklist.total} done · {remaining} to go
          </span>
        </span>
        <span className="num shrink-0 text-sm font-bold text-brand-600">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-valuenow={checklist.completed}
        aria-valuemin={0}
        aria-valuemax={checklist.total}
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-[width]"
          style={{ width: `${(checklist.completed / checklist.total) * 100}%` }}
        />
      </div>

      {open ? (
        <>
          <ul className="mt-3.5 space-y-2.5">
            {checklist.steps.map((step) => (
              <li key={step.key}>
                {step.done ? (
                  <div className="flex items-start gap-2.5 opacity-60">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-600">
                      <CheckIcon className="h-3 w-3" />
                    </span>
                    <span className="min-w-0 text-[0.9375rem] text-ink line-through">
                      {step.label}
                    </span>
                  </div>
                ) : (
                  <Link href={step.href} className="flex items-start gap-2.5">
                    <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-hairline-strong" />
                    <span className="min-w-0">
                      <span className="block text-[0.9375rem] font-semibold text-ink">
                        {step.label}
                      </span>
                      <span className="block text-xs leading-relaxed text-ink-subtle">
                        {step.detail}
                      </span>
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await dismissSetupChecklistAction()
                router.refresh()
              })
            }
            className="mt-3.5 w-full text-center text-xs font-semibold text-ink-subtle underline"
          >
            {pending ? 'Hiding…' : 'Hide this for good'}
          </button>
        </>
      ) : null}
    </Card>
  )
}
