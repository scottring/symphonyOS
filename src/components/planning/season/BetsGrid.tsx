import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import { BetCard } from './BetCard'
import { partitionBets, wonBets } from '@/lib/planning/betPulse'

export function BetsGrid({ tasks, goalsById, onSelect, onComplete, now }: {
  tasks: readonly Task[]
  goalsById: Map<string, Goal>
  onSelect: (id: string) => void
  onComplete: (id: string) => void
  now?: Date
}) {
  const { bets } = partitionBets(tasks)
  const won = wonBets(tasks, now)
  if (bets.length === 0 && won.length === 0) {
    return (
      <p className="text-sm text-neutral-400 italic">
        No bets yet. A bet is an outcome true by season's end — start one from your goals above, or write one below.
      </p>
    )
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {bets.map((b) => (
        <BetCard key={b.id} bet={b} tasks={tasks} goalsById={goalsById} onSelect={onSelect} onComplete={onComplete} now={now} />
      ))}
      {/* Completing a bet must not make it vanish from the page — a won bet
          stays visible (BetCard's own completed styling) through the season
          it was won in, rendered after the open cards so the open bets keep
          the grid's leading position. */}
      {won.map((b) => (
        <BetCard key={b.id} bet={b} tasks={tasks} goalsById={goalsById} onSelect={onSelect} onComplete={onComplete} now={now} />
      ))}
    </div>
  )
}
