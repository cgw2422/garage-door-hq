'use client'

import { useRouter } from 'next/navigation'
import { SegmentedControl } from '@/components/ui/field'

export type InventoryTab = 'stock' | 'usage' | 'restock'

export function InventoryTabs({
  value,
  locationId,
}: {
  value: InventoryTab
  locationId: string
}) {
  const router = useRouter()
  return (
    <SegmentedControl<InventoryTab>
      name="Inventory view"
      value={value}
      onChange={(next) => router.push(`/inventory?location=${locationId}&tab=${next}`)}
      options={[
        { value: 'stock', label: 'My Truck' },
        { value: 'usage', label: 'Usage' },
        { value: 'restock', label: 'Restock' },
      ]}
    />
  )
}
