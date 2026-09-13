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

import { Repeat, Moon } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { describeRecurrence, nextOccurrence } from '@/lib/quickRecurrence'
import { SlotAdd, type CreateRoutineInSlot } from './SlotAdd'
import { memberIdsOf } from './rhythmModel'

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

  const Icon = resting ? Moon : Repeat

  return (
    <section aria-label={heading} className="min-w-0">
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="font-display text-lg text-neutral-700">{heading}</h2>
        <span className="text-xs tabular-nums text-neutral-400">{routines.length}</span>
      </div>
      {hint && <p className="px-1 text-[12px] text-neutral-500">{hint}</p>}

      <ul className="mt-1.5 space-y-0.5">
        {routines.map((r) => {
          const dim = matches ? !matches(r) : false
          const steps = stepCounts[r.id] ?? 0
          const owners = memberIdsOf(r)
            .map((id) => familyMembers.find((m) => m.id === id)?.name)
            .filter((name): name is string => !!name)
          const next = nextLabel(r, now, resting)
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpenRoutine(r)}
                className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-neutral-50 ${dim ? 'opacity-40' : ''}`}
              >
                <Icon className={`mt-[3px] h-3.5 w-3.5 shrink-0 ${resting ? 'text-neutral-300' : 'text-primary-300'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] leading-snug text-neutral-800">
                    {r.name}
                    {steps > 0 && <span className="text-neutral-400"> · {steps} steps</span>}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-neutral-500">
                    {describeRecurrence(r.recurrence_pattern)}
                    {next && <span className="text-neutral-400"> · {next}</span>}
                    {owners.length > 0 && <span className="text-neutral-400"> · {owners.join(', ')}</span>}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {routines.length === 0 && (
        <p className="px-2 py-1 text-[13px] text-neutral-400">Nothing on this rung.</p>
      )}

      {onCreateInSlot && createPattern && (
        <div className="mt-1 px-1">
          <SlotAdd
            label={addLabel ?? `Add a ${heading.toLowerCase()} routine`}
            onCreate={(name) => onCreateInSlot({ name, recurrence_pattern: createPattern })}
          />
        </div>
      )}
    </section>
  )
}
