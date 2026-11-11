import type { CarriedRoutine } from '@/lib/today/carriedRoutines'
import { carriedFrom } from '@/lib/today/carriedRoutines'
import { TaskCheckbox } from './TaskCheckbox'

/**
 * "Still to do" (Scott, 2026-11-11: Pay FFG was due on the 10th and stayed
 * there): routines set to "Keep it until it's done" whose last occurrence was
 * missed. Each row ticks off (or skips) that ORIGINAL occurrence, says where
 * it is from, and opens its routine. Nothing to carry, nothing drawn.
 */
export function TodayCarriedRoutines({ carried, today, onDone, onSkip, onOpen }: {
  carried: readonly CarriedRoutine[]
  today: Date
  onDone: (c: CarriedRoutine) => void
  onSkip: (c: CarriedRoutine) => void
  onOpen: (routineId: string) => void
}) {
  if (carried.length === 0) return null
  return (
    <div className="today-routines today-carried">
      <div className="daybook-journal-heading"><h2>Still to do</h2></div>
      <ul className="today-routines-list" aria-label="Still to do">
        {carried.map((c) => {
          const from = carriedFrom(c.dueOn, today)
          return (
            <li key={`${c.routine.id}:${c.date.toDateString()}`} className="today-routine-row">
              <span className="today-scale-check">
                <TaskCheckbox shape="circle" completed={false} onToggleComplete={() => onDone(c)} onToggleWaiting={() => {}}
                  label={`Mark ${c.routine.name} complete`} />
              </span>
              <button type="button" className="today-routine-open" aria-label={`${c.routine.name}, ${from}`} onClick={() => onOpen(c.routine.id)}>
                {c.routine.name}
              </button>
              <span className="today-carried-from">{from}</span>
              <button type="button" className="today-carried-skip" onClick={() => onSkip(c)} aria-label={`Skip ${c.routine.name} this time`}>Skip</button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
