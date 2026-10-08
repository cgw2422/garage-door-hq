import { describe, expect, it } from 'vitest'
import {
  FOUNDER,
  TESTIMONIALS,
  USAGE,
  founderInitials,
  hasFounder,
  usageLabel,
} from '@/lib/social-proof'

/**
 * Social proof has to stay checkable.
 *
 * The risk with a testimonial rail is not that it stays empty. It is that
 * somebody fills it in a hurry with "Great software! — a happy customer", and
 * the one page a sceptical trade buyer reads closely becomes the page that
 * tells them this site is like all the others.
 *
 * So these are not tests of the current content, which is empty. They are the
 * conditions anything added later has to meet: a quote carries a name, a
 * company and a town; a usage number carries the date it was true; the
 * founder is a whole person or absent.
 */

describe('testimonials', () => {
  it('are attributed to a named person at a named company in a named town', () => {
    for (const item of TESTIMONIALS) {
      expect(item.name.trim(), `quote "${item.quote}" has no name`).not.toBe('')
      expect(item.company.trim(), `${item.name} has no company`).not.toBe('')
      expect(item.location.trim(), `${item.name} has no town`).not.toBe('')
    }
  })

  it('say something that happened rather than something nice', () => {
    // A quote with no specifics is filler, and reads as solicited. The audit's
    // own example — "Found the spring spec for a door I did two years ago in
    // ten seconds" — has a number and an outcome in it. This is a floor, not a
    // substitute for judgement: it catches the obvious one-liners.
    const EMPTY_PRAISE = [
      /^great (software|product|app)[.!]?$/i,
      /^highly recommend[.!]?$/i,
      /^love it[.!]?$/i,
      /^best .{0,24}(software|app) (ever|out there)[.!]?$/i,
    ]

    for (const item of TESTIMONIALS) {
      const quote = item.quote.trim()
      expect(quote.length, `${item.name}'s quote is too short to say anything`).toBeGreaterThan(24)
      for (const pattern of EMPTY_PRAISE) {
        expect(pattern.test(quote), `${item.name}'s quote is generic praise`).toBe(false)
      }
    }
  })

  it('never attribute a quote to an anonymous customer', () => {
    const ANONYMOUS = /^(a |an )?(happy |satisfied )?(customer|user|client|owner|operator)$/i
    for (const item of TESTIMONIALS) {
      expect(ANONYMOUS.test(item.name.trim()), `"${item.name}" is not a name`).toBe(false)
    }
  })

  it('lays out for three, so a longer list is a deliberate choice', () => {
    expect(TESTIMONIALS.length).toBeLessThanOrEqual(3)
  })
})

describe('the usage counter', () => {
  it('is a real count with the date it was true, or absent', () => {
    if (!USAGE) return

    expect(USAGE.value).toBeGreaterThan(0)
    expect(Number.isInteger(USAGE.value)).toBe(true)
    expect(USAGE.noun.trim()).not.toBe('')

    // A number with no date is a claim; a number with a date is a
    // measurement, and this site's voice is measurements.
    expect(USAGE.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const asOf = new Date(`${USAGE.asOf}T00:00:00Z`)
    expect(Number.isNaN(asOf.getTime())).toBe(false)
    expect(asOf.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('does not round a small number up into a claim', () => {
    if (!USAGE) return
    // "100+" and "thousands of" are the shapes a true small number turns into
    // when somebody wants it to look bigger. The noun is a noun.
    expect(USAGE.noun).not.toMatch(/\+|thousand|hundred|million|over |more than /i)
  })

  it('renders the number and the noun together', () => {
    expect(usageLabel({ value: 1241, noun: 'doors documented', asOf: '2026-10-08' })).toBe(
      '1,241 doors documented',
    )
  })
})

describe('the founder block', () => {
  it('is a whole person or nothing', () => {
    // Half a founder — a name with no reason, or a reason with no name — is
    // worse than the page not having the section.
    if (FOUNDER.name.trim() === '') {
      expect(hasFounder()).toBe(false)
      return
    }
    expect(FOUNDER.story.length).toBeGreaterThan(0)
    expect(FOUNDER.role.trim()).not.toBe('')
  })

  it('speaks in the first person when it speaks at all', () => {
    // The site already has this voice. A founder note written in the third
    // person reads as a press release, which is the opposite of the point.
    if (!hasFounder()) return
    const story = FOUNDER.story.join(' ')
    expect(/\b(I|my|me)\b/.test(story), 'the founder story is not in first person').toBe(true)
  })

  it('points a photo at a real file path rather than a remote stock image', () => {
    if (!FOUNDER.photo) return
    expect(FOUNDER.photo.startsWith('/'), 'the founder photo must be a local asset').toBe(true)
  })

  it('takes initials from the name when there is no photograph', () => {
    expect(founderInitials()).toBe(
      FOUNDER.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join(''),
    )
  })
})
