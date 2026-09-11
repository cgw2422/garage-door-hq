'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PriceBookCategory } from '@prisma/client'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '@/lib/price-book-categories'
import { Input, SegmentedControl, Select } from '@/components/ui/field'
import { SearchIcon } from '@/components/ui/icons'

export function PriceBookTabs({ value }: { value: 'items' | 'packages' }) {
  const router = useRouter()
  return (
    <SegmentedControl<'items' | 'packages'>
      name="Price book view"
      value={value}
      onChange={(next) => router.push(`/settings/price-book?tab=${next}`)}
      options={[
        { value: 'items', label: 'Items' },
        { value: 'packages', label: 'Packages' },
      ]}
    />
  )
}

export function PriceBookFilters({
  query,
  category,
  showArchived,
}: {
  query: string
  category: PriceBookCategory | null
  showArchived: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState(query)

  function push(next: { q?: string; category?: string | null; archived?: boolean }) {
    const params = new URLSearchParams()
    const q = next.q ?? value
    const cat = next.category === undefined ? category : next.category
    const archived = next.archived ?? showArchived

    if (q) params.set('q', q)
    if (cat) params.set('category', cat)
    if (archived) params.set('archived', 'show')

    const search = params.toString()
    router.replace(`/settings/price-book${search ? `?${search}` : ''}`)
  }

  // Debounced so typing a SKU does not fire a request per keystroke.
  useEffect(() => {
    if (value === query) return
    const timer = setTimeout(() => push({ q: value }), 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className="space-y-2.5">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-ink-subtle" />
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Name, SKU or supplier"
          aria-label="Search the price book"
          type="search"
          className="h-12 pl-11"
        />
      </div>

      <div className="flex gap-2.5">
        <Select
          aria-label="Category"
          value={category ?? ''}
          onChange={(event) => push({ category: event.target.value || null })}
          className="flex-1"
        >
          <option value="">All categories</option>
          {CATEGORY_ORDER.map((key) => (
            <option key={key} value={key}>
              {CATEGORY_LABELS[key]}
            </option>
          ))}
        </Select>

        <label className="flex h-12 shrink-0 items-center gap-2 rounded-[--radius-control] border border-hairline-strong bg-surface px-3.5 text-sm font-medium text-ink-muted">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => push({ archived: event.target.checked })}
            className="h-4 w-4 rounded border-hairline-strong text-brand-500"
          />
          Archived
        </label>
      </div>
    </div>
  )
}
