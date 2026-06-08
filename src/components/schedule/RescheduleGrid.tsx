// src/components/schedule/RescheduleGrid.tsx
//
// The shared 2-column icon grid for picking a relative reschedule target — the
// same look as the SchedulePopover quick-date grid, reused so reschedule UIs are
// consistent. Pure: just calls onPick(when).

import { Sun, Moon, Sunrise, CalendarDays, CalendarRange, Calendar, CalendarClock, Hourglass } from 'lucide-react'
import type { TriageWhen } from './TriageWhenMenu'

const WHENS: { when: TriageWhen; label: string; Icon: typeof Sun }[] = [
  { when: 'today', label: 'Today', Icon: Sun },
  { when: 'tonight', label: 'Tonight', Icon: Moon },
  { when: 'tomorrow', label: 'Tomorrow', Icon: Sunrise },
  { when: 'this-weekend', label: 'This weekend', Icon: CalendarDays },
  { when: 'next-weekend', label: 'Next weekend', Icon: CalendarRange },
  { when: 'next-week', label: 'Next week', Icon: Calendar },
  { when: 'this-month', label: 'This month', Icon: CalendarClock },
  { when: 'someday', label: 'Someday', Icon: Hourglass },
]

export function RescheduleGrid({ onPick }: { onPick: (when: TriageWhen) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {WHENS.map(({ when, label, Icon }) => (
        <button
          key={when}
          type="button"
          role="menuitem"
          onClick={(e) => { e.stopPropagation(); onPick(when) }}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
            text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700
            transition-all duration-150"
        >
          <Icon className="w-4 h-4 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      ))}
    </div>
  )
}
