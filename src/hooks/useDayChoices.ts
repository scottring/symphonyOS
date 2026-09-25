// src/hooks/useDayChoices.ts
//
// The day tiles under "Choose when", for any surface that offers a day.
//
// Scott asked for the timing picker to say which day has room BEFORE a day is
// chosen, everywhere it offers one. Only /week could answer, because only
// /week had a per-day list to count off. This hook is that answer for all of
// them — Today, the planning pages, a goal's own page, and /week itself.
//
// Four things it is careful about:
//
//   ANCHORED, NEVER "TODAY'S WEEK". The days offered are the days of the week
//   the choice would land in — the week in view, or the week the row is
//   already committed to inside the period being planned. A November row
//   offers November days.
//
//   COUNTS, NOT CAPACITY. `dayDensity`, not `computeDayLoad`: relative counts
//   of tasks, events and routine OCCURRENCES, including all-day items, scaled
//   against the busiest of the days OFFERED. Never hours, never a percentage.
//
//   ONE SCOPE, SAID OUT LOUD. Density is UNIVERSAL: everything on the day,
//   whatever domain it belongs to and whoever it is for. A day is full
//   regardless of which domain filled it, and a picker that quietly counted
//   only the reader's current filter would call a day free that is not. The
//   scope is not a parameter — callers cannot narrow it — and the tiles print
//   it. (Before this, /week counted its layer-filtered rows while every other
//   surface counted the universal planning calendar: the same Tuesday, two
//   answers. Codex, 2026-09-25.)
//
//   HONEST WHERE IT CANNOT SEE. Every event source states the range it was
//   actually read for, and a day outside that range is reported unknown with
//   the reason rather than drawn as a quiet day. "No calendar connected" is a
//   complete count and says so; "could not be read" is not.
import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { ActionableInstance, Routine } from '@/types/actionable'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { ALL_LAYERS } from '@/lib/domains'
import { addDays } from '@/lib/dateUtils'
import { localYmd } from '@/lib/cadence/config'
import { useWeekInstances } from '@/components/home/week/useWeekInstances'
import { buildWeekRoutineItems } from '@/components/home/week/weekRoutineItems'
import { useDayLoadEvents, type DayLoadRange } from '@/hooks/useDayLoadEvents'
import { getCalendarConnected } from '@/lib/calendarConnection'
import { densityReadiness, type DayDensity, type DensitySources, type SourceStatus } from '@/lib/planning/dayDensity'
import { weekDensities } from '@/lib/planning/weekDensity'
import type { DayChoice } from '@/components/plan/DayDensityTiles'

/** A day tile as PlanWeekMenu wants it. */
export interface TimingDayChoice {
  date: Date
  label: string
  dateLabel: string
  density: DayDensity
}

/**
 * A surface that already holds a calendar read of its own — /week does.
 *
 * `status` carries coverage here, and that is the whole difference from the
 * shared cache below. /week derives it with `densitySourcesFor`, which is
 * given the exact range on screen and answers `stale` when what it holds does
 * not cover it. So a `ready` override means "covers these days", and needs no
 * second range check. The SHARED cache cannot say that — its window is
 * anchored on today and outlives the day it was filled — so it reports the
 * range it actually read and is checked against it.
 */
export interface CalendarSource {
  events: readonly CalendarEvent[]
  status: SourceStatus
}

export interface DayChoicesInput {
  /**
   * The first day of the window to count over — a week anchor. Null when the
   * surface has no days to offer, which disables every fetch below.
   */
  windowStart: Date | null
  /** How many days the window covers. A week is 7; a month's weeks, 42. */
  dayCount: number
  /**
   * Every task, not the filtered view. The scope is universal by design (see
   * the header), and a caller passing its filtered list would silently
   * under-count.
   */
  tasks: readonly Task[]
  tasksLoading?: boolean
  /** Whose chosen days count — the auth user, as `focus` records them. */
  userId: string | null
  routines: readonly Routine[]
  routinesLoading?: boolean
  /**
   * Already fetched by the surface (Today and /week hold their week's
   * instances), so the hook does not ask for the same rows twice.
   */
  instances?: readonly ActionableInstance[]
  /**
   * Use this calendar instead of the shared planning read. /week fetches two
   * weeks around whatever week is on screen, which reaches further than the
   * planning window; passing it here keeps that coverage while the counting
   * stays identical.
   */
  calendar?: CalendarSource
}

const EPOCH = new Date(1970, 0, 1)

export interface DayChoices {
  /** The tiles for `weekStart`, or undefined when we cannot offer any. */
  forWeek: (weekStart: Date | null | undefined, count?: number) => readonly TimingDayChoice[] | undefined
  /** What each source could say — exposed for tests and for callers that explain themselves. */
  sources: DensitySources
}

export function useDayChoices(input: DayChoicesInput): DayChoices {
  const { windowStart, dayCount, tasks, userId, routines, instances, calendar } = input
  const enabled = !!windowStart && dayCount > 0

  // Instances: only asked for when the surface did not already hold them.
  const ownInstances = useWeekInstances(windowStart ?? EPOCH, enabled && !instances ? dayCount : 0)
  const allInstances = instances ?? ownInstances

  // A household with no calendar has nothing to ask, and asking anyway would
  // report a complete count as a failure.
  const connected = getCalendarConnected()
  const planning = useDayLoadEvents(enabled && !calendar && connected !== false)

  const events = calendar ? calendar.events : planning.events
  const range: DayLoadRange | null = calendar ? null : planning.range
  const eventStatus: SourceStatus = calendar
    ? calendar.status
    : connected === false ? 'not-connected'
      : planning.available ? 'ready'
        : planning.failed ? 'error'
          : 'loading'

  const days = useMemo(
    () => (enabled ? Array.from({ length: dayCount }, (_, i) => addDays(windowStart!, i)) : []),
    [enabled, windowStart, dayCount],
  )

  const sources = useMemo<DensitySources>(() => ({
    tasks: input.tasksLoading ? 'loading' : 'ready',
    routines: input.routinesLoading ? 'loading' : 'ready',
    events: eventStatus,
  }), [input.tasksLoading, input.routinesLoading, eventStatus])

  const routineItems = useMemo(
    () => (enabled
      ? buildWeekRoutineItems({
        routines: [...routines], weekStart: windowStart!, dayCount,
        instances: [...allInstances],
        // Universal, like everything else here: a routine occupies the day
        // whoever it belongs to and whatever domain it sits in.
        member: [],
        prefs: { hideRoutines: false, layers: ALL_LAYERS },
      })
      : []),
    [enabled, routines, windowStart, dayCount, allInstances],
  )

  const byDay = useMemo(() => {
    if (!enabled) return new Map<string, DayDensity>()
    const readiness = densityReadiness(sources)
    const densities = weekDensities({
      days, tasks, userId, events, routineItems, instances: allInstances, readiness,
      // The range the events we HOLD were actually read for — never today's
      // clock. A cache filled yesterday describes yesterday's window, and
      // treating it as today's coverage is how a day nobody read gets drawn
      // as a quiet one (Codex, 2026-09-25).
      dayOutOfRange: (day) => {
        if (calendar) return null                         // the caller's status already carries coverage
        if (eventStatus !== 'ready') return null          // already unknown, or complete without a calendar
        if (!range) return { note: 'the calendar has not been read yet' }
        const at = day.getTime()
        if (at >= range.start && at <= range.end) return null
        return { note: at < range.start ? 'further back than the calendar was read' : 'past what the calendar was read for' }
      },
    })
    return new Map(densities.map((d) => [localYmd(d.date), d]))
  }, [enabled, days, tasks, userId, events, routineItems, allInstances, sources, eventStatus, range, calendar])

  return useMemo(() => ({
    sources,
    forWeek: (weekStart, count = 7) => {
      if (!weekStart || !enabled) return undefined
      const out: TimingDayChoice[] = []
      for (let i = 0; i < count; i++) {
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
