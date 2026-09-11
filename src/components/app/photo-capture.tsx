'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/cn'
import { Alert } from '@/components/ui/alert'
import { CameraIcon } from '@/components/ui/icons'
import {
  beginPhotoUploadAction,
  completePhotoUploadAction,
} from '@/app/actions/photos'

type PhotoKind = 'BEFORE' | 'AFTER' | 'DAMAGE' | 'EQUIPMENT' | 'SERIAL_TAG' | 'INSPECTION' | 'OTHER'

export interface PhotoTargetProps {
  jobId?: string
  customerId?: string
  propertyId?: string
  doorId?: string
  openerId?: string
  inspectionItemId?: string
  priceBookItemId?: string
  estimateId?: string
  invoiceId?: string
}

/**
 * Camera capture for the field.
 *
 * `capture="environment"` opens the rear camera directly on a phone rather than
 * a file browser. Uploads go straight from the device to storage through a
 * short-lived presigned URL; the app server never handles the bytes.
 */
export function PhotoCapture({
  target,
  kind = 'OTHER',
  label = 'Add Photos',
  revalidate,
  compact = false,
  className,
  allowLibrary = false,
  libraryLabel = 'Upload',
}: {
  target: PhotoTargetProps
  kind?: PhotoKind
  label?: string
  revalidate?: string
  compact?: boolean
  className?: string
  /** Also offer the file picker, for photos already on the device. */
  allowLibrary?: boolean
  libraryLabel?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  async function uploadOne(file: File) {
    const begin = await beginPhotoUploadAction({
      target,
      kind,
      contentType: file.type as never,
      byteSize: file.size,
    })
    if (!begin.ok) throw new Error(begin.error)

    const response = await fetch(begin.url, {
      method: begin.method,
      headers: begin.headers,
      body: file,
    })
    if (!response.ok) throw new Error('The upload was rejected. Check your signal and try again.')

    const done = await completePhotoUploadAction({ photoId: begin.photoId, revalidate })
    if (!done.ok) throw new Error(done.error)
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setBusy(true)
    setProgress({ done: 0, total: files.length })

    try {
      for (let index = 0; index < files.length; index += 1) {
        await uploadOne(files[index]!)
        setProgress({ done: index + 1, total: files.length })
      }
      startTransition(() => router.refresh())
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.')
    } finally {
      setBusy(false)
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const working = busy || pending

  return (
    <div className={className}>
      {/* capture="environment" opens the rear camera directly on a phone. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        onChange={(event) => void onFiles(event.target.files)}
      />
      {/* No capture attribute, so this one opens the photo library instead. */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(event) => void onFiles(event.target.files)}
      />

      <div className={cn('flex gap-2', compact ? '' : 'w-full')}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={working}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-[--radius-control] font-semibold transition-colors disabled:opacity-60',
            compact
              ? 'h-10 border border-hairline-strong bg-surface px-3 text-sm text-ink active:bg-surface-sunken'
              : 'h-12 flex-1 border border-hairline-strong bg-surface px-4 text-[0.9375rem] text-ink active:bg-surface-sunken',
          )}
        >
          <CameraIcon className="h-[1.15em] w-[1.15em]" />
          {working
            ? progress
              ? `Uploading ${progress.done + 1} of ${progress.total}…`
              : 'Uploading…'
            : label}
        </button>

        {allowLibrary ? (
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            disabled={working}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-[--radius-control] font-semibold transition-colors disabled:opacity-60',
              compact
                ? 'h-10 border border-hairline-strong bg-surface px-3 text-sm text-ink active:bg-surface-sunken'
                : 'h-12 flex-1 border border-hairline-strong bg-surface px-4 text-[0.9375rem] text-ink active:bg-surface-sunken',
            )}
          >
            {libraryLabel}
          </button>
        ) : null}
      </div>

      {error ? (
        <Alert className="mt-2" tone="danger">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}
