'use client'

import { useRouter } from 'next/navigation'
import { SegmentedControl } from '@/components/ui/field'

export type MoneyRange = 'today' | 'week' | 'month' | 'year'

export function RangeTabs({ value }: { value: MoneyRange }) {
  const router = useRouter()
  return (
    <SegmentedControl<MoneyRange>
      name="Date range"
      value={value}
      onChange={(next) => router.push(`/money?range=${next}`)}
      options={[
        { value: 'today', label: 'Today' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
        { value: 'year', label: 'Year' },
      ]}
    />
  )
}
