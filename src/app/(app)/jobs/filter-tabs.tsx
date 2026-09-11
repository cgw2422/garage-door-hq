'use client'

import { useRouter } from 'next/navigation'
import { SegmentedControl } from '@/components/ui/field'

export type JobFilter = 'active' | 'completed' | 'all'

export function JobFilterTabs({ value }: { value: JobFilter }) {
  const router = useRouter()
  return (
    <SegmentedControl<JobFilter>
      name="Job filter"
      value={value}
      onChange={(next) => router.push(`/jobs?filter=${next}`)}
      options={[
        { value: 'active', label: 'Active' },
        { value: 'completed', label: 'Completed' },
        { value: 'all', label: 'All' },
      ]}
    />
  )
}
