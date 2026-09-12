import type { Metadata } from 'next'
import Link from 'next/link'
import { requireSession } from '@/lib/session'
import { search } from '@/server/search/service'
import { PageBody, PageHeader } from '@/components/app/page-header'
import { Card, EmptyState, SectionHeading } from '@/components/ui/card'
import { SearchIcon } from '@/components/ui/icons'
import { SearchBox } from './search-box'

export const metadata: Metadata = { title: 'Search' }
export const dynamic = 'force-dynamic'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await requireSession()
  const { q } = await searchParams
  const query = (q ?? '').trim()

  const outcome = query.length >= 2 ? await search(session, query) : null

  return (
    <>
      <PageHeader title="Search" backHref="/today" />
      <PageBody>
        <SearchBox initialQuery={q ?? ''} />

        {outcome?.interpretation ? (
          <p className="text-xs leading-relaxed text-ink-subtle">{outcome.interpretation}</p>
        ) : null}

        {!query ? (
          <Card>
            <EmptyState
              icon={<SearchIcon />}
              title="Find anything"
              body="A customer's name or phone number, a street, a door, a part, or a document number like INV-1043. Spring measurements work too — try .225 2 27."
            />
          </Card>
        ) : query.length < 2 ? (
          <p className="text-center text-sm text-ink-muted">Keep typing…</p>
        ) : outcome && outcome.total === 0 ? (
          <Card>
            <EmptyState
              icon={<SearchIcon />}
              title={`Nothing matches "${query}"`}
              body="Try fewer words, or part of a phone number or address."
            />
          </Card>
        ) : (
          outcome?.groups.map((group) => (
            <div key={group.key}>
              <SectionHeading>{group.label}</SectionHeading>
              <Card padded={false}>
                {group.hits.map((hit, index) => (
                  <Link
                    key={hit.id}
                    href={hit.href}
                    className={`flex items-start gap-3 px-4 py-3 active:bg-surface-sunken ${
                      index > 0 ? 'border-t border-hairline' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-semibold text-ink">
                        {hit.title}
                      </span>
                      {hit.subtitle ? (
                        <span className="block truncate text-sm text-ink-muted">
                          {hit.subtitle}
                        </span>
                      ) : null}
                      {hit.meta ? (
                        <span className="block truncate text-xs text-ink-subtle">{hit.meta}</span>
                      ) : null}
                    </span>
                  </Link>
                ))}
              </Card>
            </div>
          ))
        )}
      </PageBody>
    </>
  )
}
