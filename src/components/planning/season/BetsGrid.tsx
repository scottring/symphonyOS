import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import { Plus } from 'lucide-react'
import { BetCard } from './BetCard'
import { partitionSeason, wonPicks, PICK_CAP } from '@/lib/planning/betPulse'

/** The season's picks rendered as ARCHITECTURE: always PICK_CAP positions —
 *  filled cards first, then quiet dashed open slots. The cap isn't a counter,
 *  it's the visible shape of the season. Capacity is about OPEN commitments:
 *  a won pick frees its slot rather than continuing to occupy one, so won
 *  cards render below the 8-position frame under their own heading — trophies
 *  don't compete with the season's open architecture. */
export function BetsGrid({ tasks, goalsById, onSelect, onComplete, onDemote, onSlotClick, now }: {
  tasks: readonly Task[]
  goalsById: Map<string, Goal>
  onSelect: (id: string) => void
  onComplete: (id: string) => void
  onDemote: (id: string) => void
  /** Tap an open slot → route attention to the composer (or the shelf). */
  onSlotClick?: () => void
  now?: Date
}) {
  const { picks } = partitionSeason(tasks)
  const won = wonPicks(tasks, now)
  const openSlots = Math.max(0, PICK_CAP - picks.length)
  return (
    <div>
      {picks.length === 0 && won.length === 0 && (
        <p className="text-sm text-neutral-400 italic mb-3">
          No picks yet. A pick is an outcome true by season's end — fill a slot from the shelf, your goals, or the composer.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {picks.map((b) => (
          <BetCard key={b.id} bet={b} tasks={tasks} goalsById={goalsById} onSelect={onSelect} onComplete={onComplete} onDemote={onDemote} now={now} />
        ))}
        {Array.from({ length: openSlots }, (_, i) => (
          <button
            key={`slot-${i}`}
            type="button"
            onClick={onSlotClick}
            aria-label="Open slot — add a pick"
            className="min-h-[104px] rounded-xl border-2 border-dashed border-neutral-200/80 grid place-items-center text-neutral-300 hover:border-primary-200 hover:text-primary-400 hover:bg-primary-50/20 transition-colors"
          >
            <span className="inline-flex items-center gap-1.5 text-[12px]">
              <Plus aria-hidden="true" className="w-3.5 h-3.5" /> Open slot
            </span>
          </button>
        ))}
      </div>
      {won.length > 0 && (
        <>
          <h3 className="mt-4 mb-2 text-[11px] tracking-wide uppercase text-neutral-400">Won this season</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {won.map((b) => (
              <BetCard key={b.id} bet={b} tasks={tasks} goalsById={goalsById} onSelect={onSelect} onComplete={onComplete} onDemote={onDemote} now={now} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
