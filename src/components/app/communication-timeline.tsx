import Link from 'next/link'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import type { TimelineEntry, TimelineKind } from '@/server/communications/timeline'

/**
 * One customer's history in one list.
 *
 * The dot colour carries the meaning at a glance: something went out, the
 * customer did something, money moved, or something failed and needs a person.
 */

const TONE: Record<TimelineKind, { dot: string; label: string }> = {
  generated: { dot: 'bg-hairline-strong', label: 'Created' },
  sent: { dot: 'bg-brand-400', label: 'Sent' },
  delivered: { dot: 'bg-brand-600', label: 'Delivered' },
  viewed: { dot: 'bg-warning-500', label: 'Opened' },
  signed: { dot: 'bg-success-500', label: 'Signed' },
  paid: { dot: 'bg-success-600', label: 'Paid' },
  completed: { dot: 'bg-success-600', label: 'Completed' },
  failed: { dot: 'bg-danger-500', label: 'Failed' },
}

export function CommunicationTimeline({
  entries,
  timezone,
  title = 'History',
}: {
  entries: TimelineEntry[]
  timezone: string
  title?: string
}) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader title={title} />
        <EmptyState
          title="Nothing yet"
          body="Estimates, invoices, emails and payments will show up here as they happen."
        />
      </Card>
    )
  }

  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  })

  // Grouped by the company's day, not the server's.
  const groups = new Map<string, TimelineEntry[]>()
  for (const entry of entries) {
    const day = dayFormatter.format(entry.at)
    const bucket = groups.get(day) ?? []
    bucket.push(entry)
    groups.set(day, bucket)
  }

  return (
    <Card>
      <CardHeader title={title} />
      <div className="space-y-4">
        {[...groups.entries()].map(([day, dayEntries]) => (
          <div key={day}>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-ink-subtle">
              {day}
            </p>
            <ul className="mt-2 space-y-2.5">
              {dayEntries.map((entry) => {
                const tone = TONE[entry.kind]
                const body = (
                  <>
                    <span
                      className={`mt-[0.4rem] h-2 w-2 shrink-0 rounded-full ${tone.dot}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.9375rem] leading-snug text-ink">
                        {entry.title}
                      </span>
                      {entry.detail ? (
                        <span className="block text-xs leading-relaxed text-ink-subtle">
                          {entry.detail}
                        </span>
                      ) : null}
                    </span>
                    <span className="num shrink-0 text-xs text-ink-subtle">
                      {timeFormatter.format(entry.at)}
                    </span>
                  </>
                )

                return (
                  <li key={entry.id}>
                    {entry.href ? (
                      <Link href={entry.href} className="flex items-start gap-2.5">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-start gap-2.5">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  )
}
