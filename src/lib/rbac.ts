import type { OrgRole, PlatformRole } from '@prisma/client'

/**
 * Permissions are checked on the server, in the action or loader that does the
 * work. Hiding a button is a UX courtesy, never the control.
 */
export const PERMISSIONS = {
  'job:read': ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN'],
  'job:write': ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN'],
  'job:delete': ['OWNER', 'ADMIN'],
  'customer:read': ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN'],
  'customer:write': ['OWNER', 'ADMIN', 'OFFICE'],
  'customer:archive': ['OWNER', 'ADMIN'],
  'door:read': ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN'],
  'door:write': ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN'],
  'estimate:write': ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN'],
  'invoice:write': ['OWNER', 'ADMIN', 'OFFICE'],
  'invoice:void': ['OWNER', 'ADMIN'],
  'payment:record': ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN'],
  'payment:refund': ['OWNER', 'ADMIN'],
  'inventory:read': ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN'],
  'inventory:adjust': ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN'],
  'inventory:transfer': ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN'],
  'pricebook:write': ['OWNER', 'ADMIN'],
  'reports:financial': ['OWNER', 'ADMIN'],
  'team:manage': ['OWNER', 'ADMIN'],
  'settings:manage': ['OWNER', 'ADMIN'],
  'subscription:manage': ['OWNER'],
} as const satisfies Record<string, readonly OrgRole[]>

export type Permission = keyof typeof PERMISSIONS

export function roleCan(role: OrgRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly OrgRole[]).includes(role)
}

export function isPlatformStaff(role: PlatformRole): boolean {
  return role === 'PLATFORM_ADMIN' || role === 'PLATFORM_SUPPORT'
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Not permitted: ${permission}`)
    this.name = 'ForbiddenError'
  }
}
