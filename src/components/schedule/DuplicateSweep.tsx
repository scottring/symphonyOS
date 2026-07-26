import { useState } from 'react'
import { Copy, Check, X, SkipForward } from 'lucide-react'
import type { DuplicatePair } from '@/lib/today/duplicates'
import type { TimelineItem } from '@/types/timeline'

/**
 * Resolve duplicates one tap at a time, never automatically.
 *
 * Two rules from the spec that live here rather than in the pure module:
 *  - a CROSS-TYPE group (a task and a routine with the same title) is a real
 *    duplicate to the eye, but deleting the routine is destructive and wrong.
 *    It gets "skip the routine today" and no delete affordance at all.
 *  - nothing resolves itself. Every group is *keep this one* or *keep both*.
 */

function rawId(timelineId: string): string {
  const dash = timelineId.indexOf('-')
  return dash === -1 ? timelineId : timelineId.slice(dash + 1)
}

function contextSummary(item: TimelineItem): string {
  const bits: string[] = []
  if (item.notes) bits.push('notes')
  if (item.projectId) bits.push('project')
  if (item.links?.length) bits.push('links')
  if (item.phoneNumber) bits.push('phone')
  if (item.location) bits.push('location')
  return bits.length ? bits.join(' · ') : 'no extra context'
}

export interface DuplicateSweepProps {
  pairs: DuplicatePair[]
  onClose: () => void
  /** Keep `keepId`, delete `dropIds`. Same-type groups only. */
  onKeepOne: (keepId: string, dropIds: string[]) => void
  /** Cross-type resolution: leave both rows alone, just skip the routine today. */
  onSkipRoutineToday: (routineId: string) => void
}

export function DuplicateSweep({
  pairs, onClose, onKeepOne, onSkipRoutineToday,
}: DuplicateSweepProps) {
  const [resolved, setResolved] = useState<Set<string>>(() => new Set())
  const remaining = pairs.filter((p) => !resolved.has(p.key))

  const dismiss = (key: string) => setResolved((prev) => new Set(prev).add(key))

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/30 p-4 md:p-10">
      <div className="card w-full max-w-xl rounded-2xl border border-neutral-200/70 bg-bg-elevated p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-neutral-800">
              <Copy className="mr-2 inline h-5 w-5 text-neutral-400" />
              Possible duplicates
            </h2>
            <p className="mt-1 text-[13px] text-neutral-500">
              Exact title matches only. Nothing is removed until you say so.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close duplicate sweep"
            className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {remaining.length === 0 ? (
          <p className="py-8 text-center font-display text-lg text-neutral-600">
            Nothing left to sweep.
          </p>
        ) : (
          <ul className="space-y-4">
            {remaining.map((pair) => {
              const routine = pair.items.find((i) => i.type === 'routine')
              return (
                <li key={pair.key} className="rounded-xl border border-neutral-200/70 p-3">
                  <p className="mb-2 text-[15px] font-medium text-neutral-800">
                    {pair.keeper.title}
                  </p>
                  <ul className="mb-3 space-y-1">
                    {pair.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-2 text-[13px] text-neutral-500">
                        {item.id === pair.keeper.id && !pair.crossType && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-primary-600" />
                        )}
                        <span className="capitalize">{item.type}</span>
                        <span className="text-neutral-300">·</span>
                        <span>{contextSummary(item)}</span>
                      </li>
                    ))}
                  </ul>

                  {pair.crossType ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="mr-1 text-[12px] text-neutral-500">
                        One of these is a routine — deleting it would remove it from every
                        day, so it can only be skipped.
                      </p>
                      {routine && (
                        <button
                          type="button"
                          onClick={() => { onSkipRoutineToday(rawId(routine.id).split('#')[0]); dismiss(pair.key) }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 py-1.5 text-[13px] text-neutral-700 transition-colors hover:bg-neutral-200"
                        >
                          <SkipForward className="h-4 w-4" />
                          Skip the routine today
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => dismiss(pair.key)}
                        className="rounded-lg px-2.5 py-1.5 text-[13px] text-neutral-500 transition-colors hover:bg-neutral-100"
                      >
                        Keep both
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onKeepOne(
                            rawId(pair.keeper.id),
                            pair.items.filter((i) => i.id !== pair.keeper.id).map((i) => rawId(i.id)),
                          )
                          dismiss(pair.key)
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-2.5 py-1.5 text-[13px] text-primary-700 transition-colors hover:bg-primary-100"
                      >
                        <Check className="h-4 w-4" />
                        Keep the one with context
                      </button>
                      <button
                        type="button"
                        onClick={() => dismiss(pair.key)}
                        className="rounded-lg px-2.5 py-1.5 text-[13px] text-neutral-500 transition-colors hover:bg-neutral-100"
                      >
                        Keep both
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

/**
 * The stats-row entry point: a passive count that doubles as the trigger.
 *
 * Renders nothing when there is nothing to sweep — the sweep is on demand, and
 * auto-prompting on a page whose whole problem is noise would be self-defeating.
 */
export function DuplicateSweepTrigger({
  count, onOpen,
}: { count: number; onOpen: () => void }) {
  if (count === 0) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Review items that look like duplicates"
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[15px] text-neutral-500 transition-all hover:bg-neutral-100 hover:text-neutral-800"
    >
      <Copy className="h-5 w-5" />
      <span>{count} possible duplicate{count === 1 ? '' : 's'}</span>
    </button>
  )
}
