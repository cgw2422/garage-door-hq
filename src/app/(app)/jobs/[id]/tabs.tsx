'use client'

import { useRouter } from 'next/navigation'
import { SegmentedControl } from '@/components/ui/field'

export type JobTab = 'job' | 'door' | 'photos' | 'notes'

/**
 * The concept's four-up tab strip on the job screen. Server-rendered via a
 * query parameter so a deep link lands on the right tab.
 */
export function JobTabs({ jobId, value }: { jobId: string; value: JobTab }) {
  const router = useRouter()
  return (
    <SegmentedControl<JobTab>
      name="Job sections"
      value={value}
      onChange={(next) => router.push(`/jobs/${jobId}?tab=${next}`)}
      options={[
        { value: 'job', label: 'Job' },
        { value: 'door', label: 'Door' },
        { value: 'photos', label: 'Photos' },
        { value: 'notes', label: 'Notes' },
      ]}
    />
  )
}
