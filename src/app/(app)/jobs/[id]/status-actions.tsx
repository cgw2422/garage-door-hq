'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { JobStatus } from '@prisma/client'
import { Alert } from '@/components/ui/alert'
import { Button, ButtonLink } from '@/components/ui/button'
import { NavigationIcon, WrenchIcon } from '@/components/ui/icons'
import { advanceStatusAction } from './actions'

/**
 * The single next step, sized for a thumb.
 *
 * A technician on a driveway should see one obvious action, not a status
 * dropdown. Completion is never one of these — it opens the checklist screen,
 * because completing a job moves inventory and money.
 */
export function JobStatusActions({ jobId, status }: { jobId: string; status: JobStatus }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function advance(next: 'ON_MY_WAY' | 'ARRIVED' | 'IN_PROGRESS') {
    setError(null)
    startTransition(async () => {
      const result = await advanceStatusAction({ jobId, status: next })
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  if (status === 'COMPLETED' || status === 'CANCELLED') {
    return (
      <ButtonLink href={`/jobs/${jobId}?tab=door`} variant="secondary" size="lg" className="flex-1">
        View door history
      </ButtonLink>
    )
  }

  return (
    <>
      {error ? <Alert className="absolute -top-16 inset-x-3">{error}</Alert> : null}

      {status === 'SCHEDULED' ? (
        <Button
          size="lg"
          className="flex-1"
          icon={<NavigationIcon />}
          disabled={pending}
          onClick={() => advance('ON_MY_WAY')}
        >
          On My Way
        </Button>
      ) : null}

      {status === 'ON_MY_WAY' ? (
        <Button size="lg" className="flex-1" disabled={pending} onClick={() => advance('ARRIVED')}>
          I&apos;ve Arrived
        </Button>
      ) : null}

      {status === 'ARRIVED' || status === 'WAITING' ? (
        <Button
          size="lg"
          className="flex-1"
          icon={<WrenchIcon />}
          disabled={pending}
          onClick={() => advance('IN_PROGRESS')}
        >
          Start Job
        </Button>
      ) : null}

      {status === 'IN_PROGRESS' ? (
        <ButtonLink href={`/jobs/${jobId}/complete`} size="lg" className="flex-1">
          Complete Job
        </ButtonLink>
      ) : null}
    </>
  )
}
