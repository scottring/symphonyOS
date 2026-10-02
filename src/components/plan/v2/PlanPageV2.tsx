// src/components/plan/v2/PlanPageV2.tsx
//
// The v2 month and season pages (docs/planning/2026-09-28-planning-v2.md).
//
// Each horizon has its OWN planning meeting and its own plan (Scott and Iris,
// 2026-09-28). So the page opens on "our plan" — calm, read-only, one toolbar —
// and the meeting is an explicit mode with its own stopping point. The next
// period's meeting opens by closing out the last one, a card at a time.
//
// Nothing new is stored. Lines, fates, people, the plan's "agreed" date and the
// Details pane are the records and writers v1 uses.

import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GoalsProvider, useGoalsContext } from '@/contexts/GoalsContext'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { useDomain } from '@/hooks/useDomain'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { useDayLoadEvents } from '@/hooks/useDayLoadEvents'
import { usePlanningSession, monthToken } from '@/hooks/usePlanningSession'
import { useSelectionOptional } from '@/shell/providers/SelectionProvider'
import { useAuth } from '@/hooks/useAuth'
import { MastheadCard, PeriodNavEyebrow } from '@/components/layout/MastheadCard'
import { showToast } from '@/hooks/useToast'
import { filterTasksForLayers, matchesLayers } from '@/lib/today/domainFilter'
import { seasonToken } from '@/lib/cadence/seasons'
import { parseLocalYmd, localYmd } from '@/lib/cadence/config'
import { lowerPlacement } from '@/lib/placement/model'
import { supportedGoal, goalOfTask, type SupportLink } from '@/lib/planning/goalSupport'
import { periodBounds, isCurrentPeriod, selectPeriodTasks } from '@/lib/planning/periodPage'
import {
  lineFate, lineDropUpdates, endedIn, closeOutCandidates, landmarksIn, readPlanView, writePlanView,
  type PlanView, type Landmark,
} from '@/lib/planning/v2/planV2'
import type { Task } from '@/types/task'
import { PlanLine, DraftLine, type LineActions, type LineVM } from './PlanLine'
import { DatesCalendar, type CalMark } from './DatesCalendar'
import { useMobile } from '@/hooks/useMobile'
import { readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { FocusDeck, CloseOut, type CloseDecision } from './FocusDeck'
import { PlanMeetingBar, PlanToolbar, PlanToolbarControls, PlanToolbarStatus, type PlanToolbarProps } from './PlanStatus'
import { GuideAnchor } from '@/components/guide/GuideBar'
import { EMPTY_TALLY, addToTally, lookBackWhy, nextAfterSave, tallySentence, type Tally } from '@/lib/planning/v2/planTally'
import { FromPaper } from './FromPaper'
import { ViewSwitch } from './ViewSwitch'
import { PeriodRefRoutines } from './RefShelves'
import { useAddArea } from './AddArea'
import { PeopleFilter } from './PeopleFilter'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { planPeopleLens } from '@/lib/planning/peopleLens'
import { makePlanActions, timingRemoval } from '@/lib/planning/planActions'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { goalToTaskConversion } from '@/lib/planning/goalConversion'
import { removeOutcomeToast } from '@/lib/planning/existingActions'
import { LoadFailedNotice } from '@/components/common/LoadFailedNotice'
import { useGuidedPlan } from '@/hooks/useGuidedPlan'
import { useGuideNext } from '@/components/guide/GuideBar'
import { currentStep, stepShortName } from '@/lib/guide/guidedPlan'

type Level = 'month' | 'season'
const NOUN: Record<Level, string> = { month: 'Month', season: 'Season' }

const two = (n: number) => String(n).padStart(2, '0')
const monthName = (d: Date) => d.toLocaleDateString('en-US', { month: 'long' })
const shortDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** A place a month's line can be put down; inert outside the DndContext. */
function DropZone({ id, data, className, children }: { id: string; data: Record<string, unknown>; className?: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, data })
  return <div ref={setNodeRef} className={`${className ?? ''}${isOver ? ' is-over' : ''}`}>{children}</div>
}

function Inner({ level }: { level: Level }) {
  const navigate = useNavigate()
  const { tasks, loading, error: tasksError, refetch: refetchTasks, toggleTask, updateTask, addTask, deleteTask, pushTask, keepForward, dropCommitment, updateTasksBulk, setGoal, setGoalLink } = useSupabaseTasks()
  const gated = useGatedTaskActions({ updateTask, pushTask, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))
  const { layers, soleDomain } = useDomain()
  const { members, getCurrentUserMember } = useFamilyMembers()
  const meId = getCurrentUserMember()?.id ?? null
  const [people] = useAssigneeFilter()
  const lens = useMemo(() => planPeopleLens(people, meId), [people, meId])
  const { seasons } = useHouseholdSeasons()
  const { goals } = useGoalsContext()
  const selection = useSelectionOptional()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const today = useMemo(() => new Date(), [])

  // ── The period ─────────────────────────────────────────────────────────
  const startParam = params.get('start')
  const anchor = useMemo(
    // Without a date the page is the period you are IN — what the horizon
    // rail names. v1's planningPeriod looked ahead near a month's end, so
    // "09 September" on the rail opened October (Scott, 2026-09-29). The
    // next period is one ›, or its review, away.
    () => (startParam ? parseLocalYmd(startParam) : today),
    [startParam, today],
  )
  const bounds = useMemo(() => periodBounds(level, anchor, seasons), [level, anchor, seasons])
  const prevBounds = useMemo(() => periodBounds(level, bounds.prev, seasons), [level, bounds.prev, seasons])
  const nextBounds = useMemo(() => periodBounds(level, bounds.next, seasons), [level, bounds.next, seasons])
  const isCurrent = isCurrentPeriod(bounds, today)
  const goTo = useCallback((d: Date) => {
    const next = new URLSearchParams(params)
    next.set('start', localYmd(periodBounds(level, d, seasons).start))
    setParams(next)
  }, [params, setParams, level, seasons])
  // Name the period in the URL, so the horizon rail and Back agree with the
  // page.
  useEffect(() => {
    if (startParam) return
    const next = new URLSearchParams(params)
    next.set('start', localYmd(bounds.start))
    setParams(next, { replace: true })
  }, [startParam, params, setParams, bounds.start])
  const nameOf = (b: typeof bounds) => (level === 'month' ? monthName(b.start) : b.label.replace(/\s+\d{4}$/, ''))
  const name = nameOf(bounds), prevName = nameOf(prevBounds), nextName = nameOf(nextBounds)

  // ── The lines ──────────────────────────────────────────────────────────
  const layered = useMemo(() => filterTasksForLayers(tasks, layers), [tasks, layers])
  const partOf = useCallback((t: Task): SupportLink | null => (
    t.isGoal ? supportedGoal(t, layered, goals, seasons) : goalOfTask(t, layered, seasons)
  ), [layered, goals, seasons])
  const toVM = useCallback((t: Task, b: typeof bounds): LineVM => {
    const fate = lineFate(t, level, b.start, b.end)
    const lower = t.completed ? null : lowerPlacement(t, level, b.start)
    const where = t.completed
      ? `Done${t.completedAt ? ` ${shortDay(t.completedAt)}` : ''}`
      : lower ? lower.label.replace(/^./, (c) => c.toUpperCase()) : null
    const steps = t.isGoal ? layered.filter((x) => x.goalTaskId === t.id).map((x) => {
      const lp = x.completed ? null : lowerPlacement(x, level, b.start)
      return { id: x.id, title: x.title, done: !!x.completed, where: x.completed ? 'done' : lp ? lp.label : null }
    }) : undefined
    return { task: t, fate, partOf: partOf(t), where, steps }
  }, [level, partOf, layered])

  // The people filter narrows the plan drawn here; the look-back below and
  // the level above (reference) keep their own scope, as Today's pools do.
  const lines = useMemo(() => {
    const listed = selectPeriodTasks(layered, level, bounds.start, isCurrent, lens.scopeId, seasons)
    const ids = new Set(listed.map((t) => t.id))
    const gone = endedIn(layered, level, bounds.start, bounds.end).filter((t) => !ids.has(t.id))
    return [...listed, ...gone].filter(lens.keep).map((t) => toVM(t, bounds))
  }, [layered, level, bounds, isCurrent, lens, seasons, toVM])
  const prevLines = useMemo(() => (
    selectPeriodTasks(layered, level, prevBounds.start, isCurrentPeriod(prevBounds, today), meId, seasons).map((t) => toVM(t, prevBounds))
  ), [layered, level, prevBounds, today, meId, seasons, toVM])

  // A goal's steps on the same list read beneath it, not twice (v1 nests them too).
  const mainAll = lines.filter((l) => l.fate === 'open' || l.fate === 'done')
  const goalIds = new Set(mainAll.filter((l) => l.task.isGoal).map((l) => l.task.id))
  const main = mainAll.flatMap((l) => {
    if (l.task.goalTaskId && goalIds.has(l.task.goalTaskId)) return []
    if (!l.task.isGoal) return [l]
    return [l, ...mainAll.filter((s) => s.task.goalTaskId === l.task.id).map((s) => ({ ...s, nested: true }))]
  })
  const carried = lines.filter((l) => l.fate === 'carried')
  const someday = lines.filter((l) => l.fate === 'someday')
  const dropped = lines.filter((l) => l.fate === 'dropped')

  // ── The level above, for reference ─────────────────────────────────────
  const aboveRows = useMemo(() => {
    if (level === 'month') {
      const b = periodBounds('season', bounds.start, seasons)
      return selectPeriodTasks(layered, 'season', b.start, isCurrentPeriod(b, today), meId, seasons)
        .filter((t) => !t.completed)
        .map((t) => ({ id: t.id, title: t.title, isGoal: !!t.isGoal, task: t as Task | undefined, goal: undefined as undefined | typeof goals[number] }))
    }
    const year = bounds.start.getFullYear()
    return goals.filter((g) => g.year === year && g.status === 'active' && matchesLayers(g.context, layers))
      .map((g) => ({ id: g.id, title: g.name, isGoal: true, task: undefined as Task | undefined, goal: g }))
  }, [level, bounds.start, seasons, layered, today, meId, goals, layers])
  const aboveName = level === 'month' ? periodBounds('season', bounds.start, seasons).label.replace(/\s+\d{4}$/, '') : String(bounds.start.getFullYear())

  // ── Dates we can't move ────────────────────────────────────────────────
  const { events, available, loading: eventsLoading } = useDayLoadEvents(level === 'month')
  const landmarks = useMemo(() => landmarksIn(events, bounds.start, bounds.end), [events, bounds.start, bounds.end])
  const [openLm, setOpenLm] = useState<string | null>(null)
  const plannedOn = useCallback((l: Landmark) => layered
    .filter((t) => !t.completed && t.scheduledFor && t.scheduledFor >= l.start && t.scheduledFor < new Date(l.end.getFullYear(), l.end.getMonth(), l.end.getDate() + 1))
    .map((t) => ({ id: t.id, title: t.title, day: t.scheduledFor! })), [layered])

  // ── The plan record and the meeting ────────────────────────────────────
  const horizon = level === 'month' ? 'monthly' : 'seasonal'
  const token = level === 'month' ? monthToken(bounds.start) : seasonToken(bounds.start, seasons)
  const session = usePlanningSession(horizon, token)
  const [meeting, setMeeting] = useState<null | { step: 1 | 2; candidateIds: string[] }>(null)
  const [view, setViewState] = useState<PlanView>(() => readPlanView(level))
  const setView = (v: PlanView) => { setViewState(v); writePlanView(level, v) }
  // "Plan this week" read as a gate you had to pass before adding anything
  // (Scott, 2026-09-29). It is the REVIEW: close out what the last period
  // left, write this one with the level above beside it, agree it. It asks
  // for attention only while there is a review to do — the period not yet
  // agreed, or the last one leaving undecided lines — and is quiet after.
  const reviewIds = closeOutCandidates(prevLines.map((l) => l.task), level, prevBounds.start, prevBounds.end).map((t) => t.id)
  const reviewDue = !session.saved || reviewIds.length > 0
  // A guided look-back runs here, on the page it hands to ("pick up where you
  // are", 2026-10-01): the close-out, then the guide moves on. The page's own
  // Plan button steps aside under the guide, so without this a guided run
  // never asked about last period's open lines.
  const { state: guide } = useGuidedPlan()
  const guideNext = useGuideNext()
  const guideStep = guide?.status === 'active' ? currentStep(guide) : null
  const guidedReview = !!guide && guideStep === `${level}-review` && guide.periods[guideStep] === localYmd(bounds.start)
  // Fixed when the look-back opens, so a decided line keeps its card.
  const [reviewSnap, setReviewSnap] = useState<string[] | null>(null)
  if (!guidedReview && reviewSnap !== null) setReviewSnap(null)
  if (guidedReview && !loading && reviewSnap === null) setReviewSnap(reviewIds)
  // Look-back done, the guide's next step is this same page: open it with the
  // level above beside the list, as the guide does for any step.
  const [seenStep, setSeenStep] = useState(guideStep)
  if (seenStep !== guideStep) {
    setSeenStep(guideStep)
    if (guideStep === level) setViewState(readPlanView(level))
  }
  const reviewFinish = (() => {
    if (!guide || !guidedReview) return undefined
    const after = guide.steps[guide.current + 1]
    if (!after) return 'Finish'
    if (after === level) return undefined
    const wso = readCadenceConfig().weekStartsOn
    return `Continue to ${stepShortName(after, guide, seasons, (d) => weekOfYear(d, wso))} →`
  })()
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY)
  const [justSaved, setJustSaved] = useState<null | { detail: string }>(null)
  // After a save, the next level down: a season hands work to its month (the
  // current one, or its first when planning ahead); a month to its week.
  const nextStep = useMemo(() => {
    const wso = readCadenceConfig().weekStartsOn
    return nextAfterSave(level, bounds.start, isCurrent, today, {
      weekStartOf: (d) => weekStartAnchor(d, wso), weekNumber: (d) => weekOfYear(d, wso),
      seasonOf: (d) => { const b = periodBounds('season', d, seasons); return { start: b.start, name: b.label.replace(/\s+\d{4}$/, '') } },
    })
  }, [level, isCurrent, today, bounds.start, seasons])
  const startMeeting = () => {
    const candidateIds = reviewIds
    setTally(EMPTY_TALLY)
    setJustSaved(null)
    setMeeting({ step: candidateIds.length ? 1 : 2, candidateIds })
    // The level above sits beside the list for the whole meeting.
    setViewState('ref')
    window.scrollTo({ top: 0 })
  }
  const endMeeting = async (keep: boolean) => {
    if (keep) {
      const ok = await session.save({ wentWell: session.mine?.wentWell ?? '', didnt: session.mine?.didnt ?? '' })
      if (!ok) { showToast('Couldn’t save the plan — try again.', 'error', 5000); return }
      const open = lines.filter((l) => l.fate === 'open').length
      const done = lines.filter((l) => l.fate === 'done').length
      setJustSaved({ detail: [`${open} open${done ? `, ${done} done` : ''}.`, tallySentence(tally, prevName)].filter(Boolean).join(' ') })
    }
    setMeeting(null)
    setViewState(readPlanView(level))
  }
  const agreedBy = session.saved
    ? (session.saved.authorId === user?.id ? 'you'
      : members.find((m) => m.auth_user_id === session.saved!.authorId)?.name ?? 'your household')
    : null

  // ── Verbs (the writers v1 uses) ────────────────────────────────────────
  const openTask = useCallback((id: string) => {
    if (selection) selection.setSelection({ kind: 'task', id })
    else navigate(`/task/${id}`)
  }, [selection, navigate])
  // The same plan writes v1's row verbs use (Today command, day choice).
  const { setPlanned, reschedule: rescheduleInstance } = useActionableInstances()
  const planActions = useMemo(() => makePlanActions({
    findTask: (id) => tasks.find((t) => t.id === id),
    updateTask: (id, u) => gated.updateTask(id, u),
    pushTask: (id, target) => gated.pushTask(id, target),
    setRoutinePlanned: (id, day, planned) => setPlanned('routine', id, day, planned),
    rescheduleRoutine: (id, from, when) => rescheduleInstance('routine', id, from, when),
    notify: (m) => showToast(m, 'warning'),
  }), [tasks, gated, setPlanned, rescheduleInstance])
  // A season names the month it hands work to (v1's lowerMonth, S3-01).
  const lowerMonth = level === 'season'
    ? (isCurrent ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(bounds.start.getFullYear(), bounds.start.getMonth(), 1))
    : null
  const periodPatch = (b: typeof bounds) => (level === 'month' ? { monthStart: b.start } : { seasonStart: b.start })
  const actions: LineActions = {
    done: async (t) => {
      const was = !!t.completed
      if ((await toggleTask(t.id)) === false) return
      showToast(was ? `Reopened “${t.title}”.` : `Done — “${t.title}”.`, 'success', 5000, { label: 'Undo', onClick: () => { void toggleTask(t.id) } })
    },
    carry: async (t) => {
      if (!(await keepForward(t.id, periodPatch(nextBounds), bounds.start))) return
      showToast(`“${t.title}” carried to ${nextName}. ${name}’s plan keeps the record.`, 'success', 5000)
    },
    someday: async (t) => {
      await gated.updateTask(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
      showToast(`“${t.title}” → Someday.`, 'success', 5000)
    },
    drop: async (t) => {
      // Drop ends THIS period's commitment and keeps the task (v1's look-back
      // rule), rather than deleting it from a hover menu. With nothing else
      // holding it, it waits in the Inbox.
      if (!(await dropCommitment(t.id, level, bounds.start))) return
      showToast(`Dropped “${t.title}” from ${name}. It’s in the Inbox if you want it back.`, 'success', 6000)
    },
    assign: (t, ids) => { void gated.updateTask(t.id, { assignedToAll: ids, assignedTo: ids[0] ?? undefined }) },
    details: (t) => openTask(t.id),
    rename: (t, title) => { void updateTask(t.id, { title }) },
    openPartOf: (link) => navigate(link.rung === 'year' ? `/goals/${link.id}` : `/task/${link.id}`),
    setContext: (t, c) => { void gated.updateTask(t.id, { context: c }) },
    today: async (t) => {
      if (!(await planActions.chooseTaskDay(t.id, new Date()))) return
      showToast(`“${t.title}” is on today — any time. ${name}’s plan keeps it.`, 'success', 5000, { label: 'Open Today', onClick: () => navigate('/today') })
    },
    intoLower: level === 'month'
      ? (isCurrent ? { label: 'Into this week', run: async (t) => { await gated.pushTask(t.id, 'week'); showToast(`“${t.title}” → this week · still on ${name}’s plan.`, 'success', 5000, { label: 'Open week', onClick: () => navigate('/week') }) } } : undefined)
      : lowerMonth ? { label: `Into ${monthName(lowerMonth)}`, run: async (t) => { await gated.updateTask(t.id, { bucket: 'month', monthStart: lowerMonth }); showToast(`“${t.title}” → ${monthName(lowerMonth)} · still on ${name}’s plan.`, 'success', 5000) } } : undefined,
    toggleGoal: async (t) => {
      if (!t.isGoal) { await setGoal(t.id, true); showToast(`“${t.title}” is a goal now.`, 'success', 5000, { label: 'Undo', onClick: () => { void updateTask(t.id, { isGoal: false }) } }); return }
      const check = goalToTaskConversion(t, tasks)
      if (!check.ok) { showToast(`“${t.title}” stays a goal. ${check.reason}`, 'info', 8000); return }
      if ((await updateTask(t.id, { isGoal: false })) === false) { showToast(`Couldn’t change “${t.title}”.`, 'error', 5000); return }
      showToast(`“${t.title}” is a single action again.`, 'success', 5000, { label: 'Undo', onClick: () => { void updateTask(t.id, { isGoal: true }) } })
    },
    unlink: async (t) => {
      const [msg, kind] = removeOutcomeToast(t.title, await setGoalLink(t.id, null, t.goalTaskId ?? null))
      showToast(msg, kind, 6000)
    },
    // The links "+ Add to …" writes, for a line already here. On a month: a
    // goal SUPPORTS a season goal; a plain task is one of its steps. On a
    // season: a goal supports a year goal. A plain season task has no link
    // up that the page can show, so it isn't offered one.
    linkUp: {
      rung: aboveName,
      goals: aboveRows.filter((r) => r.isGoal).map((r) => ({ id: r.id, title: r.title })),
      applies: (t) => level === 'month' || !!t.isGoal,
      run: async (t, goalId) => {
        const goal = aboveRows.find((r) => r.id === goalId)
        let ok: boolean
        if (level === 'season') ok = (await gated.updateTask(t.id, { goalId })) !== false
        else if (t.isGoal) ok = (await gated.updateTask(t.id, { supportsGoalTaskId: goalId })) !== false
        else ok = (await setGoalLink(t.id, goalId, t.goalTaskId ?? null)).status === 'ok'
        showToast(ok ? `“${t.title}” is part of “${goal?.title ?? 'that goal'}” now.` : `Couldn’t link “${t.title}” — try again.`, ok ? 'success' : 'error', 5000)
      },
    },
  }
  const decide = async (vm: LineVM, d: CloseDecision) => {
    const t = vm.task
    setTally((x) => addToTally(x, d))
    if (d === 'carried') await keepForward(t.id, periodPatch(bounds), prevBounds.start)
    else if (d === 'done') { if (!t.completed) await toggleTask(t.id) }
    else if (d === 'someday') await gated.updateTask(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    else if (d === 'dropped') await dropCommitment(t.id, level, prevBounds.start)
  }
  const addArea = useAddArea()
  const addLine = async (title: string) => {
    await addTask(title, undefined, undefined, undefined, {
      bucket: level === 'month' ? 'month' : 'quarter', ...periodPatch(bounds), context: addArea.area,
    })
  }
  // A season task taken into the month is the SAME task, now also on the month.
  const takeIn = async (task: Task) => {
    await gated.updateTask(task.id, { bucket: 'month', monthStart: bounds.start })
    showToast(`“${task.title}” is on ${name}’s plan too.`, 'success', 4000)
  }
  // A child of a line one rung up, written on this period (the week's "+ Step",
  // Scott 2026-09-28). Under a plain season task it is a new month task that
  // remembers where it came from (source_id); under a goal, this period's part
  // of it — a month goal serving a season goal, a season goal under a year goal.
  const addFromAbove = async (row: typeof aboveRows[number], title: string) => {
    if (row.task && !row.isGoal) {
      await addTask(title, undefined, undefined, undefined, {
        bucket: 'month', monthStart: bounds.start, sourceId: row.task.id, goalId: row.task.goalId,
        context: row.task.context ?? soleDomain ?? undefined, assignedTo: meId ?? undefined,
      })
    } else if (row.task) {
      await addTask(title, undefined, undefined, undefined, {
        bucket: 'month', monthStart: bounds.start, isGoal: true, supportsGoalTaskId: row.task.id,
        goalId: row.task.goalId, context: row.task.context ?? soleDomain ?? undefined,
      })
    } else if (row.goal) {
      await addTask(title, undefined, undefined, undefined, {
        bucket: 'quarter', seasonStart: bounds.start, isGoal: true, goalId: row.goal.id, context: row.goal.context ?? soleDomain ?? undefined,
      })
    }
    setChildFor(null)
    showToast(`“${title}” added to ${name}, as part of “${row.title}”.`, 'success', 4000)
  }
  // "+ Add" / "+ Step" open the new line on THIS period's list, naming its
  // parent — the week's rule (Scott, 2026-09-29), not a form under the line.
  const [childFor, setChildFor] = useState<typeof aboveRows[number] | null>(null)
  const [litParent, setLitParent] = useState<string | null>(null)
  const showPartOf = (link: SupportLink) => {
    const el = document.querySelector<HTMLElement>(`[data-ref-id="${link.id}"]`)
    if (!el) { actions.openPartOf(link); return }
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash')
  }

  // ── The month's calendar takes its lines (the week's drag, one rung up) ──
  // A line dropped on a DAY is dated that day; on a WEEK's number it is given
  // that week; back on the list it loses both and stays the month's. A goal is
  // never placed — dropping one puts down its next step, named as the goal is.
  const mobile = useMobile()
  const dragOn = level === 'month' && !mobile
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const [dragId, setDragId] = useState<string | null>(null)
  const weekStartsOn = readCadenceConfig().weekStartsOn
  const thisWeekYmd = localYmd(weekStartAnchor(today, weekStartsOn))
  const monthIds = useMemo(() => {
    const ids = new Set(main.map((l) => l.task.id))
    for (const l of main) if (l.task.isGoal) for (const s of l.steps ?? []) ids.add(s.id)
    return ids
  }, [main])
  const placed = useMemo(() => layered.filter((t) => monthIds.has(t.id) && !t.completed), [layered, monthIds])
  const dayMarks = useCallback((ymd: string): CalMark[] => placed.filter((t) => t.scheduledFor && localYmd(t.scheduledFor) === ymd).map((t) => ({ id: t.id, title: t.title })), [placed])
  const weekMarks = useCallback((ymd: string): CalMark[] => placed.filter((t) => !t.scheduledFor && t.weekStart && localYmd(t.weekStart) === ymd && !t.isGoal).map((t) => ({ id: t.id, title: t.title })), [placed])
  const onDragEnd = async (e: DragEndEvent) => {
    setDragId(null)
    const taskId = (e.active.data.current as { taskId?: string } | undefined)?.taskId
    const over = e.over?.data.current as { kind?: string; ymd?: string } | undefined
    const task = taskId ? tasks.find((t) => t.id === taskId) : undefined
    if (!task || !over?.kind) return
    const { previous } = timingRemoval(task, 'all')
    const undo = () => { void gated.updateTask(task.id, previous) }
    if (over.kind === 'mlist') {
      if (!task.scheduledFor && !lowerPlacement(task, level, bounds.start)) return
      void gated.updateTask(task.id, lineDropUpdates(task, { kind: 'list' }))
      showToast(`“${task.title}” is back on ${name}’s list — no week or day.`, 'success', 6000, { label: 'Undo', onClick: undo })
      return
    }
    const ymd = over.ymd!
    const isDay = over.kind === 'mday'
    if (isDay ? ymd < localYmd(today) : ymd < thisWeekYmd) { showToast(`That ${isDay ? 'day' : 'week'} has passed — put it on today or later.`, 'warning'); return }
    const at = parseLocalYmd(ymd)
    const label = isDay ? shortDay(at) : `week ${weekOfYear(at, weekStartsOn)}`
    if (task.isGoal) {
      const id = await addTask(task.title, undefined, undefined, isDay ? at : undefined, {
        ...(isDay ? { isAllDay: true } : { bucket: 'week' as const, weekStart: at }),
        goalTaskId: task.id, context: task.context ?? undefined, assignedTo: meId ?? undefined,
      })
      if (id) showToast(`A next step for “${task.title}” is on ${label}. Rename it in its details.`, 'success', 7000, { label: 'Undo', onClick: () => { void deleteTask(id) } })
      return
    }
    const ok = await gated.updateTask(task.id, lineDropUpdates(task, { kind: isDay ? 'day' : 'week', at }))
    if (ok === false) return
    showToast(`“${task.title}” → ${label} · still on ${name}’s plan.`, 'success', 6000, { label: 'Undo', onClick: undo })
  }
  const dragTitle = dragId ? tasks.find((t) => `line:${t.id}` === dragId)?.title : null

  // ── Rendering ──────────────────────────────────────────────────────────
  const [openLine, setOpenLine] = useState<string | null>(null)
  const [showDropped, setShowDropped] = useState(false)
  const [draft, setDraft] = useState('')
  const inMeeting = !!meeting
  const tasksLoadFailed = !loading && !!tasksError && tasks.length === 0
  const numeral = level === 'month'
    ? two(bounds.start.getMonth() + 1)
    : `${two(bounds.start.getMonth() + 1)}–${two(new Date(bounds.end.getTime() - 86400000).getMonth() + 1)}`

  const row = (vm: LineVM) => (
    <PlanLine key={vm.task.id} vm={vm} actions={actions} members={members} nextLabel={nextName}
      open={openLine === vm.task.id} onToggle={() => setOpenLine((o) => (o === vm.task.id ? null : vm.task.id))} editable={inMeeting} draggable={dragOn}
      onHoverPartOf={view === 'ref' || inMeeting ? setLitParent : undefined} onShowPartOf={showPartOf} />
  )
  const section = (label: string, vms: LineVM[]) => vms.length ? <><div className="pv2-sect">{label}</div><ul className="pv2-list">{vms.map(row)}</ul></> : null
  const listColumn = (
    <DropZone id="mlist" data={{ kind: 'mlist' }} className="pv2-dropcol">
    <section aria-label={`${name} plan`}>
      <div className="pv2-colh">{inMeeting ? `${name}’s list` : 'Our plan'}<FromPaper altitude={level} periodStart={bounds.start} tasks={layered} /></div>
      {loading && !main.length ? <p className="pv2-hint">Loading…</p> : null}
      {/* A failed read is not an empty plan: "Nothing on October's plan
          yet" over a list that didn't load invites re-writing it. The hook's
          error is also set by failed writes, so it counts only when nothing
          arrived. */}
      {tasksLoadFailed && <LoadFailedNotice variant="inline" className="pv2-hint" buttonClassName="pv2-link"
        title="Your plan didn’t load." onRetry={() => { void refetchTasks() }} />}
      {!loading && !tasksLoadFailed && !main.length && <p className="pv2-hint ds-empty-body">{inMeeting ? 'Nothing yet. Write whatever comes up — no types, no dates needed.' : `Nothing on ${name}’s plan yet. Add a line below, or choose “Plan ${name}” to write it with ${aboveName} beside you.`}</p>}
      {childFor && <ul className="pv2-list"><DraftLine key={childFor.id} parentTitle={childFor.title} isGoal={childFor.isGoal}
        placeholder={childFor.isGoal ? `${name}’s part of it` : `A step for ${name}`}
        onAdd={(t) => void addFromAbove(childFor, t)} onCancel={() => setChildFor(null)} /></ul>}
      {/* A goal and its steps are one group, so two columns never split them. */}
      <ul className={`pv2-list${level === 'season' && view === 'list' && !inMeeting ? ' pv2-brain' : ''}`}>{
        main.reduce<LineVM[][]>((groups, l) => { if (l.nested && groups.length) groups[groups.length - 1].push(l); else groups.push([l]); return groups }, [])
          .map((g) => g.length === 1 ? row(g[0]) : <li key={`g-${g[0].task.id}`} className="pv2-group"><ul className="pv2-list">{g.map(row)}</ul></li>)
      }</ul>
      {/* Always open (Scott, 2026-09-29: "why is it not possible to add items
          directly to the month list?") — the review is for closing out and
          agreeing, not a gate on writing. */}
      <form className="pv2-write" onSubmit={(e) => { e.preventDefault(); const v = draft.trim(); if (v) { void addLine(v); setDraft('') } }}>
        <span className="pv2-dash" aria-hidden="true" />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Add to ${name}`} aria-label={`Add to ${name}`} />
        {addArea.picker}
      </form>
      {section(`Carried to ${nextName}`, carried)}
      {section('Someday', someday)}
      {dropped.length > 0 && <>
        <div className="pv2-sect">Dropped</div>
        {showDropped && <ul className="pv2-list">{dropped.map(row)}</ul>}
        <button type="button" className="pv2-link pv2-quiet" onClick={() => setShowDropped((s) => !s)}>{showDropped ? 'Hide' : 'Show'} {dropped.length} dropped</button>
      </>}
    </section>
    </DropZone>
  )
  const refColumn = (
    <aside className="pv2-ref" aria-label={`${aboveName}, for reference`}>
      <div className="pv2-colh">{aboveName} <small>(for reference)</small></div>
      {aboveRows.length ? (
        <ul className="pv2-list">{aboveRows.map((r) => (
          <li key={r.id} data-ref-id={r.id} className={`pv2-rrow pv2-rrow-sans${litParent === r.id || childFor?.id === r.id ? ' is-linked' : ''}`}>
            {r.isGoal ? <span className="pv2-goal is-small" aria-hidden="true" /> : <span className="pv2-dash" style={{ marginTop: 10 }} aria-hidden="true" />}
            <button type="button" className="flex-1 text-left" onClick={() => (r.task ? openTask(r.task.id) : navigate(`/goals/${r.id}`))}>{r.title}</button>
            <span className="pv2-refacts">
              {r.task && !r.isGoal && <button type="button" className="pv2-addbtn" onClick={() => void takeIn(r.task!)} aria-label={`Add ${r.title} to ${name}`}>+ {level === 'month' ? 'This month' : name}</button>}
              {/* Says where the new line goes (walkthrough 2026-09-30: "+ Add"
                  beside a Fall goal didn't say to what). */}
              <button type="button" className="pv2-addbtn" onClick={() => setChildFor(r)}
                title={r.isGoal ? `Add ${name}’s part of “${r.title}” — it stays linked to that goal` : `Add a step of “${r.title}” to ${name}`}
                aria-label={`Add ${name}’s part of ${r.title}`}>{r.isGoal ? `+ Add to ${name}` : '+ Step'}</button>
            </span>
          </li>
        ))}</ul>
      ) : <p className="pv2-hint ds-empty-body">Nothing written for {aboveName}. That’s fine.</p>}
      {/* What the Shelves held for a month or season, folded in here. */}
      <div className="pv2-refshelves"><PeriodRefRoutines level={level} start={bounds.start} end={bounds.end} noun={NOUN[level].toLowerCase()} /></div>
    </aside>
  )
  const calendar = level === 'month' ? (
    <DatesCalendar start={bounds.start} end={bounds.end} landmarks={landmarks} today={today} selected={openLm} onSelect={setOpenLm}
      onOpenWeek={(ws) => navigate(`/week?start=${localYmd(ws)}`)} available={available || eventsLoading} planned={plannedOn}
      dayMarks={dayMarks} weekMarks={weekMarks} />
  ) : null

  const viewSwitch = <ViewSwitch view={view} onChange={setView} aboveName={aboveName} />
  const toolbar: PlanToolbarProps = {
    period: name, saved: session.saved, loading: session.loading, error: !!session.error, agreedBy,
    reviewDue, onPlan: startMeeting, onRetry: session.reload, viewSwitch, tools: <PeopleFilter />,
    justSaved: justSaved && {
      detail: justSaved.detail,
      // The next page opens with this one's level above beside it.
      next: { label: nextStep.label, onClick: () => { writePlanView(level === 'season' ? 'month' : 'week', 'ref'); navigate(nextStep.to) } },
      onDone: () => setJustSaved(null),
    },
  }
  // Desktop: the control row folds into the masthead; a meeting keeps its bar.
  const folded = !mobile && !inMeeting

  let body: ReactElement
  if (guidedReview && reviewSnap) {
    body = <CloseOut lines={prevLines} candidateIds={reviewSnap} members={members} actions={actions} prevName={prevName} nextName={name}
      onDecide={decide} onFinish={() => void guideNext(guide!)} finishLabel={reviewFinish} />
  } else if (meeting?.step === 1) {
    body = <CloseOut lines={prevLines} candidateIds={meeting.candidateIds} members={members} actions={actions} prevName={prevName} nextName={name}
      onDecide={decide} onFinish={() => setMeeting({ ...meeting, step: 2 })} />
  } else if (view === 'focus') {
    body = <FocusDeck lines={lines} actions={actions} members={members} nextLabel={nextName} context={`${name} plan`} label={`${name}’s plan`}
      empty={inMeeting ? `Nothing on ${name}’s plan yet. Switch to the list to write the first line.` : `Nothing on ${name}’s plan yet. Choose “Plan ${name}” to write it with ${aboveName} beside you.`} />
  } else if (view === 'ref') {
    // One shape on every horizon (Scott, 2026-09-30: "above all else, it has
    // to be consistent"): the period's own time on the left (the Month's
    // dates, as the Week's days), its list in the middle, the level above on
    // the right — as on Week and Today.
    body = <div className={level === 'month' ? 'pv2-grid3' : 'pv2-grid2 is-ref'}>{calendar}{listColumn}{refColumn}</div>
  } else {
    body = level === 'month' ? <div className="pv2-grid2 is-cal-first">{calendar}{listColumn}</div> : listColumn
  }

  return (
    <div className="pv2-page">
      {/* The masthead every horizon wears (Week and Today's MastheadCard):
          the numeral in the margin, "‹ MONTH ›" above the name. A line under
          it only while the review is saying what to do next. */}
      <MastheadCard variant="page" numeral={numeral} title={bounds.label}
        eyebrow={<PeriodNavEyebrow label={NOUN[level]} onPrev={() => goTo(bounds.prev)} onNext={() => goTo(bounds.next)}
          prevLabel={prevName} nextLabel={nextName} trailing={isCurrent ? undefined : (
            // Names where it goes — "Back to September" — so it isn't read as
            // a label for the period on screen (walkthrough 2026-09-30).
            <button type="button" onClick={() => goTo(today)} aria-label={`Back to ${nameOf(periodBounds(level, today, seasons))}`}
              className="period-return ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-primary-100 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-600 transition-colors hover:bg-primary-100">Back to {nameOf(periodBounds(level, today, seasons))}</button>
          )} />}
        // Desktop folds the control row into the masthead (layout system,
        // 2026-10-01): the plan's status is the subline, the views and
        // "Plan <period>" sit at the title's right. Phones keep the row.
        subline={folded ? <PlanToolbarStatus {...toolbar} /> : undefined}
        controls={folded ? <PlanToolbarControls {...toolbar} /> : undefined}
        />

      {inMeeting ? (
        <PlanMeetingBar period={name} prevName={prevName} step={meeting!.step} lookBack={meeting!.candidateIds.length > 0}
          why={meeting!.step === 1 ? lookBackWhy(prevName, name, meeting!.candidateIds.length)
            : `Look at ${aboveName}${level === 'month' ? ' and the calendar' : ''} beside the list, then write what ${name} is for. ${level === 'month' ? 'A quiet month is fine.' : 'A few lines is plenty.'}`}
          onStep={(step) => setMeeting({ ...meeting!, step })}
          viewSwitch={meeting!.step === 2 && meeting!.candidateIds.length === 0 ? viewSwitch : undefined}
          onLeave={() => void endMeeting(false)} onSave={() => void endMeeting(true)} saveLabel={`Mark ${name} planned`} />
      ) : folded ? <GuideAnchor /> : <PlanToolbar {...toolbar} />}

      {dragOn && meeting?.step !== 1 && !guidedReview && view !== 'focus' ? (
        <DndContext sensors={sensors} collisionDetection={pointerWithin}
          onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))} onDragEnd={(e) => void onDragEnd(e)} onDragCancel={() => setDragId(null)}>
          {body}
          <DragOverlay dropAnimation={null}>{dragTitle ? <div className="pv2-dragpill">{dragTitle}</div> : null}</DragOverlay>
        </DndContext>
      ) : body}

    </div>
  )
}

/** /month and /season, v2. Mounts its own GoalsProvider, as v1 does. */
export function PlanPageV2({ level }: { level: Level }) {
  return <GoalsProvider><Inner level={level} /></GoalsProvider>
}
