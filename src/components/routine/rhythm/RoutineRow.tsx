// src/components/routine/rhythm/RoutineRow.tsx
//
// One routine, the same shape on every rung: what it is · when it happens ·
// who it belongs to · a chevron into it. The page used to draw its top two
// rungs as bespoke visualizations — a time-axis arc and seven day columns —
// so "every day" and "once a season" looked like different kinds of thing and
// a Tue/Thu/Sat routine appeared three times (Scott, 2026-09-13).
//
// A row expands in place to say its pattern in full, which is the one thing a
// list loses next to a canvas.

import { ChevronRight, ChevronDown, EyeOff } from 'lucide-react'
import { useState } from 'react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { describeRecurrence } from '@/lib/quickRecurrence'
import { memberIdsOf } from './rhythmModel'
import { LIST_ROW, LIST_ROW_BODY, LIST_ROW_LANE, LIST_ROW_META, LIST_ROW_TRAIL } from '@/components/layout/listRow'
import { hasMonthlyPosition, describeMonthlyPosition } from '@/lib/cadence/monthlyPosition'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** A clock time as a person says it: 7 pm, 7:30 am. */
export function timeLabel(time: string | null | undefined): string | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return null
  const suffix = h < 12 ? 'am' : 'pm'
  const hour = h % 12 === 0 ? 12 : h % 12
  return m ? `${hour}:${String(m).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`
}

function dayNames(days: readonly string[]): string {
  const sorted = [...days]
    .map((d) => DAY_KEYS.indexOf(d as typeof DAY_KEYS[number]))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)
  if (sorted.length === 0) return ''
  const key = sorted.join(',')
  if (key === '1,2,3,4,5') return 'Weekdays'
  if (key === '0,6') return 'Weekends'
  if (sorted.length === 7) return 'Every day'
  if (sorted.length === 2) return `${DAY_NAMES[sorted[0]]} and ${DAY_NAMES[sorted[1]]}`
  return sorted.map((i) => DAY_NAMES[i]).join(', ')
}

/**
 * WHEN this routine happens — a different question from how OFTEN, which the
 * band heading already answers. So "Sunday", "On the 1st", "Once a season",
 * where describeRecurrence would say "Every Sun", "Monthly on the 1st".
 * Deliberately its own function rather than a second cadence vocabulary
 * smuggled into describeRecurrence, which the ⌘K preview and the month page
 * both read.
 *
 * Flexibility is stated, never hidden: a weekly routine with no day chosen is
 * a real commitment that hasn't been pinned, and reads "Flexible day".
 */
export function whenLabel(routine: Routine): string {
  const p = routine.recurrence_pattern
  const at = timeLabel(routine.time_of_day)
  const days = p.type === 'weekly' ? dayNames(p.days ?? []) : ''

  switch (p.type) {
    case 'daily':
      return at ?? 'Flexible time'
    case 'weekly': {
      if (days && at) return `${days} · ${at}`
      if (days) return days
      return at ? `Flexible day · ${at}` : 'Flexible day'
    }
    case 'monthly': {
      if (hasMonthlyPosition(p)) {
        const pos = describeMonthlyPosition(p)
        return `${pos.charAt(0).toUpperCase()}${pos.slice(1)} of the month`
      }
      return p.day_of_month ? `On the ${ordinal(p.day_of_month)}` : 'Flexible day of the month'
    }
    case 'quarterly':
      return 'Once a season'
    case 'yearly':
      return p.month_of_year ? `In ${MONTHS[p.month_of_year - 1]}` : 'Once a year'
    default:
      return describeRecurrence(p)
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** The library row's split of the when: a clock time is short enough for the
 *  margin lane; the days (or the rest of the pattern) go under the title. */
function laneAndMeta(routine: Routine, override: string | null | undefined): { lane: string | null; when: string | null } {
  // An override (a resting routine's wake date) is the whole answer.
  if (override !== undefined) return { lane: null, when: override }
  const at = timeLabel(routine.time_of_day)
  if (!at) return { lane: null, when: whenLabel(routine) }
  const p = routine.recurrence_pattern
  if (p.type === 'daily') return { lane: at, when: null }
  if (p.type === 'weekly') return { lane: at, when: whenLabel({ ...routine, time_of_day: null }) }
  // Past the week the pattern doesn't say a time, so neither does the lane.
  return { lane: null, when: whenLabel(routine) }
}

export function RoutineRow({ routine, familyMembers, steps = 0, dimmed = false, when, detail, onOpen }: {
  routine: Routine
  familyMembers: FamilyMember[]
  steps?: number
  /** Search highlighting: true dims a row that doesn't match the query. */
  dimmed?: boolean
  /** Overrides the when. A resting routine's most useful answer is not its
   *  pattern but when it wakes. */
  when?: string | null
  /** An extra line under the name when expanded. */
  detail?: string | null
  onOpen: (r: Routine) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { lane, when: whenText } = laneAndMeta(routine, when)
  // Hidden from Today and planning in its panel: this page is where it can
  // be found again (Scott, 2026-10-03).
  const hidden = routine.show_on_timeline === false && routine.visibility === 'active'
  const owners = memberIdsOf(routine)
    .map((id) => familyMembers.find((m) => m.id === id)?.name)
    .filter((name): name is string => !!name)

  // The library row (layout system, 2026-10-01): a clock time in the margin
  // lane, the name at the body edge with when · who under it, the chevron
  // trailing. The when/who used to sit in fixed 160/112px columns that
  // vanished on a phone; under the title they read at every width.
  return (
    <li className={`${LIST_ROW} items-start! ${dimmed ? 'opacity-40' : ''}`}>
      <span className={`${LIST_ROW_LANE} whitespace-nowrap pt-[3px]`}>{lane}</span>

      <div className={LIST_ROW_BODY}>
        <button
          type="button"
          onClick={() => onOpen(routine)}
          className="block w-full min-w-0 text-left text-[16px] leading-snug text-neutral-900 hover:text-primary-700 transition-colors"
        >
          {routine.name}
          {steps > 0 && <span className="text-[12px] text-neutral-500"> · {steps} steps</span>}
        </button>
        {(whenText || owners.length > 0 || hidden) && (
          <p className={`${LIST_ROW_META} whitespace-normal`}>
            {whenText && <span>{whenText}</span>}
            {whenText && owners.length > 0 && <span aria-hidden="true"> · </span>}
            {owners.length > 0 && <span>{owners.join(', ')}</span>}
            {hidden && (whenText || owners.length > 0) && <span aria-hidden="true"> · </span>}
            {hidden && (
              <span className="inline-flex items-center gap-1 align-[-1px]">
                <EyeOff className="h-3 w-3" aria-hidden="true" />Hidden from Today and planning
              </span>
            )}
          </p>
        )}

        {expanded && (
          <div className="mt-1 text-[12px] leading-snug text-neutral-500">
            <p>
              <span className="font-medium text-neutral-600">{describeRecurrence(routine.recurrence_pattern)}</span>
              {detail && <span> · {detail}</span>}
            </p>
            {routine.description && <p className="mt-1">{routine.description}</p>}
          </div>
        )}
      </div>

      <div className={LIST_ROW_TRAIL}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Hide' : 'Show'} details for ${routine.name}`}
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded p-0.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
    </li>
  )
}
