import type { AppSession } from '@/lib/session'

/**
 * The setup checklist.
 *
 * Deliberately **computed from real state**, not stored as a list of ticked
 * boxes. A stored checklist drifts: somebody deletes their logo and the box
 * stays ticked, or a migration adds a step and every existing account looks
 * finished. Reading the actual data means the list is always telling the truth.
 *
 * It never blocks anything. Onboarding proper is three screens and ends with a
 * usable account; this is what is left, visible from Today, dismissable, and
 * with nothing behind a gate.
 */

export interface ChecklistStep {
  key: string
  label: string
  detail: string
  href: string
  done: boolean
  /** Steps that genuinely matter before quoting real work. */
  important: boolean
}

export interface SetupChecklist {
  steps: ChecklistStep[]
  completed: number
  total: number
  /** True once every step is done, or the owner dismissed it. */
  finished: boolean
  dismissed: boolean
}

export async function loadSetupChecklist(session: AppSession): Promise<SetupChecklist> {
  const [organization, priceEdits, stocked, customers, paymentAccount, members] =
    await Promise.all([
      session.db.organization.findUniqueOrThrow({
        where: { id: session.organizationId },
        select: {
          logoStorageKey: true,
          logoUrl: true,
          phone: true,
          addressLine1: true,
          defaultTaxRateBps: true,
          setupChecklistDoneAt: true,
        },
      }),
      // "Prices reviewed" is answered from the audit trail, because comparing
      // against the starter numbers would be guesswork — a company may
      // legitimately charge exactly what the starter catalog suggests.
      session.db.auditLog.count({
        where: {
          action: {
            in: ['pricebook.item_updated', 'pricebook.item_created', 'pricebook.package_created'],
          },
        },
      }),
      session.db.stockLevel.count({ where: { quantity: { gt: 0 } } }),
      session.db.customer.count({ where: { archivedAt: null } }),
      session.db.paymentAccount.findUnique({
        where: { organizationId: session.organizationId },
        select: { chargesEnabled: true, disconnectedAt: true },
      }),
      session.db.membership.count({ where: { isActive: true } }),
    ])

  const steps: ChecklistStep[] = [
    {
      key: 'company',
      label: 'Add your phone number and address',
      detail: 'They appear on every estimate and invoice your customers see.',
      href: '/settings',
      done: Boolean(organization.phone && organization.addressLine1),
      important: true,
    },
    {
      key: 'prices',
      label: 'Set your own prices',
      detail: 'The starter catalog is examples, not your numbers.',
      href: '/settings/price-book',
      done: priceEdits > 0,
      important: true,
    },
    {
      key: 'tax',
      label: 'Set your tax rate',
      detail: 'So every estimate totals correctly from the first one.',
      href: '/settings',
      done: organization.defaultTaxRateBps > 0,
      important: true,
    },
    {
      key: 'logo',
      label: 'Add your logo',
      detail: 'It goes on your PDFs and the emails your customers get.',
      href: '/settings',
      done: Boolean(organization.logoStorageKey || organization.logoUrl),
      important: false,
    },
    {
      key: 'inventory',
      label: 'Stock your truck',
      detail: 'So parts come off the right truck when you finish a job.',
      href: '/inventory',
      done: stocked > 0,
      important: false,
    },
    {
      key: 'payments',
      label: 'Connect payments',
      detail: 'Let customers pay an invoice by card. Money goes straight to you.',
      href: '/settings/payments',
      done: Boolean(paymentAccount?.chargesEnabled && !paymentAccount.disconnectedAt),
      important: false,
    },
    {
      key: 'customer',
      label: 'Add your first customer',
      detail: 'Or just start a job — it will walk you through it.',
      href: '/customers/new',
      done: customers > 0,
      important: false,
    },
  ]

  // A solo operator is not nagged about a team they do not have.
  if (!session.isSoloOperator || members > 1) {
    steps.splice(5, 0, {
      key: 'team',
      label: 'Invite your team',
      detail: 'Everyone is included — there is no per-user fee.',
      href: '/settings/team',
      done: members > 1,
      important: false,
    })
  }

  const completed = steps.filter((step) => step.done).length

  return {
    steps,
    completed,
    total: steps.length,
    finished: completed === steps.length,
    dismissed: organization.setupChecklistDoneAt !== null,
  }
}
