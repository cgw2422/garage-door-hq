import type { EstimateKind, EstimatePresentation, EstimateTier } from '@prisma/client'

/**
 * How an estimate's options are shown to the customer.
 *
 * The product does not have an opinion about how a garage door company sells.
 * Some quote one price. Some give two sensible choices. Some run
 * Good/Better/Best on everything. All three are legitimate, and the software's
 * job is to present whatever the technician built without inventing anything
 * to fill a layout.
 *
 * So the shape follows the work: one option reads as a recommendation, two as
 * a choice between them, three or more as a list — and the Good/Better/Best
 * labels appear only when a company has deliberately asked for them. A lone
 * option never gets labelled "Good", because there is nothing for it to be
 * better than.
 */
export type OptionLayout =
  /** One option. The customer is approving a recommendation, not choosing. */
  | 'single'
  /** Two or more options, compared on their own names and prices. */
  | 'choices'
  /** Explicitly sold as Good / Better / Best. */
  | 'tiered'

export interface PresentableOption {
  id: string
  name: string
  description: string | null
  tier: EstimateTier | null
  isRecommended: boolean
  totalCents: number
}

/**
 * Tiered presentation is a claim about how the company sells, so it is asked
 * for rather than guessed — but it still needs the tiers to exist. An estimate
 * marked GOOD_BETTER_BEST whose options lost their labels falls back to a
 * plain comparison rather than rendering blank headings.
 */
export function layoutFor(
  options: Pick<PresentableOption, 'tier'>[],
  presentation: EstimatePresentation,
): OptionLayout {
  if (options.length <= 1) return 'single'
  if (presentation === 'GOOD_BETTER_BEST' && options.every((option) => option.tier !== null)) {
    return 'tiered'
  }
  return 'choices'
}

export const TIER_LABELS: Record<EstimateTier, string> = {
  GOOD: 'Good',
  BETTER: 'Better',
  BEST: 'Best',
  STANDARD: 'Recommended',
}

export const TIER_ORDER: Record<EstimateTier, number> = {
  GOOD: 0,
  BETTER: 1,
  BEST: 2,
  STANDARD: 3,
}

/**
 * The heading above the options, in the customer's terms.
 *
 * One option is a recommendation to approve. Several are a decision to make,
 * and saying so is what stops a customer scrolling past the second one.
 */
export function optionsHeading(layout: OptionLayout, count: number): string {
  if (layout === 'single') return 'Recommended repair'
  if (layout === 'tiered') return 'Choose your option'
  return count === 2 ? 'Choose one of two options' : `Choose one of ${count} options`
}

/**
 * The badge on an option, if it has earned one.
 *
 * Only ever one per option, and only when it says something: the tier when
 * the company sells that way, otherwise the recommendation. Both are optional
 * and neither is ever required.
 */
export function badgeFor(
  option: PresentableOption,
  layout: OptionLayout,
): { text: string; tone: 'tier' | 'recommended' } | null {
  if (layout === 'tiered' && option.tier) {
    return { text: TIER_LABELS[option.tier], tone: 'tier' }
  }
  if (option.isRecommended && layout !== 'single') {
    return { text: 'Recommended', tone: 'recommended' }
  }
  return null
}

/**
 * Which channel leads on the estimate screen.
 *
 * A repair is sold standing in the driveway: the technician and the homeowner
 * are already together, and making the homeowner find their phone, wait for a
 * text and open a link on a second screen is a worse version of a conversation
 * that is already happening.
 *
 * A new door is a bigger decision. People want to show a spouse, compare
 * bids, look at colours again. Sending it is the honest default there — but
 * in-person stays available, because some customers are ready to buy while
 * the salesperson is standing there.
 */
export function primaryChannel(kind: EstimateKind): 'present' | 'send' {
  return kind === 'INSTALLATION' ? 'send' : 'present'
}

/** Job types that produce an installation proposal rather than a repair quote. */
const INSTALLATION_JOB_SLUGS = new Set(['door-installation', 'opener-installation'])

export function estimateKindForJobType(slug: string | null | undefined): EstimateKind {
  return slug && INSTALLATION_JOB_SLUGS.has(slug) ? 'INSTALLATION' : 'REPAIR'
}

/**
 * The option a recommendation belongs in.
 *
 * Its name, because that is what the customer reads and what makes two taps
 * of the same recommendation land in the same place. The inspection's
 * "already on the estimate" state is keyed on this too, so the estimate and
 * the checklist cannot disagree about what counts as the same option.
 */
export function optionNameFor(remedy: { name: string; package?: { name: string } | null }): string {
  return remedy.package?.name ?? remedy.name
}

/**
 * How the checklist and the estimate agree on what is already quoted.
 *
 * Keyed by the option as well as by the service, because options are
 * alternatives the customer chooses between: a roller swap inside a spring
 * package is not the same offer as a roller swap on its own.
 */
export function quotedKey(optionName: string, priceBookItemId: string): string {
  return `${optionName}:${priceBookItemId}`
}
