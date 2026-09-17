'use client'

import { ExitControl } from './presentation'

/**
 * The presentation is over but the cookie is still here.
 *
 * Happens when it times out in a pocket, when the technician ended it on
 * another device, or when something cleared the cookie while the lock on the
 * account was still live. Neither is an error and none of it is anything a
 * customer needs to read, so this says the minimum.
 *
 * Getting back to the app still takes the technician's password. The cookie
 * being absent is not evidence of anything — a device in the wrong hands with
 * a cleared cookie must not be an easier device to get into than one without.
 */
export function EndedPresentation() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-12 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-ink">This presentation has ended</h1>
        <p className="text-base leading-relaxed text-ink-muted">
          Please hand the device back to your technician.
        </p>
      </div>

      <ExitControl label="Technician: return to Garage Door HQ" recover />
    </div>
  )
}
