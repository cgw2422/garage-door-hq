/**
 * Who is behind this, who uses it, and what they said.
 *
 * One file, because the three things an audit calls "social proof" — a named
 * founder, customer quotes, a usage number — are the three things most likely
 * to be quietly faked, and keeping them together makes it obvious when one of
 * them is empty.
 *
 * ## The rule this file enforces
 *
 * **Every surface here renders only when its content is real.** An empty
 * `TESTIMONIALS` array means the homepage has no testimonial section at all,
 * rather than a section with a placeholder in it. `USAGE` set to `null` means
 * no counter appears, rather than a hopeful number. Nothing degrades into a
 * stock photo, a "trusted by thousands", or a quote attributed to "a happy
 * customer".
 *
 * That is not squeamishness. The site's own security page says it will not
 * claim to be unhackable, and the FAQ answers the questions where the honest
 * answer has a limit in it. A fabricated testimonial two scrolls above that
 * would make a liar of all of it, to exactly the kind of buyer — a trade
 * operator who has been sold to before — who is looking for the seam.
 *
 * `tests/social-proof.test.ts` holds the line: anything present here has to
 * carry the attribution that makes it checkable.
 */

// ---------------------------------------------------------------------------
// The founder
// ---------------------------------------------------------------------------

export interface Founder {
  /** Full name, as it should appear in print. */
  name: string
  /** What they do here, in their own words rather than a title. */
  role: string
  /**
   * Why this exists, first person. Short. The site already speaks in this
   * voice — "built for the guy in the truck", "mail reaches somebody who can
   * actually change the product" — and this is the paragraph that names who
   * has been saying it.
   */
  story: readonly string[]
  /**
   * Path to a real photograph under `public/`. A stock portrait is worse than
   * no portrait: it is the one element on the page a reader can check against
   * a reverse image search.
   */
  photo: string | null
  /** Width and height of that photo, for layout stability. */
  photoSize?: { width: number; height: number }
  /** LinkedIn, a personal site — somewhere the name resolves to a person. */
  profileUrl: string | null
  /** Where the profile points, for the link text. "LinkedIn", "my site". */
  profileLabel: string | null
}

/**
 * Fill `name` and `story` and the About page starts showing the founder card.
 * `photo` and `profileUrl` improve it and are not required for it to render —
 * the card falls back to initials, which are derived from a real name rather
 * than invented.
 */
export const FOUNDER: Founder = {
  name: '',
  role: '',
  story: [],
  photo: null,
  profileUrl: null,
  profileLabel: null,
}

/** True once there is enough of a person here to put on a page. */
export function hasFounder(): boolean {
  return FOUNDER.name.trim().length > 0 && FOUNDER.story.length > 0
}

/** "Cody Wilson" becomes "CW". Used when there is a name but no photograph. */
export function founderInitials(): string {
  return FOUNDER.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface Testimonial {
  /**
   * One line, in their words. It has to contain a specific outcome — a thing
   * that happened, with a number or a time on it — or it is filler. "Great
   * software, highly recommend" proves nothing and reads as solicited.
   */
  quote: string
  /** First name at least. A quote from nobody is not a quote. */
  name: string
  /** The company. This is what makes it checkable. */
  company: string
  /** Town and state. Trade buyers place each other geographically. */
  location: string
  /** Optional headshot or company photo under `public/`. */
  photo: string | null
}

/**
 * Three is the number the homepage lays out for. Fewer renders fine; more than
 * three and the section starts to look like a wall, which is the thing the
 * audit noted competitors do and this site does not need to copy.
 *
 * Collect these by asking. The ones worth printing sound like the person who
 * said them and name something that actually happened on a job.
 */
export const TESTIMONIALS: readonly Testimonial[] = []

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export interface UsageCounter {
  /** The number itself. Must be a count somebody could verify. */
  value: number
  /**
   * What was counted, plural, lower case: "garage door companies",
   * "doors documented". Rendered after the number.
   */
  noun: string
  /** When it was last checked, ISO date. Shown, so the number has a date on it. */
  asOf: string
}

/**
 * The honest counter, or nothing.
 *
 * A small true number beats silence, and silence beats a number that needs a
 * footnote. If the company count is still tiny, count something else that is
 * genuinely large — doors documented, jobs completed — and say which.
 *
 * Demo and seeded data do not count. Neither does the operator's own account.
 */
export const USAGE: UsageCounter | null = null

/** "41 garage door companies" — the counter as one string. */
export function usageLabel(usage: UsageCounter): string {
  return `${usage.value.toLocaleString('en-US')} ${usage.noun}`
}
