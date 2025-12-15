import { useState, useEffect, type ReactNode, type ReactElement } from 'react'
import type { DaySection } from '@/lib/timeUtils'
import { getDaySectionLabel } from '@/lib/timeUtils'
import { ChevronRight } from 'lucide-react'

interface TimeGroupProps {
  section: DaySection
  children: ReactNode
  isEmpty?: boolean
  itemCount?: number
  isCurrentSection?: boolean
  defaultCollapsed?: boolean
  forceCollapsed?: boolean  // For focus mode control
}

// Section-specific styling with subtle color hints
const sectionStyles: Record<DaySection, { icon: ReactElement; gradient: string }> = {
  allday: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    gradient: 'from-primary-500/10 to-transparent',
  },
  morning: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
    ),
    gradient: 'from-amber-500/8 to-transparent',
  },
  afternoon: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
      </svg>
    ),
    gradient: 'from-orange-500/6 to-transparent',
  },
  evening: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    ),
    gradient: 'from-indigo-500/8 to-transparent',
  },
  unscheduled: {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    gradient: 'from-neutral-400/8 to-transparent',
  },
}

export function TimeGroup({
  section,
  children,
  isEmpty,
  itemCount = 0,
  isCurrentSection = false,
  defaultCollapsed = false,
  forceCollapsed,
}: TimeGroupProps) {
  const label = getDaySectionLabel(section)
  const style = sectionStyles[section]

  // Track if user has manually overridden the collapse state
  const [userOverride, setUserOverride] = useState<boolean | null>(null)

  // Reset user override when forceCollapsed changes (e.g., toggling Focus Mode)
  useEffect(() => {
    setUserOverride(null)
  }, [forceCollapsed])

  // Determine actual collapsed state:
  // 1. User override takes priority (if they clicked to expand/collapse)
  // 2. Otherwise use forceCollapsed (from Focus Mode)
  // 3. Fall back to defaultCollapsed
  const collapsed = userOverride !== null
    ? userOverride
    : forceCollapsed !== undefined
      ? forceCollapsed
      : defaultCollapsed

  if (isEmpty) {
    return null // Don't show empty sections
  }

  return (
    <div className="mb-10 relative">
      {/* Subtle background gradient */}
      <div className={`absolute -inset-x-4 -inset-y-2 rounded-2xl bg-gradient-to-r ${style.gradient} pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

      {/* Section header - clickable for collapse */}
      <button
        onClick={() => setUserOverride(!collapsed)}
        className="flex items-center gap-3 mb-5 w-full text-left group/header"
      >
        {/* Collapse chevron */}
        <ChevronRight
          className={`w-4 h-4 text-neutral-300 transition-transform duration-200 ${
            collapsed ? '' : 'rotate-90'
          }`}
        />

        {/* Icon */}
        <span className={`${isCurrentSection ? 'text-primary-500' : 'text-neutral-400'}`}>
          {style.icon}
        </span>

        {/* Label with decorative line */}
        <h3 className={`time-group-header flex items-center gap-3 ${
          isCurrentSection ? 'text-primary-700' : ''
        }`}>
          {label}
          {isCurrentSection && (
            <span className="text-xs font-medium text-primary-500 bg-primary-50 px-2 py-0.5 rounded-full">
              Now
            </span>
          )}
          {collapsed && itemCount > 0 && (
            <span className="text-sm font-normal text-neutral-400">
              ({itemCount})
            </span>
          )}
          <span className="flex-1 h-px bg-gradient-to-r from-neutral-200 to-transparent min-w-[40px]" />
        </h3>
      </button>

      {/* Items with collapse animation */}
      <div
        className={`space-y-2 overflow-hidden transition-all duration-300 ease-in-out ${
          collapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
        }`}
      >
        <div className="stagger-in">
          {children}
        </div>
      </div>
    </div>
  )
}
