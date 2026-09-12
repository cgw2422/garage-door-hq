import type { Metadata } from 'next'
import { requirePermission } from '@/lib/session'
import { listInvitations, listMembers } from '@/server/team/service'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { emailIsConfigured } from '@/server/email'
import { TeamManager } from './team-manager'

export const metadata: Metadata = { title: 'Team Members' }
export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const session = await requirePermission('team:manage')

  const [members, invitations, locations] = await Promise.all([
    listMembers(session),
    listInvitations(session),
    session.db.inventoryLocation.findMany({
      where: { isActive: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
  ])

  return (
    <>
      <PageHeader
        title="Team Members"
        subtitle={`${members.filter((m) => m.isActive).length} active`}
        backHref="/settings"
      />
      <PageBody>
        <TeamManager
          timezone={session.timezone}
          emailConfigured={emailIsConfigured()}
          organizationName={session.organizationName}
          currentUserId={session.userId}
          currentRole={session.role}
          members={members.map((membership) => ({
            id: membership.id,
            userId: membership.userId,
            name: `${membership.user.firstName} ${membership.user.lastName}`.trim(),
            email: membership.user.email,
            role: membership.role,
            isActive: membership.isActive,
            defaultLocationId: membership.defaultLocationId,
            defaultLocationName: membership.defaultLocation?.name ?? null,
            lastLoginAt: membership.user.lastLoginAt?.toISOString() ?? null,
          }))}
          invitations={invitations.map((invitation) => ({
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            expiresAt: invitation.expiresAt.toISOString(),
            sendCount: invitation.sendCount,
            locationName: invitation.defaultLocation?.name ?? null,
          }))}
          locations={locations}
        />
      </PageBody>
    </>
  )
}
