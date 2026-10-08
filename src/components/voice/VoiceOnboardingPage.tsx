// src/components/voice/VoiceOnboardingPage.tsx
//
// /plan-aloud — guided planning, signed in. Reads the account's own plans
// with the selections, domain filter and people lens the planning pages use
// (the Year page's goals: this year, active, not carried forward), so a
// session starts from what is already there and reuses it. Saves through the
// same writers the planning pages use (useGoals.addGoal,
// useSupabaseTasks.addTask / updateTask), as the person, under RLS, into the
// periods the session fixed when it began. "Review my plan" starts the
// existing guided look-back. Voice appears only when live voice is switched
// on (appVoice); otherwise there are no voice controls and typing is the way.
// The typed guide appears only when VITE_PLANNING_CONVERSATION=1 (and the
// server's PLANNING_CONVERSATION_ENABLED=1); without it the page is the same
// guided flow, typed and tapped.

import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoalsProvider, useGoalsContext } from '@/contexts/GoalsContext'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useDomain } from '@/hooks/useDomain'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { useGuidedPlan } from '@/hooks/useGuidedPlan'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { planPeopleLens } from '@/lib/planning/peopleLens'
import { filterTasksForLayers, matchesLayers } from '@/lib/today/domainFilter'
import { readCadenceConfig } from '@/lib/cadence/config'
import { isCurrentPeriod, periodBounds, selectPeriodTasks } from '@/lib/planning/periodPage'
import { closeOutCandidates } from '@/lib/planning/v2/planV2'
import { weekListTasks } from '@/lib/planning/weekList'
import { currentStep, pickUpPeriods, startPickUp, stepPath } from '@/lib/guide/guidedPlan'
import { draftPeriods, readDraft, writeDraft, type VoicePlanDraft } from '@/lib/voiceOnboarding/flow'
import { existingPlanFrom } from '@/lib/voiceOnboarding/existingPlan'
import { labelsForPeriods, planPeriods } from '@/lib/voiceOnboarding/periods'
import { appVoice } from '@/lib/voiceOnboarding/appTransport'
import { appWriters } from '@/lib/voiceOnboarding/appWriters'
import { GUIDE_ON, askGuide } from '@/lib/voiceOnboarding/guide'
import { PAGE_COLUMN } from '@/components/layout/pageLayout'
import { VoicePlanner, type ReviewKind } from './VoicePlanner'

export function VoiceOnboardingPage() {
  return <GoalsProvider><Inner /></GoalsProvider>
}

function Inner() {
  const navigate = useNavigate()
  const { tasks, loading, addTask, updateTask, userId } = useSupabaseTasks()
  const { goals, addGoal, loading: goalsLoading } = useGoalsContext()
  const { layers } = useDomain()
  const { getCurrentUserMember } = useFamilyMembers()
  const meId = getCurrentUserMember()?.id ?? null
  const [people] = useAssigneeFilter()
  const lens = useMemo(() => planPeopleLens(people, meId), [people, meId])
  const { seasons, loading: seasonsLoading } = useHouseholdSeasons()
  const guide = useGuidedPlan()
  const wso = readCadenceConfig().weekStartsOn
  const periods = useMemo(() => planPeriods(new Date(), seasons, wso), [seasons, wso])
  const periodsNow = useMemo(() => draftPeriods(periods), [periods])
  const labelsFor = useCallback((p: VoicePlanDraft['periods']) => labelsForPeriods(p, seasons), [seasons])

  const writers = useMemo(() => appWriters(addGoal, addTask, updateTask), [addGoal, addTask, updateTask])

  // What is already planned — the same rows the Year, Season, Month and
  // Week pages show for this person, through the same domain filter and
  // people lens. Recomputed when they change, so the session never offers a
  // row the pages would not.
  const ready = !loading && !goalsLoading && !seasonsLoading
  const existing = useMemo(() => {
    const layered = filterTasksForLayers(tasks, layers)
    const now = periods.today
    const lookBack = (level: 'month' | 'season', start: Date) => {
      const prev = periodBounds(level, periodBounds(level, start, seasons).prev, seasons)
      return closeOutCandidates(selectPeriodTasks(layered, level, prev.start, isCurrentPeriod(prev, now), meId, seasons), level, prev.start, prev.end).length
    }
    const carriedForward = new Set(goals.flatMap((g) => (g.carriedFrom ? [g.carriedFrom] : [])))
    return existingPlanFrom({
      goals: goals.filter((g) => g.year === periods.year && !carriedForward.has(g.id) && matchesLayers(g.context, layers) && lens.keep(g)),
      season: selectPeriodTasks(layered, 'season', periods.seasonStart, true, lens.scopeId, seasons).filter(lens.keep),
      month: selectPeriodTasks(layered, 'month', periods.monthStart, true, lens.scopeId, seasons).filter(lens.keep),
      week: weekListTasks(layered, periods.weekStart, lens.scopeId, { isCurrent: true }).filter(lens.keep),
      today: now,
      userId,
      lookBack: { month: lookBack('month', periods.monthStart), season: lookBack('season', periods.seasonStart) },
    })
  }, [tasks, layers, goals, periods, seasons, meId, lens, userId])

  const initialDraft = useMemo(() => (userId ? readDraft(userId) : null), [userId])
  const persistDraft = useCallback((d: VoicePlanDraft | null) => (userId ? writeDraft(userId, d) : false), [userId])

  const onReview = useCallback(async (kind: ReviewKind) => {
    if (kind === 'week') { navigate('/week'); return }
    const s = startPickUp([kind], pickUpPeriods(new Date(), seasons, wso))
    await guide.set(s)
    navigate(stepPath(currentStep(s), s))
  }, [guide, navigate, seasons, wso])

  if (!userId || !ready) return <div className={PAGE_COLUMN}><p className="vo-fine" role="status">Reading your plans…</p></div>
  return (
    <div className={PAGE_COLUMN}>
      <VoicePlanner
        key={userId}
        labels={periods.labels}
        periodsNow={periodsNow}
        labelsFor={labelsFor}
        existing={existing}
        initialDraft={initialDraft}
        persistDraft={persistDraft}
        writers={writers}
        makeTransport={appVoice}
        askGuide={GUIDE_ON ? askGuide : undefined}
        onOpen={(p) => navigate(p)}
        onReview={onReview}
      />
    </div>
  )
}
