// src/hooks/usePickUpFacts.ts
//
// What "pick up where you are" reads before it suggests steps: for this
// year, the season and month the guide would plan, this week and today, how
// much is already there — counted with the same selectors and area filter the
// pages use, so "Fall: 6 priorities" here is the six lines on Fall's page.
// Needs GoalsProvider above it (year goals live in the goals table).
import { useMemo } from 'react'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useDomain } from '@/hooks/useDomain'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { usePlanningSession, monthToken } from '@/hooks/usePlanningSession'
import { useGoalsContext } from '@/contexts/GoalsContext'
import { filterInboxTasksForLayers, filterTasksForLayers, matchesLayers } from '@/lib/today/domainFilter'
import { seasonToken, type Seasons } from '@/lib/cadence/seasons'
import { readCadenceConfig } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { isCurrentPeriod, periodBounds, selectPeriodTasks } from '@/lib/planning/periodPage'
import { closeOutCandidates, lineFate } from '@/lib/planning/v2/planV2'
import { weekListTasks } from '@/lib/planning/weekList'
import { hasPlans, parseYmd, pickUpPeriods, pickUpRows, type GuideStep, type PickUpFacts, type PickUpRow } from '@/lib/guide/guidedPlan'
import type { Task } from '@/types/task'

export interface PickUp {
  loaded: boolean
  /** The account has plans to pick up; a new account sees the four plain paths. */
  offer: boolean
  rows: PickUpRow[]
  periods: Record<GuideStep, string>
  inbox: number
  seasons: Seasons
}

function levelFacts(tasks: Task[], level: 'month' | 'season', start: Date, now: Date, meId: string | null, seasons: Seasons) {
  const b = periodBounds(level, start, seasons)
  const prev = periodBounds(level, b.prev, seasons)
  const open = selectPeriodTasks(tasks, level, b.start, isCurrentPeriod(b, now), meId, seasons)
    .filter((t) => lineFate(t, level, b.start, b.end) === 'open').length
  // The same lines the page's own look-back asks about (PlanPageV2 reviewIds).
  const review = closeOutCandidates(
    selectPeriodTasks(tasks, level, prev.start, isCurrentPeriod(prev, now), meId, seasons), level, prev.start, prev.end,
  ).length
  return { open, review }
}

export function usePickUpFacts(today: Date): PickUp {
  const { tasks, loading } = useSupabaseTasks()
  const { layers } = useDomain()
  const { getCurrentUserMember } = useFamilyMembers()
  const meId = getCurrentUserMember()?.id ?? null
  const { seasons, loading: seasonsLoading } = useHouseholdSeasons()
  const { goals, loading: goalsLoading } = useGoalsContext()
  const wso = readCadenceConfig().weekStartsOn
  const periods = useMemo(() => pickUpPeriods(today, seasons, wso), [today, seasons, wso])
  const monthSession = usePlanningSession('monthly', monthToken(parseYmd(periods.month)))
  const seasonSession = usePlanningSession('seasonal', seasonToken(parseYmd(periods.season), seasons))

  const layered = useMemo(() => filterTasksForLayers(tasks, layers), [tasks, layers])
  const inbox = useMemo(
    () => filterInboxTasksForLayers(tasks, layers).filter((t) => t.bucket === 'inbox' && !t.completed).length,
    [tasks, layers],
  )
  const facts: PickUpFacts = useMemo(() => {
    const year = parseYmd(periods.year).getFullYear()
    const week = weekListTasks(layered, parseYmd(periods.week), meId, { isCurrent: true })
    const same = (d?: Date) => !!d && d.toDateString() === today.toDateString()
    return {
      yearGoals: goals.filter((g) => g.year === year && g.status === 'active' && matchesLayers(g.context, layers)).length,
      season: { ...levelFacts(layered, 'season', parseYmd(periods.season), today, meId, seasons), planned: !!seasonSession.saved },
      month: { ...levelFacts(layered, 'month', parseYmd(periods.month), today, meId, seasons), planned: !!monthSession.saved },
      week: { open: week.filter((t) => !t.completed).length, done: week.filter((t) => t.completed).length },
      todayChosen: layered.filter((t) => !t.completed && (same(t.plannedOn) || same(t.scheduledFor))).length,
    }
  }, [periods, layered, meId, today, goals, layers, seasons, seasonSession.saved, monthSession.saved])

  const rows = useMemo(() => pickUpRows(facts, periods, today, seasons, (d) => weekOfYear(d, wso)), [facts, periods, today, seasons, wso])
  const loaded = !loading && !seasonsLoading && !goalsLoading && !monthSession.loading && !seasonSession.loading
  return { loaded, offer: loaded && hasPlans(facts), rows, periods, inbox, seasons }
}
