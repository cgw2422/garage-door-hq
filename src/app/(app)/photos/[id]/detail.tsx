'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { deletePhotoAction, updatePhotoAction } from '@/app/actions/photos'

const KINDS = [
  { value: 'BEFORE', label: 'Before' },
  { value: 'AFTER', label: 'After' },
  { value: 'DAMAGE', label: 'Damage' },
  { value: 'EQUIPMENT', label: 'Door / Opener' },
  { value: 'SERIAL_TAG', label: 'Model / Serial tag' },
  { value: 'INSPECTION', label: 'Inspection' },
  { value: 'OTHER', label: 'Other' },
] as const

type Kind = (typeof KINDS)[number]['value']

export function PhotoDetail({
  photoId,
  kind,
  caption,
  contextHref,
  contextLabel,
  meta,
  canDelete,
}: {
  photoId: string
  kind: string
  caption: string
  contextHref: string
  contextLabel: string
  meta: string[]
  canDelete: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [currentKind, setCurrentKind] = useState<Kind>(kind as Kind)
  const [currentCaption, setCurrentCaption] = useState(caption)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await updatePhotoAction({
        photoId,
        kind: currentKind,
        caption: currentCaption,
      })
      if (!result.ok) setError(result.error)
      else {
        setSaved(true)
        router.refresh()
      }
    })
  }

  function remove() {
    setError(null)
    startTransition(async () => {
      await deletePhotoAction({ photoId, revalidate: contextHref })
      router.push(contextHref)
    })
  }

  return (
    <>
      {/* Served by the authorized route, so the browser sends the session
          cookie and Next's optimizer is bypassed. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[--radius-card] bg-navy-900">
        <Image
          src={`/api/files/photos/${photoId}`}
          alt={caption || `${kind.toLowerCase()} photo`}
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, 700px"
          className="object-contain"
        />
      </div>

      <Card>
        <CardHeader title="Details" />
        <div className="space-y-4">
          <Field label="Category">
            <Select
              value={currentKind}
              onChange={(event) => setCurrentKind(event.target.value as Kind)}
            >
              {KINDS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Caption">
            <Input
              value={currentCaption}
              onChange={(event) => setCurrentCaption(event.target.value)}
              placeholder="Broken left-hand spring, 6 inches from the cone"
            />
          </Field>

          {error ? <Alert>{error}</Alert> : null}
          {saved ? <Alert tone="success">Saved.</Alert> : null}

          <Button type="button" fullWidth disabled={pending} onClick={save}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>

        {meta.length > 0 ? (
          <p className="mt-3 text-xs text-ink-subtle">{meta.join(' · ')}</p>
        ) : null}
      </Card>

      {canDelete ? (
        <Card>
          <CardHeader title="Delete" />
          {confirming ? (
            <div className="space-y-2.5">
              <p className="text-sm text-ink-muted">
                This removes the photo and its stored file. It cannot be undone.
              </p>
              <div className="flex gap-2.5">
                <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  fullWidth
                  disabled={pending}
                  onClick={remove}
                >
                  {pending ? 'Deleting…' : 'Delete photo'}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              fullWidth
              className="text-danger-600"
              onClick={() => setConfirming(true)}
            >
              Delete this photo
            </Button>
          )}
        </Card>
      ) : null}

      <p className="px-1 text-center text-xs text-ink-subtle">
        Back to the {contextLabel}
      </p>
    </>
  )
}
