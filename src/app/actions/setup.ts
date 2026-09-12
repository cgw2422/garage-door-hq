'use server'

import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/session'

/**
 * Put the setup checklist away.
 *
 * Any member can dismiss it — it is a nudge, not a permission — and it is
 * recorded on the organization so it stays hidden for everybody rather than
 * reappearing on the next person's phone.
 */
export async function dismissSetupChecklistAction() {
  const session = await requireSession()
  await session.db.organization.update({
    where: { id: session.organizationId },
    data: { setupChecklistDoneAt: new Date() },
  })
  revalidatePath('/today')
}
