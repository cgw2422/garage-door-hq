'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePermission, requireActiveSubscription } from '@/lib/session'
import { failure, parseForm, type FormState } from '@/lib/form'
import { clientAddress, enforceRateLimit } from '@/lib/rate-limit'
import {
  acceptInvitation,
  inviteMember,
  resendInvitation,
  revokeInvitation,
  updateMember,
} from '@/server/team/service'
import { signIn } from '@/lib/auth'

const ROLES = ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN'] as const

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email address').max(160),
  role: z.enum(ROLES),
  defaultLocationId: z.string().uuid().optional(),
})

/**
 * Email delivery is not configured, so the invite link is returned to the
 * admin who created it. That is a deliberate, visible state — not a silent
 * failure and not a fake "sent" message.
 */
export async function inviteMemberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveSubscription('team:manage')
  const parsed = parseForm(inviteSchema, formData)
  if (!parsed.ok) return parsed.state

  try {
    await enforceRateLimit('invite', `org:${session.organizationId}`)
    const result = await inviteMember(session, parsed.data)
    revalidatePath('/settings/team')
    return { values: { inviteUrl: result.acceptUrl, invitedEmail: parsed.data.email } }
  } catch (error) {
    return failure(error, formData)
  }
}

export async function resendInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveSubscription('team:manage')
  const invitationId = String(formData.get('invitationId') ?? '')
  const email = String(formData.get('email') ?? '')

  try {
    await enforceRateLimit('invite', `org:${session.organizationId}`)
    const result = await resendInvitation(session, invitationId)
    revalidatePath('/settings/team')
    return { values: { inviteUrl: result.acceptUrl, invitedEmail: email } }
  } catch (error) {
    return failure(error, formData)
  }
}

export async function revokeInvitationAction(formData: FormData) {
  const session = await requirePermission('team:manage')
  await revokeInvitation(session, String(formData.get('invitationId') ?? ''))
  revalidatePath('/settings/team')
}

const updateSchema = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(ROLES).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  defaultLocationId: z.string().uuid().nullable().optional(),
})

export async function updateMemberAction(
  input: z.infer<typeof updateSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requirePermission('team:manage')
  const parsed = updateSchema.parse(input)

  try {
    await updateMember(session, {
      membershipId: parsed.membershipId,
      role: parsed.role,
      isActive: parsed.isActive === undefined ? undefined : parsed.isActive === 'true',
      defaultLocationId: parsed.defaultLocationId,
    })
  } catch (error) {
    return { ok: false, error: failure(error).error ?? 'Could not update that team member.' }
  }

  revalidatePath('/settings/team')
  return { ok: true }
}

const acceptSchema = z.object({
  token: z.string().min(20).max(200),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  password: z.string().max(200).optional(),
})

export async function acceptInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseForm(acceptSchema, formData)
  if (!parsed.ok) return parsed.state

  // Unauthenticated endpoint keyed by a secret: limit guessing.
  const address = await clientAddress()
  try {
    await enforceRateLimit('portalToken', `invite:${address}`)
  } catch (error) {
    return failure(error, formData)
  }

  let email: string
  try {
    const result = await acceptInvitation(parsed.data)
    email = result.email
  } catch (error) {
    return failure(error, formData)
  }

  // A brand-new user just chose their password, so sign them straight in
  // rather than bouncing them to a login screen they have no history with.
  if (parsed.data.password) {
    await signIn('credentials', {
      email,
      password: parsed.data.password,
      redirectTo: '/today',
    })
  }

  return { values: { accepted: 'yes', email } }
}
