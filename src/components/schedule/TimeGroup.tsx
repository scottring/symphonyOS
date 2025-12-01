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

  if (isEmpty && (section === 'unscheduled' || section === 'allday')) {
    return null // Don't show empty unscheduled or allday sections
  }

  return (
    <div className="mb-8">
      <h3 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-3">
        {label}
      </h3>
      {isEmpty ? (
        <div className="py-6 text-center text-sm text-neutral-300">
          Nothing scheduled
        </div>
      ) : (
        <div className="space-y-2">
          {children}
        </div>
      )}
    </div>
  )
}
