import { Check, Target, ArrowDown } from 'lucide-react'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import { betPulse } from '@/lib/planning/betPulse'

export function BetCard({ bet, tasks, goalsById, onSelect, onComplete, onDemote, now }: {
  bet: Task
  tasks: readonly Task[]
  goalsById: Map<string, Goal>
  onSelect: (id: string) => void
  onComplete: (id: string) => void
  /** Un-pick: send this card back to the bench (pickedAt cleared). */
  onDemote: (id: string) => void
  now?: Date
}) {
  const pulse = betPulse(bet, tasks, now)
  const goal = bet.goalId ? goalsById.get(bet.goalId) : undefined
  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onSelect(bet.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onSelect(bet.id) }}
      className={`card p-4 text-left transition-colors cursor-pointer hover:bg-neutral-50 ${
        bet.completed ? 'opacity-60' : pulse.starving ? 'border-amber-200 bg-amber-50/40' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 min-w-0 font-display text-[15px] leading-snug text-neutral-900">{bet.title}</p>
        <button
          type="button"
          aria-label={bet.completed ? 'Won' : 'Mark won'}
          onClick={(e) => { e.stopPropagation(); onComplete(bet.id) }}
          className={`shrink-0 w-6 h-6 rounded-full border grid place-items-center transition-colors ${
            bet.completed ? 'bg-primary-500 border-primary-500 text-white' : 'border-neutral-300 text-transparent hover:text-neutral-300'
          }`}
        >
          <Check aria-hidden="true" className="w-3.5 h-3.5" strokeWidth={3} />
        </button>
      </div>
      {goal ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-primary-700">
          <Target aria-hidden="true" className="w-3 h-3" /> {goal.name}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-neutral-400">seasonal</p>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        {pulse.months.map((m) => (
          <span key={m.label} className="flex items-center gap-1 text-[10px] text-neutral-400">
            <span className={`w-2 h-2 rounded-full ${
              m.hasDone ? 'bg-primary-500' : m.hasMoves ? 'bg-primary-300' : 'bg-neutral-200'
            }`} />
            {m.label}
          </span>
        ))}
        {pulse.starving && !bet.completed && (
          <span className="ml-auto text-[11px] font-medium text-amber-700">nothing this month</span>
        )}
        {!bet.completed && (
          <button
            type="button"
            aria-label="Move to bench"
            title="Not this season — move to the bench"
            onClick={(e) => { e.stopPropagation(); onDemote(bet.id) }}
            className={`${pulse.starving ? '' : 'ml-auto'} shrink-0 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 transition-colors`}
          >
            <ArrowDown aria-hidden="true" className="w-3 h-3" /> Bench
          </button>
        )}
      </div>
    </div>
  )
}
