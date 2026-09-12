'use client'

/**
 * A local safety net for work typed in the field.
 *
 * A technician standing in a garage on one bar of signal will lose a request
 * now and then. Losing a status tap is annoying; losing a paragraph of notes
 * about a cracked drum they are looking at right now is the kind of thing that
 * makes somebody stop trusting the product.
 *
 * So: everything typed is written to `localStorage` as it changes, restored on
 * the next load, and cleared **only once the server has confirmed it**.
 *
 * Scope, deliberately: this is a draft buffer, not offline sync. There is no
 * queue of pending mutations and no conflict-resolution engine. What it
 * guarantees is that nothing a person typed disappears silently, and that a
 * local draft never overwrites a server value that changed more recently.
 */

export interface DraftEnvelope<T> {
  /** What was typed. */
  value: T
  /** When it was last changed locally. */
  updatedAt: number
  /** The server's own `updatedAt` when this draft started, as an ISO string. */
  baseServerAt: string | null
  /** Whether this has been confirmed saved by the server. */
  synced: boolean
}

const PREFIX = 'gdhq.draft.'

function storage(): Storage | null {
  try {
    // Private mode, blocked site data and some embedded webviews all throw
    // here rather than returning null, so this has to be a try.
    return window.localStorage
  } catch {
    return null
  }
}

export function readDraft<T>(key: string): DraftEnvelope<T> | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DraftEnvelope<T>
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed
  } catch {
    // Corrupt or from an older shape. Drop it rather than crash the screen a
    // technician is standing in front of.
    return null
  }
}

export function writeDraft<T>(key: string, envelope: DraftEnvelope<T>): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(PREFIX + key, JSON.stringify(envelope))
  } catch {
    // Quota exceeded. Nothing useful to do, and it must not break typing.
  }
}

export function clearDraft(key: string): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(PREFIX + key)
  } catch {
    /* nothing to do */
  }
}

/**
 * Decide whether a stored draft should be offered.
 *
 * A draft is only worth restoring when it is unsynced **and** the server has
 * not moved on since it was taken. If somebody else edited the same inspection
 * from the office in the meantime, the server wins and the local copy is
 * dropped — silently overwriting their change with a stale local one is the
 * failure mode this check exists to prevent.
 */
export function draftIsRestorable<T>(
  draft: DraftEnvelope<T> | null,
  serverUpdatedAt: string | null,
): boolean {
  if (!draft) return false
  if (draft.synced) return false
  if (!draft.baseServerAt || !serverUpdatedAt) return true
  return new Date(serverUpdatedAt).getTime() <= new Date(draft.baseServerAt).getTime()
}

/** Every draft key for one inspection, so finishing can clear them together. */
export function clearDraftsWithPrefix(prefix: string): void {
  const store = storage()
  if (!store) return
  try {
    const keys: string[] = []
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i)
      if (key && key.startsWith(PREFIX + prefix)) keys.push(key)
    }
    for (const key of keys) store.removeItem(key)
  } catch {
    /* nothing to do */
  }
}
