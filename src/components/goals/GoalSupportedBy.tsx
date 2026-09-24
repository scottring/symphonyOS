import { Target } from 'lucide-react'
import type { Task } from '@/types/task'
import { seasonGoalsSupporting } from '@/lib/planning/goalSupport'
import { readSeasons } from '@/lib/cadence/seasons'

/**
 * The seasons that took this year goal on — read from the other end of the
 * link the season's planning session writes (`tasks.goal_id`).
 *
 * Distinct from Chapters beneath it: a chapter is a PICK that served the goal,
 * stamped with `picked_at`. This is the seasonal goal itself, which a guided
 * session creates with no pick stamp at all — so before this section a year
 * goal's page showed no seasonal support even when a season had named it
 * (S3-02).
 */
export function GoalSupportedBy({ goalId, tasks, onOpen }: {
  goalId: string
  tasks: readonly Task[]
  onOpen?: (taskId: string) => void
}) {
  const supporting = seasonGoalsSupporting(goalId, tasks, readSeasons())
  if (supporting.length === 0) return null
  return (
    <section className="mt-6">
      <h3 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-2">Supported by</h3>
      <ul className="space-y-1.5">
        {supporting.map((ref) => (
          <li key={ref.id} className="flex items-center gap-2 text-sm">
            <span className="w-24 shrink-0 text-[11px] text-neutral-400">{ref.period}</span>
            <Target className="w-3.5 h-3.5 shrink-0 text-accent-600" aria-hidden="true" />
            {onOpen ? (
              <button type="button" onClick={() => onOpen(ref.id)} className="min-w-0 flex-1 truncate text-left text-neutral-700 hover:underline">{ref.title}</button>
            ) : (
              <span className="min-w-0 flex-1 truncate text-neutral-700">{ref.title}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
