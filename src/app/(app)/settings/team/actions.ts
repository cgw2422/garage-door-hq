'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePermission, requireActiveSubscription } from '@/lib/session'
import { failure, parseForm, type FormState, guarded } from '@/lib/form'
import { clientAddress, enforceRateLimit } from '@/lib/rate-limit'
import {
  acceptInvitation,
  inviteMember,
  resendInvitation,
  revokeInvitation,
  updateMember,
} from '@/server/team/service'
import { signIn } from '@/lib/auth'
import { sendInvitationEmail } from '@/server/communications/dispatch'
import { authSecretConfigured } from '@/lib/readiness'

const ROLES = ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN'] as const

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email address').max(160),
  role: z.enum(ROLES),
  defaultLocationId: z.string().uuid().optional(),
})

/**
 * Invite someone, and email them.
 *
 * The invitation exists whether or not the email goes out — that is the point
 * of creating it first. A delivery failure is reported next to the link, which
 * is always shown as a fallback, so an admin can send it by hand and nobody is
 * told a message arrived that did not.
 */
export async function inviteMemberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const gate = await guarded(() => requireActiveSubscription('team:manage'), formData)
  if (!gate.ok) return gate.state
  const session = gate.value
  const parsed = parseForm(inviteSchema, formData)
  if (!parsed.ok) return parsed.state

  let invitation: { invitationId: string; acceptUrl: string }
  try {
    await enforceRateLimit('invite', `org:${session.organizationId}`)
    invitation = await inviteMember(session, parsed.data)
  } catch (error) {
    return failure(error, formData)
  }

  const delivery = await sendInvitationEmail({
    organizationId: session.organizationId,
    invitationId: invitation.invitationId,
    inviteUrl: invitation.acceptUrl,
  })

  revalidatePath('/settings/team')
  return {
    values: {
      inviteUrl: invitation.acceptUrl,
      invitedEmail: parsed.data.email,
      delivery: delivery.ok ? 'sent' : 'failed',
      deliveryError: delivery.error ?? '',
    },
  }
}

export async function resendInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const gate = await guarded(() => requireActiveSubscription('team:manage'), formData)
  if (!gate.ok) return gate.state
  const session = gate.value
  const invitationId = String(formData.get('invitationId') ?? '')
  const email = String(formData.get('email') ?? '')

  try {
    await enforceRateLimit('invite', `org:${session.organizationId}`)
    const result = await resendInvitation(session, invitationId)

    // Re-sending mints a new token and revokes the old one, so this is a new
    // message rather than a retry of the previous one.
    const delivery = await sendInvitationEmail({
      organizationId: session.organizationId,
      invitationId: result.invitationId,
      inviteUrl: result.acceptUrl,
    })

    revalidatePath('/settings/team')
    return {
      values: {
        inviteUrl: result.acceptUrl,
        invitedEmail: email,
        delivery: delivery.ok ? 'sent' : 'failed',
        deliveryError: delivery.error ?? '',
      },
    }
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
  if (parsed.data.password && authSecretConfigured()) {
    await signIn('credentials', {
      email,
      password: parsed.data.password,
      redirectTo: '/today',
    })
  }

  return { values: { accepted: 'yes', email } }
}
