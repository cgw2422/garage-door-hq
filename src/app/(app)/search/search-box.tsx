'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SearchIcon } from '@/components/ui/icons'

/**
 * The search field.
 *
 * Debounced and pushed into the URL, so a result is a real page a technician
 * can bookmark or hand to somebody, and the back button behaves. Autofocus on
 * arrival: this screen exists to be typed into.
 */
export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initialQuery)
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (value === initialQuery) return
    if (debounce.current) clearTimeout(debounce.current)

    debounce.current = setTimeout(() => {
      startTransition(() => {
        // replace, not push: typing should not fill the back stack with every
        // prefix of what somebody typed.
        router.replace(value.trim() ? `/search?q=${encodeURIComponent(value)}` : '/search')
      })
    }, 220)

    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [value, initialQuery, router])

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle">
        <SearchIcon className="h-[1.15em] w-[1.15em]" />
      </span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Name, phone, address, INV-1043, .225 2 27…"
        aria-label="Search everything"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        className="h-13 w-full rounded-[--radius-control] border border-hairline-strong bg-surface pl-10 pr-3.5 text-base text-ink outline-none placeholder:text-ink-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
      />
    </div>
  )
}
