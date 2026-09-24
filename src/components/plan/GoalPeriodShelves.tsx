// src/components/plan/GoalPeriodShelves.tsx
//
// A goal's own period Shelves, rendered on its detail page.
//
// Opening an October goal used to leave Shelves on today's task chooser —
// "Thursday, September 24 · This week's tasks Sep 20 – Sep 26" — because only
// `PeriodPlanPage` supplies period-aware Shelves and `/task/:id` fell through
// to `TodayPlanList` (walk finding S2-18). This renders the SAME
// `PeriodShelves` component the Month page renders, for the goal's own period,
// so the season reference and the period's calendar stay in view while you work
// on the goal.
//
// Goals only. An ordinary task's detail page is untouched and keeps today's
// chooser.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Task } from '@/types/task'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useRoutines } from '@/hooks/useRoutines'
import { useDomain } from '@/hooks/useDomain'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'

import { useReferenceLists } from '@/components/reference/ReferenceListsContext'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { useDayLoadEvents, DAY_LOAD_RANGE_DAYS } from '@/hooks/useDayLoadEvents'
import { filterTasksForLayers } from '@/lib/today/domainFilter'
import { periodBounds, isCurrentPeriod, selectPeriodTasks, railLevel, type PlanLevel } from '@/lib/planning/periodPage'
import { periodCalendarEntries } from '@/lib/planning/periodCalendar'
import { routinePatterns } from '@/lib/planning/routinePatterns'
import { readOpen, writeOpen } from './foldState'
import { goalShelvesPeriod } from '@/lib/planning/goalShelves'
import { PeriodShelves } from './PeriodShelves'
import { taskRow } from './PeriodPlanPage'

const NOUN: Record<PlanLevel, string> = { month: 'month', season: 'season', year: 'year' }

export function GoalPeriodShelves({ goal, onNavigate }: { goal: Task; onNavigate: (to: string) => void }) {
  const period = goalShelvesPeriod(goal)
  const level = period?.level ?? null
  const { tasks } = useSupabaseTasks()
  const { activeRoutines } = useRoutines()
  const { layers } = useDomain()
  const { getCurrentUserMember } = useFamilyMembers()
  const { seasons } = useHouseholdSeasons()
  const references = useReferenceLists()

  const today = useMemo(() => new Date(), [])
  const anchor = period?.anchor ?? today
  const bounds = useMemo(
    () => periodBounds(level ?? 'month', anchor, seasons),
    [level, anchor, seasons],
  )
  const above = level ? railLevel(level) : null
  const meId = getCurrentUserMember()?.id ?? null
  const layered = useMemo(() => filterTasksForLayers(tasks, layers), [tasks, layers])

  // The level above, read-only — the same rail the Month page shows.
  const aboveStart = useMemo(
    () => (above && above !== 'year' ? periodBounds(above, anchor, seasons).start : null),
    [above, anchor, seasons],
  )
  const railBounds = useMemo(
    () => (above && aboveStart ? periodBounds(above, aboveStart, seasons) : null),
    [above, aboveStart, seasons],
  )
  const railRows = useMemo(() => {
    if (above !== 'season' || !aboveStart) return []
    const aboveIsCurrent = isCurrentPeriod(periodBounds('season', aboveStart, seasons), today)
    return selectPeriodTasks(layered, 'season', aboveStart, aboveIsCurrent, meId, seasons)
      .map((t) => taskRow(t, 'season', aboveStart))
  }, [above, aboveStart, layered, meId, seasons, today])

  const patterns = useMemo(
    () => routinePatterns(activeRoutines, layers, { level: level ?? 'month', start: bounds.start, end: bounds.end }),
    [activeRoutines, layers, level, bounds.start, bounds.end],
  )
  const isCurrent = isCurrentPeriod(bounds, today)
  const routinesHeading = isCurrent ? 'Recurring commitments' : 'Current recurring commitments'

  const { events, available: eventsAvailable } = useDayLoadEvents(true)
  const dated = useMemo(
    () => periodCalendarEntries(layered, events, bounds.start, bounds.end),
    [layered, events, bounds.start, bounds.end],
  )
  const eventsCoverPeriod = useMemo(() => {
    const horizon = new Date(today)
    horizon.setDate(horizon.getDate() + DAY_LOAD_RANGE_DAYS)
    return bounds.end <= horizon && bounds.start >= new Date(today.getFullYear(), today.getMonth(), today.getDate())
  }, [today, bounds.start, bounds.end])

  // Folds are remembered per level, the same keys the plan page writes, so a
  // fold you collapsed on the Month page is still collapsed here.
  const routinesKey = `symphony-plan-routines-${level ?? 'month'}`
  const calendarKey = `symphony-plan-calendar-${level ?? 'month'}`
  const [routinesOpen, setRoutinesOpen] = useState(() => readOpen(routinesKey))
  const [calendarOpen, setCalendarOpen] = useState(() => readOpen(calendarKey))
  const toggleRoutines = useCallback(() => {
    setRoutinesOpen((v) => { writeOpen(routinesKey, !v); return !v })
  }, [routinesKey])
  const toggleCalendar = useCallback(() => {
    setCalendarOpen((v) => { writeOpen(calendarKey, !v); return !v })
  }, [calendarKey])

  // Claim the Shelves slot while this goal is open, so `ReferenceLists` hosts
  // the period target here instead of the day's plan. Released on unmount, so
  // navigating away restores the ordinary behaviour.
  const claim = references?.claimPeriodShelves
  useEffect(() => {
    if (!level || !claim) return
    return claim()
  }, [level, claim])

  // A goal with no period stamp has no Shelves to show; the host then keeps
  // whatever it would otherwise render.
  if (!level) return null

  const shelves = (
    <PeriodShelves
      level={level}
      bounds={bounds}
      above={above}
      railBounds={railBounds}
      railRows={railRows}
      noun={NOUN[level]}
      patterns={patterns}
      routinesHeading={routinesHeading}
      routinesOpen={routinesOpen}
      toggleRoutines={toggleRoutines}
      dated={dated}
      calendarOpen={calendarOpen}
      toggleCalendar={toggleCalendar}
      eventsAvailable={eventsAvailable}
      eventsCoverPeriod={eventsCoverPeriod}
      onOpen={(row) => onNavigate(`/task/${row.id}`)}
      onNavigate={onNavigate}
      onClose={() => {
        references?.shelvesTarget?.dispatchEvent(new Event('close-period-shelves'))
        references?.unpin('today')
      }}
    />
  )

  return references?.shelvesTarget ? createPortal(shelves, references.shelvesTarget) : null
}
