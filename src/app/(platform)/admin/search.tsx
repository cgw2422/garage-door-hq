'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SubscriptionStatus } from '@prisma/client'
import { Input, Select } from '@/components/ui/field'
import { SearchIcon } from '@/components/ui/icons'

export function CompanySearch({
  query,
  status,
  statuses,
}: {
  query: string
  status: SubscriptionStatus | null
  statuses: SubscriptionStatus[]
}) {
  const router = useRouter()
  const [value, setValue] = useState(query)

  function push(next: { q?: string; status?: string | null }) {
    const params = new URLSearchParams()
    const q = next.q ?? value
    const nextStatus = next.status === undefined ? status : next.status
    if (q) params.set('q', q)
    if (nextStatus) params.set('status', nextStatus)
    const search = params.toString()
    router.replace(`/admin${search ? `?${search}` : ''}`)
  }

  useEffect(() => {
    if (value === query) return
    const timer = setTimeout(() => push({ q: value }), 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row">
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-ink-subtle" />
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Company, email or phone"
          aria-label="Search companies"
          type="search"
          className="h-12 pl-11"
        />
      </div>
      <Select
        aria-label="Subscription status"
        value={status ?? ''}
        onChange={(event) => push({ status: event.target.value || null })}
        className="sm:w-56"
      >
        <option value="">All statuses</option>
        {statuses.map((entry) => (
          <option key={entry} value={entry}>
            {entry.replace('_', ' ').toLowerCase()}
          </option>
        ))}
      </Select>
    </div>
  )
}
