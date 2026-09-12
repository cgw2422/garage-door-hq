'use client'

import type { SyncState } from './use-field-draft'

/**
 * What happened to what you just typed.
 *
 * Silent when there is nothing to say. The state that matters is "failed" —
 * the text is safe on the device but the server has not got it — and that one
 * comes with a way to try again rather than just a warning.
 */
export function DraftStatus({
  state,
  error,
  restored,
  onRetry,
}: {
  state: SyncState
  error: string | null
  restored: boolean
  onRetry: () => void
}) {
  if (state === 'idle' && !restored) return null

  if (state === 'failed') {
    return (
      <div className="flex items-center justify-between gap-2 rounded-[--radius-control] bg-warning-50 px-3 py-2">
        <p className="min-w-0 text-xs leading-relaxed text-warning-700">
          {error ?? 'Not saved yet.'} It is kept on this phone.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-xs font-bold text-warning-700 underline"
        >
          Retry
        </button>
      </div>
    )
  }

  if (restored) {
    return (
      <p className="rounded-[--radius-control] bg-brand-50 px-3 py-2 text-xs leading-relaxed text-brand-800">
        Restored what you typed before. Tap out of the box to save it.
      </p>
    )
  }

  const label =
    state === 'saving'
      ? 'Saving…'
      : state === 'saved'
        ? 'Saved'
        : state === 'unsynced'
          ? 'Not saved yet'
          : null

  if (!label) return null

  return (
    <p
      className={`text-xs ${
        state === 'saved' ? 'text-success-600' : 'text-ink-subtle'
      }`}
    >
      {label}
    </p>
  )
}
