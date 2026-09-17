import { environment, environmentLabel } from '@/lib/environment'

/**
 * A stripe along the top that says which app this is.
 *
 * The failure it prevents is mundane and expensive: testing a destructive
 * change on what turns out to be production, on a phone, in a driveway,
 * because two tabs look identical. It is deliberately not dismissable and
 * deliberately not subtle — amber is the one colour nothing else in this
 * product uses for chrome — but it is thin, sits above everything and pushes
 * nothing around.
 *
 * It renders nothing at all on production. That is the point: the badge is
 * only worth reading because its absence also means something.
 *
 * `declared: false` earns stronger wording, because an environment nobody
 * declared is one whose safeguards were guessed rather than configured.
 */
export function EnvironmentBanner() {
  const env = environment()
  if (!env.showsEnvironmentBanner) return null

  return (
    <div
      role="status"
      aria-label={`${environmentLabel()} environment`}
      // Nothing here is clickable, and a status stripe that swallows taps
      // meant for the header under it is worse than no stripe at all.
      className="safe-top pointer-events-none sticky top-0 z-50 flex items-center justify-center gap-2 bg-[#7A4B00] px-3 py-1 text-center text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-[#FFD98A]"
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full bg-[#F0B429]"
      />
      {environmentLabel()}
      {env.declared ? null : <span className="normal-case tracking-normal">· APP_ENV not set</span>}
    </div>
  )
}
