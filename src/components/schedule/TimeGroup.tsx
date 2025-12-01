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

  if (isEmpty && section === 'unscheduled') {
    return null // Don't show empty unscheduled section
  }

  return (
    <div className="mb-6">
      <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3 px-1">
        {label}
      </h3>
      {isEmpty ? (
        <div className="py-4 text-center text-sm text-neutral-400">
          Nothing scheduled
        </div>
      ) : (
        <div className="space-y-1">
          {children}
        </div>
      )}
    </div>
  )
}
