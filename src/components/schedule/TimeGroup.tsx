import type { ReactNode } from 'react'
import type { DaySection } from '@/lib/timeUtils'
import { daySectionMeta } from '@/lib/daySectionMeta'

interface TimeGroupProps {
  section: DaySection
  children: ReactNode
  isEmpty?: boolean
}

export function TimeGroup({ section, children, isEmpty }: TimeGroupProps) {
  const { label, range, Icon } = daySectionMeta(section)

  if (isEmpty) {
    return null // Don't show empty sections
  }

  return (
    <div className="mb-10">
      <h3 className="time-group-header mb-4 flex items-center gap-2">
        <Icon className="w-4 h-4 text-amber-500 shrink-0" />
        <span>{label}</span>
        {range && (
          <span className="text-[11px] font-normal tracking-normal text-neutral-400 normal-case">
            {range}
          </span>
        )}
      </h3>
      <div className="timeline-group stagger-in">
        {children}
      </div>
    </div>
  )
}
