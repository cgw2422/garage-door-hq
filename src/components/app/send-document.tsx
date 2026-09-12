'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { sendDocumentAction, type SendDocumentResult } from '@/app/actions/portal'

/**
 * Send an estimate or an invoice to the customer.
 *
 * The wording is careful about what it claims. "Sent" means a provider took
 * the message; it never says "delivered", because only a delivery webhook
 * could know that. When email is not configured, or a send fails, the link is
 * right there to copy — the customer still gets their document.
 */
export function SendDocument({
  target,
  documentId,
  customerEmail,
  customerName,
  emailConfigured,
  existingLink,
  label,
}: {
  target: 'ESTIMATE' | 'INVOICE'
  documentId: string
  customerEmail: string | null
  customerName: string
  emailConfigured: boolean
  existingLink: {
    expiresAt: string
    viewCount: number
    lastViewedAt: string | null
  } | null
  label: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SendDocumentResult | null>(null)
  const [address, setAddress] = useState(customerEmail ?? '')
  const [editing, setEditing] = useState(!customerEmail)
  const [copied, setCopied] = useState(false)

  const noun = target === 'ESTIMATE' ? 'estimate' : 'invoice'

  function send() {
    setResult(null)
    startTransition(async () => {
      const outcome = await sendDocumentAction({
        target,
        documentId,
        ...(address && address !== customerEmail ? { toAddress: address } : {}),
      })
      setResult(outcome)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader title={label} />

      {result?.ok ? (
        <Alert tone="success" title={`${capitalize(noun)} sent`}>
          Emailed to {result.toAddress ?? address}. You&apos;ll see it in this customer&apos;s
          history, along with when they open it.
        </Alert>
      ) : null}

      {result && !result.ok ? (
        <Alert tone="warning" title="That email did not go out">
          {result.error ?? 'The message could not be sent.'} The link below works — send it to{' '}
          {customerName} yourself, or try again.
        </Alert>
      ) : null}

      {!emailConfigured && !result ? (
        <Alert tone="info">
          Email delivery is not connected in this deployment. Create a link and send it however
          you normally reach your customer.
        </Alert>
      ) : null}

      {!editing ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-[0.9375rem] text-ink">{address}</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Change
          </Button>
        </div>
      ) : (
        <div className="mt-3">
          <Field label="Send to" hint={customerEmail ? undefined : 'This customer has no email on file.'}>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="customer@example.com"
            />
          </Field>
        </div>
      )}

      <Button
        type="button"
        fullWidth
        className="mt-3"
        disabled={pending || !address.includes('@')}
        onClick={send}
      >
        {pending
          ? 'Sending…'
          : result && !result.ok
            ? 'Try again'
            : `Send ${noun}`}
      </Button>

      {result?.url ? (
        <>
          <p className="mt-3 break-all rounded-[--radius-control] border border-hairline bg-surface-sunken px-3 py-2.5 text-xs text-ink">
            {result.url}
          </p>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            className="mt-2"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(result.url!)
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
            The link is shown once. Sending again creates a new one and retires this.
          </p>
        </>
      ) : existingLink ? (
        <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
          A link is already active{' '}
          {existingLink.viewCount > 0
            ? `and has been opened ${existingLink.viewCount} ${
                existingLink.viewCount === 1 ? 'time' : 'times'
              }.`
            : 'but has not been opened yet.'}{' '}
          Sending again replaces it.
        </p>
      ) : null}
    </Card>
  )
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
