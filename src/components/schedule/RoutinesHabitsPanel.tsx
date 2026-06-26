import { useState } from 'react'
import { Sunrise, Sun, Moon, Check, Circle, ChevronUp, ChevronDown } from 'lucide-react'
import type { Routine } from '@/types/routine'
import { routinesByPartOfDay, type PartOfDay } from '@/lib/today/routinesByPartOfDay'

interface RoutinesHabitsPanelProps {
  routines: Routine[]
  isCompleted: (routineId: string) => boolean
  onToggle: (routineId: string, completed: boolean) => void
  defaultCollapsed?: boolean
}

const COLS: { part: PartOfDay; label: string; Icon: typeof Sunrise }[] = [
  { part: 'morning', label: 'Morning', Icon: Sunrise },
  { part: 'afternoon', label: 'Afternoon', Icon: Sun },
  { part: 'evening', label: 'Evening', Icon: Moon },
]

export function RoutinesHabitsPanel({ routines, isCompleted, onToggle, defaultCollapsed = false }: RoutinesHabitsPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const grouped = routinesByPartOfDay(routines)

  return (
    <section className="card mt-6 p-4">
      <header className="flex items-center justify-between mb-3">
        <span className="text-[12px] font-medium tracking-wide text-neutral-500">ROUTINES &amp; HABITS</span>
        <button type="button" onClick={() => setCollapsed((c) => !c)}
          className="inline-flex items-center gap-1 text-[13px] text-neutral-500 hover:text-neutral-700">
          {collapsed ? 'Expand' : 'Collapse'}
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </header>
      {!collapsed && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {COLS.map(({ part, label, Icon }) => (
            <div key={part}>
              <div className="flex items-center gap-1.5 mb-1 text-neutral-700">
                <Icon className="w-4 h-4 text-neutral-500" />
                <span className="text-[13px] font-medium">{label}</span>
              </div>
              <div className="text-[12px] text-neutral-400 mb-2">{grouped[part].length} scheduled</div>
              <ul className="space-y-1">
                {grouped[part].map((r) => {
                  const done = isCompleted(r.id)
                  return (
                    <li key={r.id} className="flex items-center gap-2">
                      <button type="button" aria-label={`Mark ${r.name} ${done ? 'not done' : 'done'}`}
                        onClick={() => onToggle(r.id, !done)} className="shrink-0">
                        {done ? <Check className="w-4 h-4 text-primary-600" /> : <Circle className="w-4 h-4 text-neutral-300" />}
                      </button>
                      <span className={`text-[14px] ${done ? 'line-through text-neutral-400' : 'text-neutral-700'}`}>{r.name}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
