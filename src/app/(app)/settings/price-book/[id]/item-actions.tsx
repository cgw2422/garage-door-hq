'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  archiveItemAction,
  duplicateItemAction,
  restoreItemAction,
} from '../actions'

export function ItemActions({
  itemId,
  isArchived,
}: {
  itemId: string
  isArchived: boolean
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <Card>
      <CardHeader title="Manage" />
      <div className="space-y-2.5">
        <form action={duplicateItemAction}>
          <input type="hidden" name="itemId" value={itemId} />
          <SubmitButton variant="secondary" fullWidth pendingLabel="Copying…">
            Duplicate this item
          </SubmitButton>
        </form>

        {isArchived ? (
          <form action={restoreItemAction}>
            <input type="hidden" name="itemId" value={itemId} />
            <SubmitButton variant="secondary" fullWidth pendingLabel="Restoring…">
              Restore to the price book
            </SubmitButton>
          </form>
        ) : confirming ? (
          <form action={archiveItemAction} className="space-y-2.5">
            <input type="hidden" name="itemId" value={itemId} />
            <p className="text-sm text-ink-muted">
              Archiving hides this from new estimates and jobs. History keeps it.
            </p>
            <div className="flex gap-2.5">
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <SubmitButton variant="danger" fullWidth pendingLabel="Archiving…">
                Archive
              </SubmitButton>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="secondary"
            fullWidth
            className="text-danger-600"
            onClick={() => setConfirming(true)}
          >
            Archive this item
          </Button>
        )}
      </div>
    </Card>
  )
}
