// src/components/routine/rhythm/CadenceBand.tsx
//
// One rung of the ladder past the week: Monthly, Seasonal, Yearly, Less often
// — and Resting at the foot. The twelve-month ribbon this replaces could not
// show a MONTHLY routine (it belongs in every cell), and it plotted four very
// different cadences onto one calendar as if they were the same kind of thing
// (Scott, 2026-09-13: "monthly, seasonal, and yearly and also > year").
//
// A band says three things per row: what it is, how often, and when it next
// lands. Nothing here is ticked — an occurrence is ticked on Week or Today.

import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { nextOccurrence } from '@/lib/quickRecurrence'
import { SlotAdd, type CreateRoutineInSlot } from './SlotAdd'
import { RoutineRow } from './RoutineRow'

/** When this routine next lands, as a person would say it. A resting routine
 *  answers with its wake date instead — `paused_until` is stored at UTC
 *  midnight, so it is read in UTC or a west-of-Greenwich clock drags the month
 *  back one.
 *
 *  `resting` is PASSED, never sniffed off the routine: rhythmModel is the one
 *  file sanctioned to read `visibility`, and a band that re-derived its own
 *  rung is how surfaces come to disagree (the visibility tripwire caught
 *  exactly that here, 2026-09-13). */
export function nextLabel(routine: Routine, now: Date, resting: boolean): string | null {
  if (resting) {
    if (!routine.paused_until) return null
    const wake = new Date(routine.paused_until)
    return `wakes ${wake.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`
  }
  // 'since_last' has no calendar answer until it has been done once — the
  // clock starts at the last completion, which this band does not know.
  if (routine.recurrence_pattern.type === 'since_last') return null
  const at = nextOccurrence(routine.recurrence_pattern, routine.time_of_day ?? null, now)
  if (Number.isNaN(at.getTime())) return null
  const sameYear = at.getFullYear() === now.getFullYear()
  return `next ${at.toLocaleDateString('en-US', sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', year: 'numeric' })}`
}

export function CadenceBand({
  heading, hint, routines, familyMembers, stepCounts, matches, now, resting = false,
  onOpenRoutine, onCreateInSlot, createPattern, addLabel,
}: {
  heading: string
  /** One quiet line saying what this rung is for. */
  hint?: string
  routines: Routine[]
  familyMembers: FamilyMember[]
  stepCounts: Record<string, number>
  /** Search highlighting: false dims a row that doesn't match. */
  matches?: (r: Routine) => boolean
  now: Date
  resting?: boolean
  onOpenRoutine: (r: Routine) => void
  onCreateInSlot?: CreateRoutineInSlot
  /** The recurrence this band's own "+" creates — the slot supplies it. */
  createPattern?: Routine['recurrence_pattern']
  addLabel?: string
}) {
  if (routines.length === 0 && !onCreateInSlot) return null

  return (
    <section aria-label={heading} className="min-w-0">
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-2xl text-neutral-900">{heading}</h2>
        {hint && <p className="text-[13px] text-neutral-500">{hint}</p>}
      </div>

      {routines.length > 0 && (
        <ul className="mt-2 border-t border-neutral-300">
          {routines.map((r) => (
            <RoutineRow
              key={r.id}
              routine={r}
              familyMembers={familyMembers}
              steps={stepCounts[r.id] ?? 0}
              dimmed={matches ? !matches(r) : false}
              when={resting ? nextLabel(r, now, true) : undefined}
              detail={resting ? undefined : nextLabel(r, now, false)}
              onOpen={onOpenRoutine}
            />
          ))}
        </ul>
      )}

      {routines.length === 0 && (
        <p className="mt-2 px-1 text-[13px] text-neutral-400">Nothing on this rung.</p>
      )}

      {onCreateInSlot && createPattern && (
        <div className="mt-1.5 px-1">
          <SlotAdd
            label={addLabel ?? `Add a ${heading.toLowerCase()} routine`}
            onCreate={(name) => onCreateInSlot({ name, recurrence_pattern: createPattern })}
          />
        </div>
      )}
    </section>
  )
}
