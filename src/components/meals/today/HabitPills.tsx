import { DEFAULT_HABITS } from './habits'
import type { HabitMap } from '@/types/meal-planner'

interface Props {
  habits: HabitMap
  onToggle: (key: string) => void
}

/** Horizontal pill row. Filled = fired today, empty ring = didn't.
 *  Auto-derived from meal-row state higher up; tap pill = manual override. */
export function HabitPills({ habits, onToggle }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {DEFAULT_HABITS.map(h => {
        const fired = habits[h.key] === true
        return (
          <button key={h.key} type="button" onClick={() => onToggle(h.key)}
                  aria-pressed={fired}
                  className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] transition-colors ${
                    fired
                      ? 'bg-sage-100 text-sage-500 border border-sage-100'
                      : 'bg-bg-elevated text-neutral-400 border border-neutral-200 hover:border-neutral-300'
                  }`}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${fired ? 'bg-sage-500' : 'bg-transparent border border-neutral-300'}`} />
            <span className="font-medium">{h.label}</span>
          </button>
        )
      })}
    </div>
  )
}
