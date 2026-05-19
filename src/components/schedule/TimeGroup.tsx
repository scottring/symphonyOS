import type { ReactNode } from 'react'
import type { DaySection } from '@/lib/timeUtils'
import { getDaySectionLabel } from '@/lib/timeUtils'

// Timed sections always render (even empty) so the insert affordance is visible.
// allday and unscheduled are hidden when empty — they are not timeline gaps.
const HIDE_WHEN_EMPTY: DaySection[] = ['allday', 'unscheduled']

interface TimeGroupProps {
  section: DaySection
  children: ReactNode
  isEmpty?: boolean
}

export function TimeGroup({ section, children, isEmpty }: TimeGroupProps) {
  const label = getDaySectionLabel(section)

  if (isEmpty && HIDE_WHEN_EMPTY.includes(section)) {
    return null // Don't show allday/unscheduled when empty
  }

  return (
    <div className="mb-10">
      <h3 className="time-group-header mb-4">
        {label}
      </h3>
      <div className="timeline-group stagger-in">
        {children}
      </div>
    </div>
  )
}
