'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearDraft,
  draftIsRestorable,
  readDraft,
  writeDraft,
  type DraftEnvelope,
} from '@/lib/local-draft'

export type SyncState = 'idle' | 'saving' | 'saved' | 'unsynced' | 'failed'

/**
 * One text field that survives a dropped connection.
 *
 * Typing writes to `localStorage` immediately and to the server on blur. If
 * the server call fails, the value stays on screen, stays in local storage,
 * and is reported as unsynced so the person can see it and retry — rather than
 * discovering on the next page load that a paragraph is gone.
 *
 * The local copy is cleared only once the server confirms.
 */
export function useFieldDraft(options: {
  /** Stable per field, e.g. `inspection:<id>:item:<id>:note`. */
  key: string
  /** What the server currently has. */
  serverValue: string
  /** The server row's own updatedAt, so a newer server value wins. */
  serverUpdatedAt: string | null
  save: (value: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const { key, serverValue, serverUpdatedAt, save } = options

  const [value, setValue] = useState(serverValue)
  const [state, setState] = useState<SyncState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const baseServerAt = useRef<string | null>(serverUpdatedAt)

  // Restore once, on mount. Deliberately not in a dependency loop: a draft is
  // offered when the page opens, not re-applied over live typing.
  useEffect(() => {
    const draft = readDraft<string>(key)
    if (draftIsRestorable(draft, serverUpdatedAt) && draft!.value !== serverValue) {
      setValue(draft!.value)
      setState('unsynced')
      setRestored(true)
    } else if (draft?.synced) {
      clearDraft(key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const change = useCallback(
    (next: string) => {
      setValue(next)
      setState(next === serverValue ? 'idle' : 'unsynced')
      const envelope: DraftEnvelope<string> = {
        value: next,
        updatedAt: Date.now(),
        baseServerAt: baseServerAt.current,
        synced: false,
      }
      writeDraft(key, envelope)
    },
    [key, serverValue],
  )

  const flush = useCallback(async () => {
    if (value === serverValue) {
      clearDraft(key)
      setState('idle')
      return
    }

    setState('saving')
    setError(null)
    const result = await save(value)

    if (result.ok) {
      // Only now is it safe to forget the local copy.
      clearDraft(key)
      setState('saved')
      setRestored(false)
    } else {
      setState('failed')
      setError(result.error ?? 'Not saved yet. It is kept on this device.')
    }
  }, [key, save, serverValue, value])

  return { value, change, flush, state, error, restored }
}
