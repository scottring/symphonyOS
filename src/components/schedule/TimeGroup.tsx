import type { ReactNode } from 'react'
import type { DaySection } from '@/lib/timeUtils'
import { getDaySectionLabel } from '@/lib/timeUtils'

interface TimeGroupProps {
  section: DaySection
  children: ReactNode
  isEmpty?: boolean
}

export function TimeGroup({ section, children, isEmpty }: TimeGroupProps) {
  const label = getDaySectionLabel(section)

  if (isEmpty) {
    return null // Don't show empty sections
  }

  return (
    <div className="mb-10">
      <h3 className="time-group-header mb-4">
        {label}
      </h3>
      <div className="space-y-3 stagger-in">
        {children}
      </div>
    </div>
  )
}
