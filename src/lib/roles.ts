import type { OrgRole } from '@prisma/client'

/**
 * Role labels, in a module with no server imports.
 *
 * The team screen is a client component; importing these from the service
 * would drag Prisma and node:crypto into the browser bundle.
 */
export const ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  OFFICE: 'Office',
  TECHNICIAN: 'Technician',
}

export const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  OWNER: 'Everything, including billing and the price book.',
  ADMIN: 'Everything except billing.',
  OFFICE: 'Scheduling, customers, estimates and invoices. No price book or team changes.',
  TECHNICIAN: 'Their jobs, inspections, estimates and truck inventory.',
}

export const ASSIGNABLE_ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN']
