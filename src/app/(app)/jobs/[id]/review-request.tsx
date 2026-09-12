'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Card, CardHeader } from '@/components/ui/card'
import { SubmitButton } from '@/components/ui/submit-button'
import type { FormState } from '@/lib/form'
import { sendReviewRequestAction } from './actions'

/**
 * Ask for a review, from the job that earned it.
 *
 * Only shown once the job is complete. If one was already queued or sent, the
 * state says so rather than offering a button that would refuse.
 */
export function ReviewRequestPanel({
  jobId,
  sentAt,
  queued,
  customerHasEmail,
  destinationConfigured,
  enabled,
}: {
  jobId: string
  sentAt: string | null
  queued: boolean
  customerHasEmail: boolean
  destinationConfigured: boolean
  enabled: boolean
}) {
  const [state, formAction] = useActionState<FormState, FormData>(sendReviewRequestAction, {})

  if (sentAt) {
    return (
      <Card>
        <CardHeader title="Review request" />
        <p className="text-sm leading-relaxed text-ink-muted">
          Sent to this customer on {sentAt}. They&apos;re only ever asked once for a job.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader title="Review request" />

      {!enabled ? (
        <p className="text-sm leading-relaxed text-ink-muted">
          Review requests are switched off. Turn them on in Settings to ask customers for a
          Google review.
        </p>
      ) : !destinationConfigured ? (
        <p className="text-sm leading-relaxed text-ink-muted">
          Add your Google review link in Settings and you can ask for a review from here.
        </p>
      ) : !customerHasEmail ? (
        <p className="text-sm leading-relaxed text-ink-muted">
          This customer has no email address on file, so there is nowhere to send it.
        </p>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-ink-muted">
            {queued
              ? 'Queued to go out a couple of hours after the job, once the invoice is settled. You can send it now instead.'
              : 'Ask this customer for a Google review.'}
          </p>

          {state.error ? (
            <div className="mt-3">
              <Alert>{state.error}</Alert>
            </div>
          ) : null}
          {state.values?.review === 'sent' ? (
            <div className="mt-3">
              <Alert tone="success">Review request sent.</Alert>
            </div>
          ) : null}

          <form action={formAction} className="mt-3">
            <input type="hidden" name="jobId" value={jobId} />
            <SubmitButton variant="secondary" fullWidth pendingLabel="Sending…">
              Send review request
            </SubmitButton>
          </form>
        </>
      )}
    </Card>
  )
}
