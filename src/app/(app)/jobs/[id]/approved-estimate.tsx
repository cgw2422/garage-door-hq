'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatCents } from '@/lib/money'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CheckIcon, WrenchIcon } from '@/components/ui/icons'
import { advanceStatusAction } from './actions'

/**
 * What the technician comes back to.
 *
 * The customer has just signed on this device and handed it over. The first
 * thing on the screen has to be the answer — approved, for this much, do this
 * work — and the only thing to do about it has to be one tap away. Anything
 * else makes the technician hunt for a total they watched being agreed thirty
 * seconds ago.
 */
export function ApprovedEstimate({
  jobId,
  optionName,
  totalCents,
  currency,
  signerName,
  canBegin,
}: {
  jobId: string
  optionName: string
  totalCents: number
  currency: string
  signerName: string | null
  canBegin: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function begin() {
    setError(null)
    startTransition(async () => {
      const result = await advanceStatusAction({ jobId, status: 'IN_PROGRESS' })
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="rounded-[--radius-card] border border-success-200 bg-success-50 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-success-600">
          <CheckIcon className="h-5 w-5 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-success-700">
            Approved
          </p>
          <p className="num text-2xl font-bold leading-tight text-ink">
            {formatCents(totalCents, { currency, showCents: false })}
          </p>
          <p className="truncate text-sm text-ink-muted">
            {optionName}
            {signerName ? ` · signed by ${signerName}` : ''}
          </p>
        </div>
      </div>

      {error ? <Alert className="mt-3">{error}</Alert> : null}

      {canBegin ? (
        <Button
          size="lg"
          fullWidth
          className="mt-3"
          icon={<WrenchIcon />}
          disabled={pending}
          onClick={begin}
        >
          Begin Work
        </Button>
      ) : null}
    </div>
  )
}
