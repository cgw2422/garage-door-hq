'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/field'
import { SearchIcon } from '@/components/ui/icons'

/**
 * Search is deliberately one large field. A technician looking up a repeat
 * customer from a driveway types a phone number, not a filter expression.
 */
export function CustomerSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initialQuery)

  useEffect(() => {
    if (value === initialQuery) return
    const timer = setTimeout(() => {
      router.replace(value ? `/customers?q=${encodeURIComponent(value)}` : '/customers')
    }, 250)
    return () => clearTimeout(timer)
  }, [value, initialQuery, router])

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-ink-subtle" />
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Name, phone, or address"
        aria-label="Search customers"
        className="h-14 pl-11"
        type="search"
        enterKeyHint="search"
      />
    </div>
  )
}
