'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { issuePortalLinkAction, revokePortalLinkAction } from '@/app/actions/portal'
import { formatDate } from '@/server/jobs/queries'

/**
 * Issue a private link a customer can open without an account.
 *
 * Email is not connected yet, so the link is shown for the technician to send
 * however they normally reach the customer. Creating a new one revokes the old
 * one, which is what "re-send" should mean.
 */
export function ShareLink({
  target,
  documentId,
  existingLink,
  revalidate,
  label,
  timezone,
}: {
  target: 'ESTIMATE' | 'INVOICE'
  documentId: string
  existingLink: { id: string; expiresAt: string; viewCount: number; lastViewedAt: string | null } | null
  revalidate: string
  label: string
  /** The company's timezone; see the note in TeamManager on why this matters. */
  timezone: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function issue() {
    setError(null)
    startTransition(async () => {
      const result = await issuePortalLinkAction({ target, documentId })
      if (!result.ok) setError(result.error)
      else {
        setUrl(result.url)
        router.refresh()
      }
    })
  }

  function revoke() {
    if (!existingLink) return
    setError(null)
    startTransition(async () => {
      const result = await revokePortalLinkAction({ linkId: existingLink.id, revalidate })
      if (!result.ok) setError(result.error)
      else {
        setUrl(null)
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardHeader title={label} />

      {url ? (
        <>
          <p className="break-all rounded-[--radius-control] border border-hairline bg-surface-sunken px-3 py-2.5 text-xs text-ink">
            {url}
          </p>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            className="mt-2"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <p className="mt-2 text-xs leading-relaxed text-ink-subtle">
            Send this to the customer yourself — email delivery is not connected yet. Anyone
            with the link can open this one document.
          </p>
        </>
      ) : existingLink ? (
        <>
          <p className="text-sm text-ink-muted">
            A link is active and expires{' '}
            {formatDate(new Date(existingLink.expiresAt), timezone)}.
            {existingLink.viewCount > 0
              ? ` Opened ${existingLink.viewCount} time${existingLink.viewCount === 1 ? '' : 's'}.`
              : ' Not opened yet.'}
          </p>
          <div className="mt-3 flex gap-2.5">
            <Button type="button" variant="secondary" disabled={pending} onClick={issue}>
              New link
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-danger-600"
              disabled={pending}
              onClick={revoke}
            >
              Revoke
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-subtle">
            The link itself is not shown again after it is created. Make a new one to share it,
            which replaces the old one.
          </p>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-muted">
            Create a private link the customer can open on their own phone. No account needed.
          </p>
          <Button type="button" fullWidth disabled={pending} onClick={issue}>
            {pending ? 'Creating…' : 'Create customer link'}
          </Button>
        </>
      )}

      {error ? <Alert className="mt-2">{error}</Alert> : null}
    </Card>
  )
}
