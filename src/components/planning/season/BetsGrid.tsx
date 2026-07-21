import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import { BetCard } from './BetCard'
import { partitionSeason, wonPicks } from '@/lib/planning/betPulse'

/** The season's picks — explicitly chosen quarter items, cards. Won picks
 *  stay visible (won styling) after the open cards through their season. */
export function BetsGrid({ tasks, goalsById, onSelect, onComplete, onDemote, now }: {
  tasks: readonly Task[]
  goalsById: Map<string, Goal>
  onSelect: (id: string) => void
  onComplete: (id: string) => void
  onDemote: (id: string) => void
  now?: Date
}) {
  const { picks } = partitionSeason(tasks)
  const won = wonPicks(tasks, now)
  if (picks.length === 0 && won.length === 0) {
    return (
      <p className="text-sm text-neutral-400 italic">
        No picks yet. A pick is an outcome true by season's end — choose up to 8 from the bench below, start one from your goals, or write one.
      </p>
    )
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {picks.map((b) => (
        <BetCard key={b.id} bet={b} tasks={tasks} goalsById={goalsById} onSelect={onSelect} onComplete={onComplete} onDemote={onDemote} now={now} />
      ))}
      {/* Completing a pick must not make it vanish from the page — a won pick
          stays visible (BetCard's own completed styling) through the season
          it was picked in, rendered after the open cards. */}
      {won.map((b) => (
        <BetCard key={b.id} bet={b} tasks={tasks} goalsById={goalsById} onSelect={onSelect} onComplete={onComplete} onDemote={onDemote} now={now} />
      ))}
    </div>
  )
}
