'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { OrgRole } from '@prisma/client'
import { cn } from '@/lib/cn'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/roles'
import type { FormState } from '@/lib/form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, Divider, SectionHeading } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { Chip } from '@/components/ui/status'
import { PlusIcon } from '@/components/ui/icons'
import {
  inviteMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
  updateMemberAction,
} from './actions'
import { formatDate } from '@/server/jobs/queries'

const ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'OFFICE', 'TECHNICIAN']

interface Member {
  id: string
  userId: string
  name: string
  email: string
  role: OrgRole
  isActive: boolean
  defaultLocationId: string | null
  defaultLocationName: string | null
  lastLoginAt: string | null
}

interface Invitation {
  id: string
  email: string
  role: OrgRole
  expiresAt: string
  sendCount: number
  locationName: string | null
}

export function TeamManager({
  currentUserId,
  currentRole,
  members,
  invitations,
  locations,
  timezone,
  emailConfigured,
  organizationName,
}: {
  currentUserId: string
  currentRole: OrgRole
  members: Member[]
  invitations: Invitation[]
  locations: Array<{ id: string; name: string }>
  /**
   * The company's timezone. Dates are formatted against it explicitly rather
   * than with toLocaleDateString(), which resolves differently on the server
   * and in the browser and makes React discard the server-rendered markup.
   */
  timezone: string
  /** False when no email provider is configured; the UI then never claims a send. */
  emailConfigured: boolean
  organizationName: string
}) {
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteState, invite] = useActionState<FormState, FormData>(inviteMemberAction, {})
  const [resendState, resend] = useActionState<FormState, FormData>(resendInvitationAction, {})

  const latest = inviteState.values?.inviteUrl ? inviteState.values : resendState.values
  const issuedLink = latest?.inviteUrl
  const issuedTo = latest?.invitedEmail
  const delivered = latest?.delivery === 'sent'
  const deliveryError = latest?.deliveryError

  return (
    <>
      {!emailConfigured ? (
        <Alert tone="warning" title="Email delivery is not connected">
          Invitations are created and valid immediately, but nothing will be emailed from this
          deployment. Copy the link and send it yourself.
        </Alert>
      ) : null}

      {issuedLink ? (
        <Card
          className={delivered ? 'border-success-200 bg-success-50' : 'border-warning-200 bg-warning-50'}
        >
          <CardHeader
            title={
              delivered
                ? `Invitation emailed to ${issuedTo ?? 'your teammate'}`
                : `Invitation created for ${issuedTo ?? 'your teammate'}`
            }
          />

          {delivered ? (
            <p className="text-sm leading-relaxed text-success-700">
              They&apos;ll get an email from {organizationName} with a link to join. Here it is
              too, in case you&apos;d rather text it to them.
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-warning-700">
              {deliveryError || 'The email could not be sent.'} The invitation itself is fine —
              send them this link and it will work.
            </p>
          )}

          <p className="mt-2.5 break-all rounded-[--radius-control] border border-hairline bg-white px-3 py-2.5 text-xs text-ink">
            {issuedLink}
          </p>
          <CopyButton value={issuedLink} />
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            Anyone with this link can join your company with the role you chose. It expires in
            14 days, and re-sending replaces it.
          </p>
        </Card>
      ) : null}

      {inviteOpen ? (
        <Card>
          <CardHeader title="Invite someone" />
          <form action={invite} className="space-y-4">
            <Field label="Email" error={inviteState.fieldErrors?.email}>
              <Input
                name="email"
                type="email"
                inputMode="email"
                required
                autoFocus
                placeholder="tech@yourcompany.com"
              />
            </Field>

            <Field label="Role">
              <Select name="role" defaultValue="TECHNICIAN">
                {ROLES.filter((role) => role !== 'OWNER' || currentRole === 'OWNER').map(
                  (role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]} — {ROLE_DESCRIPTIONS[role]}
                    </option>
                  ),
                )}
              </Select>
            </Field>

            {locations.length > 0 ? (
              <Field label="Truck" hint="Where their parts come from.">
                <Select name="defaultLocationId" defaultValue="">
                  <option value="">Decide later</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {inviteState.error ? <Alert>{inviteState.error}</Alert> : null}

            <div className="flex gap-2.5">
              <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <SubmitButton fullWidth pendingLabel="Creating…">
                Create invitation
              </SubmitButton>
            </div>
          </form>
        </Card>
      ) : (
        <Button size="lg" fullWidth icon={<PlusIcon />} onClick={() => setInviteOpen(true)}>
          Invite a team member
        </Button>
      )}

      {invitations.length > 0 ? (
        <div>
          <SectionHeading>Pending Invitations</SectionHeading>
          <Card padded={false}>
            {invitations.map((invitation, index) => (
              <div key={invitation.id}>
                {index > 0 ? <Divider className="ml-4" /> : null}
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[0.9375rem] font-semibold text-ink">
                        {invitation.email}
                      </p>
                      <p className="text-sm text-ink-muted">
                        {ROLE_LABELS[invitation.role]}
                        {invitation.locationName ? ` · ${invitation.locationName}` : ''}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        Expires {formatDate(new Date(invitation.expiresAt), timezone)}
                        {invitation.sendCount > 1 ? ` · issued ${invitation.sendCount}×` : ''}
                      </p>
                    </div>
                    <Chip tone="warning">Pending</Chip>
                  </div>

                  <div className="mt-2.5 flex gap-2">
                    <form action={resend}>
                      <input type="hidden" name="invitationId" value={invitation.id} />
                      <input type="hidden" name="email" value={invitation.email} />
                      <SubmitButton variant="secondary" size="sm" pendingLabel="Re-issuing…">
                        Get a new link
                      </SubmitButton>
                    </form>
                    <form action={revokeInvitationAction}>
                      <input type="hidden" name="invitationId" value={invitation.id} />
                      <SubmitButton
                        variant="ghost"
                        size="sm"
                        className="text-danger-600"
                        pendingLabel="Cancelling…"
                      >
                        Cancel
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      ) : null}

      <div>
        <SectionHeading>Team</SectionHeading>
        <div className="space-y-3">
          {members.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              locations={locations}
              isSelf={member.userId === currentUserId}
              currentRole={currentRole}
              timezone={timezone}
            />
          ))}
        </div>
      </div>
    </>
  )
}

function MemberCard({
  member,
  locations,
  isSelf,
  currentRole,
  timezone,
}: {
  member: Member
  locations: Array<{ id: string; name: string }>
  isSelf: boolean
  currentRole: OrgRole
  timezone: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // The server enforces all of this; the UI just avoids offering what will fail.
  const canEditRole = !isSelf && (member.role !== 'OWNER' || currentRole === 'OWNER')
  const canDeactivate = !isSelf && (member.role !== 'OWNER' || currentRole === 'OWNER')

  function update(changes: Parameters<typeof updateMemberAction>[0]) {
    setError(null)
    startTransition(async () => {
      const result = await updateMemberAction(changes)
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <Card className={cn(!member.isActive && 'opacity-70')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[0.9375rem] font-semibold text-ink">
            {member.name}
            {isSelf ? <span className="ml-1.5 text-sm font-normal text-ink-subtle">(you)</span> : null}
          </p>
          <p className="truncate text-sm text-ink-muted">{member.email}</p>
          <p className="text-xs text-ink-subtle">
            {member.lastLoginAt
              ? `Last signed in ${formatDate(new Date(member.lastLoginAt), timezone)}`
              : 'Has not signed in yet'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Chip tone={member.role === 'OWNER' ? 'brand' : 'neutral'}>
            {ROLE_LABELS[member.role]}
          </Chip>
          {!member.isActive ? <Chip tone="danger">Deactivated</Chip> : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Role">
          <Select
            aria-label={`Role for ${member.name}`}
            value={member.role}
            disabled={!canEditRole || pending}
            onChange={(event) =>
              update({ membershipId: member.id, role: event.target.value as OrgRole })
            }
          >
            {ROLES.filter((role) => role !== 'OWNER' || currentRole === 'OWNER').map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Truck">
          <Select
            aria-label={`Truck for ${member.name}`}
            value={member.defaultLocationId ?? ''}
            disabled={pending}
            onChange={(event) =>
              update({
                membershipId: member.id,
                defaultLocationId: event.target.value || null,
              })
            }
          >
            <option value="">None</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error ? <Alert className="mt-2">{error}</Alert> : null}

      {canDeactivate ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          fullWidth
          disabled={pending}
          className={cn('mt-3', member.isActive && 'text-danger-600')}
          onClick={() =>
            update({ membershipId: member.id, isActive: member.isActive ? 'false' : 'true' })
          }
        >
          {member.isActive ? 'Deactivate' : 'Reactivate'}
        </Button>
      ) : null}
    </Card>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="secondary"
      fullWidth
      className="mt-2"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch {
          setCopied(false)
        }
      }}
    >
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  )
}
