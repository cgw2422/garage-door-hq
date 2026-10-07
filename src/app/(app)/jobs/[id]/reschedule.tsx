'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { rescheduleJobAction } from '@/app/(app)/schedule/actions'

/**
 * Move a job, from the job.
 *
 * The capability already existed and only the calendar knew about it: a person
 * looking at the job a customer has just rung about had to work out that the
 * way to move it was the Schedule screen, find the right day there, and open a
 * sheet. Rescheduling is one of the most ordinary things that happens to a
 * booking — the customer is not home, a part has not arrived, an emergency has
 * taken the afternoon — so it belongs where the job is.
 *
 * The same server action as the calendar's, so the rules are the same ones:
 * `job:write`, a completed job refuses, and the existing duration carries over.
 */
export function RescheduleControl({
  jobId,
  scheduledStart,
  timezone,
}: {
  jobId: string
  /** ISO, or null for a job that has never been given a time. */
  scheduledStart: string | null
  timezone: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const start = scheduledStart ? new Date(scheduledStart) : new Date()
  // The company's timezone, not the device's: an owner checking the schedule
  // from another state should not see the day shift under them.
  const [date, setDate] = useState(() =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(start),
  )
  const [time, setTime] = useState(() =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(start),
  )

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await rescheduleJobAction({ jobId, date, time })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {scheduledStart ? 'Reschedule' : 'Schedule'}
      </Button>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <Field label="Time">
          <Input
            type="time"
            step={900}
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </Field>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <div className="flex gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? 'Moving…' : 'Move job'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setError(null)
            setOpen(false)
          }}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
