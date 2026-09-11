'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input, SegmentedControl } from '@/components/ui/field'
import { SearchIcon } from '@/components/ui/icons'

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

export function InventorySearch({
  initialQuery,
  locationId,
}: {
  initialQuery: string
  locationId: string
}) {
  const router = useRouter()
  const [value, setValue] = useState(initialQuery)

  useEffect(() => {
    if (value === initialQuery) return
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ location: locationId, tab: 'stock' })
      if (value) params.set('q', value)
      router.replace(`/inventory?${params.toString()}`)
    }, 250)
    return () => clearTimeout(timer)
  }, [value, initialQuery, locationId, router])

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-ink-subtle" />
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Part, SKU or bin"
        aria-label="Search this location"
        type="search"
        className="h-12 pl-11"
      />
    </div>
  )
}
