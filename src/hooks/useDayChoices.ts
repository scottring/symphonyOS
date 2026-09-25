// src/hooks/useDayChoices.ts
//
// The day tiles under "Choose when", for any surface that offers a day.
//
// Scott asked for the timing picker to say which day has room BEFORE a day is
// chosen, everywhere it offers one. Only /week could answer, because only
// /week had a per-day list to count off. This hook is that answer for the
// rest: Today, the planning pages, and a goal's own page.
//
// Three things it is careful about, all of them things Codex asked for:
//
//   ANCHORED, NEVER "TODAY'S WEEK". The days offered are the days of the week
//   the choice would land in — the week in view, or the week the row is
//   already committed to inside the period being planned. A November row
//   offers November days.
//
//   COUNTS, NOT CAPACITY. `dayDensity`, not `computeDayLoad`: relative counts
//   of tasks, events and routine OCCURRENCES, including all-day items, scaled
//   against the busiest day offered. Never hours, never a percentage.
//
//   HONEST WHERE IT CANNOT SEE. The planning calendar reaches a fixed window
//   forward from today (useDayLoadEvents). A day outside it is reported as
//   unknown, with the reason, rather than drawn as a quiet day.
//
// It reads the calendar through `useDayLoadEvents` — the separate, cached,
// 45-day fetch that exists precisely so a picker never reports a day as free
// because nobody asked about it. See that file for why widening the view's
// own fetch is the wrong fix.
import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { ActionableInstance, Routine } from '@/types/actionable'
import type { Layer } from '@/lib/domains'
import type { AssigneeFilter } from '@/lib/today/types'
import { addDays } from '@/lib/dateUtils'
import { localYmd } from '@/lib/cadence/config'
import { useWeekInstances } from '@/components/home/week/useWeekInstances'
import { buildWeekRoutineItems } from '@/components/home/week/weekRoutineItems'
import { useDayLoadEvents, DAY_LOAD_RANGE_DAYS, DAY_LOAD_BACK_DAYS } from '@/hooks/useDayLoadEvents'
import { densityReadiness, type DayDensity, type DensitySources } from '@/lib/planning/dayDensity'
import { weekDensities } from '@/lib/planning/weekDensity'
import type { DayChoice } from '@/components/plan/DayDensityTiles'

/** A day tile as PlanWeekMenu wants it. */
export interface TimingDayChoice {
  date: Date
  label: string
  dateLabel: string
  density: DayDensity
}

export interface DayChoicesInput {
  /**
   * The first day of the window to count over — a week anchor. Null when the
   * surface has no days to offer, which disables every fetch below.
   */
  windowStart: Date | null
  /** How many days the window covers. A week is 7; a month's weeks, 42. */
  dayCount: number
  tasks: readonly Task[]
  tasksLoading?: boolean
  /** Whose chosen days count — the auth user, as `focus` records them. */
  userId: string | null
  routines: readonly Routine[]
  routinesLoading?: boolean
  member?: AssigneeFilter
  layers: ReadonlySet<Layer>
  /**
   * Already fetched by the surface (Today holds its week's instances), so the
   * hook does not ask for the same rows twice.
   */
  instances?: readonly ActionableInstance[]
}

const EPOCH = new Date(1970, 0, 1)

export interface DayChoices {
  /** The 7 tiles for `weekStart`, or undefined when we cannot offer any. */
  forWeek: (weekStart: Date | null | undefined) => readonly TimingDayChoice[] | undefined
  /** What each source could say — exposed for tests and for callers that explain themselves. */
  sources: DensitySources
}

export function useDayChoices(input: DayChoicesInput): DayChoices {
  const { windowStart, dayCount, tasks, userId, routines, layers, member, instances } = input
  const enabled = !!windowStart && dayCount > 0

  // Instances: only asked for when the surface did not already hold them.
  const ownInstances = useWeekInstances(windowStart ?? EPOCH, enabled && !instances ? dayCount : 0)
  const allInstances = instances ?? ownInstances
  const { events, available: eventsAvailable, loading: eventsLoading } = useDayLoadEvents(enabled)

  const days = useMemo(
    () => (enabled ? Array.from({ length: dayCount }, (_, i) => addDays(windowStart!, i)) : []),
    [enabled, windowStart, dayCount],
  )

  const sources = useMemo<DensitySources>(() => ({
    tasks: input.tasksLoading ? 'loading' : 'ready',
    routines: input.routinesLoading ? 'loading' : 'ready',
    // `useDayLoadEvents` answers with a cache or a failure; a household with
    // no calendar answers successfully with nothing, which is a complete
    // count rather than a missing one.
    events: eventsLoading ? 'loading' : eventsAvailable ? 'ready' : 'error',
  }), [input.tasksLoading, input.routinesLoading, eventsLoading, eventsAvailable])

  const routineItems = useMemo(
    () => (enabled
      ? buildWeekRoutineItems({
        routines: [...routines], weekStart: windowStart!, dayCount,
        instances: [...allInstances], member,
        // The picker asks what is ON a day, not what the reader chose to hide
        // on their own timeline: an everyday routine still occupies the day.
        prefs: { hideRoutines: false, layers },
      })
      : []),
    [enabled, routines, windowStart, dayCount, allInstances, member, layers],
  )

  const byDay = useMemo(() => {
    if (!enabled) return new Map<string, DayDensity>()
    const readiness = densityReadiness(sources)
    // The window the planning calendar was actually read for — back far
    // enough to cover the week containing today, forward to its horizon.
    // Outside it a count would be confidently short, so the day says so.
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const from = addDays(today, -DAY_LOAD_BACK_DAYS)
    const to = addDays(today, DAY_LOAD_RANGE_DAYS)
    const densities = weekDensities({
      days, tasks, userId, events, routineItems, instances: allInstances, readiness,
      dayOutOfRange: (day) => (sources.events !== 'ready' || (day >= from && day <= to)
        ? null
        : { note: day < from ? 'further back than the calendar was read' : 'past what the calendar was read for' }),
    })
    return new Map(densities.map((d) => [localYmd(d.date), d]))
  }, [enabled, days, tasks, userId, events, routineItems, allInstances, sources])

  return useMemo(() => ({
    sources,
    forWeek: (weekStart) => {
      if (!weekStart || !enabled) return undefined
      const out: TimingDayChoice[] = []
      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStart, i)
        const density = byDay.get(localYmd(date))
        // A week the window does not cover gets NO tiles rather than partial
        // ones: half a week's counts cannot be scaled against each other.
        if (!density) return undefined
        out.push({
          date,
          label: date.toLocaleDateString('en-US', { weekday: 'short' }),
          dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          density,
        })
      }
      return out
    },
  }), [byDay, enabled, sources])
}

export type { DayChoice }
