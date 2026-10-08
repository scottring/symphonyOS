// src/components/plan/v2/PlanPageV2.tsx
//
// The v2 month and season pages (docs/planning/2026-09-28-planning-v2.md).
//
// Lists above the week are for looking (docs/superpowers/specs/
// 2026-10-04-planning-model-design.md): a season is a brainstorm list, a
// month a plain list written with its season beside it. No goals vs tasks,
// no steps or pulls from the level above — it is there to read, and it can be
// hidden. Only a month line may come into a week, quietly, from its menu.
//
// Each horizon has its OWN planning meeting and its own plan (Scott and Iris,
// 2026-09-28). So the page opens on "our plan" — calm, read-only, one toolbar —
// and the meeting is an explicit mode with its own stopping point. The next
// period's meeting opens by closing out the last one, a card at a time.
//
// Nothing new is stored. Lines, fates, people, the plan's "agreed" date and the
// Details pane are the records and writers v1 uses.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
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
import { periodBounds, isCurrentPeriod, selectPeriodTasks } from '@/lib/planning/periodPage'
import {
  lineFate, lineDropUpdates, endedIn, closeOutCandidates, landmarksIn, writePlanView, lookBackOpen, renamedForPeriod,
  type Landmark,
} from '@/lib/planning/v2/planV2'
import type { Task } from '@/types/task'
import { PlanLine, type LineActions, type LineVM } from './PlanLine'
import { DatesCalendar, type CalMark } from './DatesCalendar'
import { useMobile } from '@/hooks/useMobile'
import { readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { CloseOut, type CloseDecision } from './FocusDeck'
import { PlanMeetingBar, PlanSavedLine, PlanToolbar, PlanToolbarControls, PlanToolbarStatus, type PlanToolbarProps } from './PlanStatus'
import { GuideAnchor } from '@/components/guide/GuideBar'
import { EMPTY_TALLY, addToTally, decidedSentence, lookBackWhy, planWhy, nextAfterSave, type Tally } from '@/lib/planning/v2/planTally'
import { FromPaper } from './FromPaper'
import { useAddArea } from './AddArea'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { planPeopleLens } from '@/lib/planning/peopleLens'
import { makePlanActions, timingRemoval } from '@/lib/planning/planActions'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useColumnsFitWindow } from '@/hooks/useColumnsFitWindow'
import { LoadFailedNotice } from '@/components/common/LoadFailedNotice'
import { useGuidedPlan } from '@/hooks/useGuidedPlan'
import { useGuideNext } from '@/components/guide/GuideBar'
import { currentStep, stepShortName } from '@/lib/guide/guidedPlan'
import { PLANNING_PAGE_CLASS } from '@/components/layout/pageLayout'
import { didFor, writtenFor } from '@/lib/week/monthLinks'
import { SeasonBand } from './PeriodShape'
import { LineCard } from './LineCard'
import { useHiddenAfterAdd } from '@/hooks/useHiddenAfterAdd'
import { ActiveViewLine } from '@/components/common/ViewFilterNotice'

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
  const { tasks, loading, error: tasksError, refetch: refetchTasks, toggleTask, updateTask, addTask, pushTask, keepForward, dropCommitment, updateTasksBulk } = useSupabaseTasks()
  const gated = useGatedTaskActions({ updateTask, pushTask, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))
  const { layers } = useDomain()
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
  const toVM = useCallback((t: Task, b: typeof bounds): LineVM => {
    const fate = lineFate(t, level, b.start, b.end)
    const lower = t.completed ? null : lowerPlacement(t, level, b.start)
    const where = t.completed
      ? `Done${t.completedAt ? ` ${shortDay(t.completedAt)}` : ''}`
      : lower ? lower.label.replace(/^./, (c) => c.toUpperCase()) : null
    // Brought in from the period before by its look-back: say so at rest.
    const prevStart = periodBounds(level, b.prev, seasons).start.getTime()
    const carriedIn = (t.commitments ?? []).some((c) => c.level === level && c.status === 'carried' && c.periodStart.getTime() === prevStart)
    const carriedFrom = carriedIn ? (level === 'month' ? monthName(b.prev) : periodBounds(level, b.prev, seasons).label.replace(/\s+\d{4}$/, '')) : undefined
    // What the weeks did for the line (Scott, 2026-10-04).
    const did = didFor(t.id, layered, weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn))
    return { task: t, fate, partOf: null, where, carriedFrom, did }
  }, [level, seasons, layered])

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

  // One flat list: nothing nests under a goal (Scott, 2026-10-04).
  const mainAll = lines.filter((l) => l.fate === 'open' || l.fate === 'done')
  const main = mainAll
  const carried = lines.filter((l) => l.fate === 'carried')
  const someday = lines.filter((l) => l.fate === 'someday')
  const dropped = lines.filter((l) => l.fate === 'dropped')

  // ── The level above, for reference ─────────────────────────────────────
  const aboveRows = useMemo(() => {
    if (level === 'month') {
      const b = periodBounds('season', bounds.start, seasons)
      // The whole list, done lines struck at the end: it keeps its own review.
      return selectPeriodTasks(layered, 'season', b.start, isCurrentPeriod(b, today), meId, seasons)
        .sort((a, c) => Number(a.completed) - Number(c.completed))
        .map((t) => ({ id: t.id, title: t.title, done: !!t.completed, task: t as Task | undefined }))
    }
    const year = bounds.start.getFullYear()
    return goals.filter((g) => g.year === year && g.status === 'active' && matchesLayers(g.context, layers))
      .map((g) => ({ id: g.id, title: g.name, done: false, task: undefined as Task | undefined }))
  }, [level, bounds.start, seasons, layered, today, meId, goals, layers])
  const aboveName = level === 'month' ? periodBounds('season', bounds.start, seasons).label.replace(/\s+\d{4}$/, '') : String(bounds.start.getFullYear())

  // ── Dates we can't move ────────────────────────────────────────────────
  // The month's calendar, and the season band's landmarks.
  const { events, available, loading: eventsLoading } = useDayLoadEvents(true)
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
  // The level above beside the list: the season beside a month by default;
  // the year beside a season only when asked for — it is reference (Scott,
  // 2026-10-04: "doesn't need to show by default"). Remembered per device.
  const refKey = `symphony-${level}-ref`
  const [refOpen, setRefOpenState] = useState(() => {
    try { const v = localStorage.getItem(refKey); return v ? v === 'open' : level === 'month' } catch { return level === 'month' }
  })
  const setRefOpen = (open: boolean) => { setRefOpenState(open); try { localStorage.setItem(refKey, open ? 'open' : 'shut') } catch { /* this visit only */ } }
  // "Plan this week" read as a gate you had to pass before adding anything
  // (Scott, 2026-09-29). It is the REVIEW: close out what the last period
  // left, write this one with the level above beside it, agree it. It asks
  // for attention only while there is a review to do — the period not yet
  // agreed, or the last one leaving undecided lines — and is quiet after.
  const reviewIds = lookBackOpen(level, prevBounds.end, today)
    ? closeOutCandidates(prevLines.map((l) => l.task), level, prevBounds.start, prevBounds.end).map((t) => t.id)
    : []
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
    window.scrollTo({ top: 0 })
  }
  const endMeeting = async (keep: boolean) => {
    if (keep) {
      const ok = await session.save({ wentWell: session.mine?.wentWell ?? '', didnt: session.mine?.didnt ?? '' })
      if (!ok) { showToast('Couldn’t save the plan — try again.', 'error', 5000); return }
      setJustSaved({ detail: decidedSentence(tally, prevName) })
    }
    setMeeting(null)
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
  const periodPatch = (b: typeof bounds) => (level === 'month' ? { monthStart: b.start } : { seasonStart: b.start })
  const actions: LineActions = {
    done: async (t) => {
      const was = !!t.completed
      if ((await toggleTask(t.id)) === false) return
      showToast(was ? `Reopened “${t.title}”.` : `Done — “${t.title}”.`, 'success', 5000, { label: 'Undo', onClick: () => { void toggleTask(t.id) } })
    },
    carry: async (t) => {
      if (!(await keepForward(t.id, periodPatch(nextBounds), bounds.start))) return
      const renamed = renamedForPeriod(t.title, name, nextName)
      showToast(`“${t.title}” carried to ${nextName}. ${name}’s plan keeps the record.`, 'success', renamed ? 9000 : 5000,
        renamed ? { label: `Rename to “${renamed}”`, onClick: () => { void updateTask(t.id, { title: renamed }) } } : undefined)
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
    // Only a month line comes down, and only into the week, from its menu
    // (Scott, 2026-10-04: "probably only very rarely … from the month list").
    setContext: (t, c) => { void gated.updateTask(t.id, { context: c }) },
    setNotes: (t, notes) => { void gated.updateTask(t.id, { notes }) },
    today: async (t) => {
      if (!(await planActions.chooseTaskDay(t.id, new Date()))) return
      showToast(`“${t.title}” is on today — any time. ${name}’s plan keeps it.`, 'success', 5000, { label: 'Open Today', onClick: () => navigate('/today') })
    },
    intoLower: level === 'month'
      ? (isCurrent ? { label: 'Into this week', run: async (t) => { await gated.pushTask(t.id, 'week'); showToast(`“${t.title}” → this week · still on ${name}’s list.`, 'success', 5000, { label: 'Open week', onClick: () => navigate('/week') }) } } : undefined)
      : undefined,
  }
  const decide = async (vm: LineVM, d: CloseDecision) => {
    const t = vm.task
    setTally((x) => addToTally(x, d))
    if (d === 'carried') {
      await keepForward(t.id, periodPatch(bounds), prevBounds.start)
      // "Come up with October business plan", now November's: offer the
      // new name rather than keep a title that names the wrong month (#29).
      const renamed = renamedForPeriod(t.title, prevName, name)
      if (renamed) showToast(`“${t.title}” carried to ${name}.`, 'success', 9000, { label: `Rename to “${renamed}”`, onClick: () => { void updateTask(t.id, { title: renamed }) } })
    }
    else if (d === 'done') { if (!t.completed) await toggleTask(t.id) }
    else if (d === 'someday') await gated.updateTask(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    else if (d === 'dropped') await dropCommitment(t.id, level, prevBounds.start)
  }
  const addArea = useAddArea()
  // A line the people or area filter hides says so, beside the add row.
  const afterAdd = useHiddenAfterAdd(members)
  const addLine = async (title: string) => {
    const id = await addTask(title, undefined, undefined, undefined, {
      bucket: level === 'month' ? 'month' : 'quarter', ...periodPatch(bounds), context: addArea.area,
    })
    // Written unassigned, in the add row's area: the same facts the insert carries.
    if (id) afterAdd.report({ context: addArea.area ?? null }, name)
  }
  // Arriving from the level above's "Choose what … takes on", the page opens
  // ready to write: the cursor in "Add to …", not another button to press
  // (walkthrough 2026-10-02 #11/#16).
  const addRef = useRef<HTMLInputElement>(null)
  const location = useLocation()
  const arrivedToWrite = !!(location.state as { write?: boolean } | null)?.write
  useEffect(() => { if (arrivedToWrite && !loading) addRef.current?.focus() }, [arrivedToWrite, loading])

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
  const monthIds = useMemo(() => new Set(main.map((l) => l.task.id)), [main])
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
    // Every line moves the same way, an old goal line too (2026-10-04).
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

  const row = (vm: LineVM, grouped = false) => (
    <PlanLine key={vm.task.id} vm={vm} actions={actions} members={members} nextLabel={nextName}
      open={openLine === vm.task.id} onToggle={() => setOpenLine((o) => (o === vm.task.id ? null : vm.task.id))} editable={inMeeting} draggable={dragOn}
      hideParent={grouped} />
  )
  // A goal and its steps are one group, so two columns never split them.
  const lineGroups = (vms: LineVM[], grouped: boolean) =>
    vms.reduce<LineVM[][]>((groups, l) => { if (l.nested && groups.length) groups[groups.length - 1].push(l); else groups.push([l]); return groups }, [])
      .map((g) => g.length === 1 ? row(g[0], grouped) : <li key={`g-${g[0].task.id}`} className="pv2-group"><ul className="pv2-list">{g.map((v) => row(v, grouped))}</ul></li>)
  const section = (label: string, vms: LineVM[]) => vms.length ? <><div className="pv2-sect">{label}</div><ul className="pv2-list">{vms.map((v) => row(v))}</ul></> : null
  const listColumn = (
    <DropZone id="mlist" data={{ kind: 'mlist' }} className="pv2-dropcol">
    <section aria-label={`${name} plan`}>
      <div className="pv2-colh">{inMeeting ? `${name}’s list` : level === 'season' ? `${name}: everything we want in it` : `${name}’s list`}<FromPaper altitude={level} periodStart={bounds.start} tasks={layered} /></div>
      {!refOpen && (
        <button type="button" className="wk-reflink is-inline" onClick={() => setRefOpen(true)}>
          <span>{aboveName} list</span><small>for reference</small>
        </button>
      )}
      <ActiveViewLine members={members} className="mb-2" />
      {loading && !main.length ? <p className="pv2-hint">Loading…</p> : null}
      {/* A failed read is not an empty plan: "Nothing on October's plan
          yet" over a list that didn't load invites re-writing it. The hook's
          error is also set by failed writes, so it counts only when nothing
          arrived. */}
      {tasksLoadFailed && <LoadFailedNotice variant="inline" className="pv2-hint" buttonClassName="pv2-link"
        title="Your plan didn’t load." onRetry={() => { void refetchTasks() }} />}
      {!loading && !tasksLoadFailed && !main.length && <p className="pv2-hint ds-empty-body">{inMeeting ? 'Nothing yet. Write whatever comes up — no types, no dates needed.'
        : level === 'season' ? `Nothing on ${name}’s list yet. Write everything you’d like ${name} to hold — no types, no dates.`
        : `Nothing on ${name}’s list yet. Add a line below.`}</p>}
      {level === 'season' ? (
        // The season's brainstorm, as a board of large lines (2026-10-04);
        // under each, what the months wrote for it.
        <ul className={`ps-board${refOpen ? ' is-narrow' : ''}`}>{main.map((vm) => (
          <LineCard key={vm.task.id} vm={vm} actions={actions} nextLabel={nextName} members={members}
            did={writtenFor(vm.task.id, layered, (t) => (t.monthStart ?? t.weekStart ?? t.scheduledFor ?? t.createdAt).toLocaleDateString('en-US', { month: 'short' }))} />
        ))}</ul>
      ) : <ul className="pv2-list">{lineGroups(main, false)}</ul>}
      {/* Always open (Scott, 2026-09-29: "why is it not possible to add items
          directly to the month list?") — the review is for closing out and
          agreeing, not a gate on writing. */}
      <form className="pv2-write" data-guide-target="period-add" onSubmit={(e) => { e.preventDefault(); const v = draft.trim(); if (v) { void addLine(v); setDraft('') } }}>
        <span className="pv2-dash" aria-hidden="true" />
        <input ref={addRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Add to ${name}`} aria-label={`Add to ${name}`} />
        {addArea.picker}
      </form>
      {afterAdd.notice && <div className="mb-2">{afterAdd.notice}</div>}
      {section(`Carried to ${nextName}`, carried)}
      {section('Someday', someday)}
      {dropped.length > 0 && <>
        <div className="pv2-sect">Dropped</div>
        {showDropped && <ul className="pv2-list">{dropped.map((v) => row(v))}</ul>}
        <button type="button" className="pv2-link pv2-quiet" onClick={() => setShowDropped((s) => !s)}>{showDropped ? 'Hide' : 'Show'} {dropped.length} dropped</button>
      </>}
    </section>
    </DropZone>
  )
  // The level above, plain, to read (Scott, 2026-10-04: "they're just
  // lists"): no goal marks, no "+ Step" or "+ This month".
  const refColumn = (
    <aside className="pv2-ref" aria-label={`${aboveName}, for reference`}>
      <div className="pv2-refsec">
      <div className="pv2-colh">{aboveName} <small>for reference</small>
        <button type="button" className="pv2-link pv2-quiet wk-refhide" onClick={() => setRefOpen(false)}>Hide</button>
      </div>
      {aboveRows.length ? (
        <ul className="pv2-list">{aboveRows.map((r) => (
          <li key={r.id} data-ref-id={r.id} className="pv2-rrow pv2-rrow-sans is-stacked">
            <span className="pv2-dash" style={{ marginTop: 10 }} aria-hidden="true" />
            <button type="button" className={`flex-1 text-left${r.done ? ' line-through text-neutral-400' : ''}`} onClick={() => (r.task ? openTask(r.task.id) : navigate(`/goals/${r.id}`))}>{r.title}</button>
          </li>
        ))}</ul>
      ) : <p className="pv2-hint ds-empty-body">Nothing written for {aboveName}. That’s fine.</p>}
      </div>
    </aside>
  )
  const calendar = level === 'month' ? (
    <DatesCalendar start={bounds.start} end={bounds.end} landmarks={landmarks} today={today} selected={openLm} onSelect={setOpenLm}
      onOpenWeek={(ws) => navigate(`/week?start=${localYmd(ws)}`)} available={available || eventsLoading} planned={plannedOn}
      dayMarks={dayMarks} weekMarks={weekMarks} />
  ) : null

  const toolbar: PlanToolbarProps = {
    period: name, saved: session.saved, loading: session.loading, error: !!session.error, agreedBy,
    reviewDue, onPlan: startMeeting, onRetry: session.reload,
    lookBack: reviewIds.length ? prevName : null, onMark: () => void endMeeting(true), hasLines: mainAll.length > 0,
    justSaved: justSaved && {
      detail: justSaved.detail,
      // The next page opens with this one's level above beside it, ready to write.
      next: { label: nextStep.label, onClick: () => { writePlanView(level === 'season' ? 'month' : 'week', 'ref'); navigate(nextStep.to, { state: { write: true } }) } },
      onDone: () => setJustSaved(null),
    },
  }
  // Desktop: the control row folds into the masthead; a meeting keeps its bar.
  const folded = !mobile && !inMeeting

  // Side-by-side columns scroll on their own, as on Week (layout system §8);
  // the ref follows whichever grid is on screen.
  const grid = useColumnsFitWindow()
  let body: ReactElement
  if (guidedReview && reviewSnap) {
    body = <CloseOut lines={prevLines} candidateIds={reviewSnap} members={members} actions={actions} prevName={prevName} nextName={name}
      onDecide={decide} onFinish={() => void guideNext(guide!)} finishLabel={reviewFinish} />
  } else if (meeting?.step === 1) {
    body = <CloseOut lines={prevLines} candidateIds={meeting.candidateIds} members={members} actions={actions} prevName={prevName} nextName={name}
      onDecide={decide} onFinish={() => setMeeting({ ...meeting, step: 2 })} />
  } else if (level === 'month') {
    // October written with Fall beside it, then its dates (Scott,
    // 2026-10-04). The level above can be hidden.
    body = refOpen
      ? <div ref={grid} className="pv2-grid3 is-colscroll">{refColumn}{listColumn}{calendar}</div>
      : <div ref={grid} className="pv2-grid2 is-cal-last is-colscroll">{listColumn}{calendar}</div>
  } else {
    body = refOpen ? <div ref={grid} className="pv2-grid2 is-ref is-colscroll">{refColumn}{listColumn}</div> : listColumn
  }

  return (
    <div className={`pv2-page ${PLANNING_PAGE_CLASS} is-${level}`}>
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
          why={meeting!.step === 1 ? lookBackWhy(prevName, name, meeting!.candidateIds.length - (tally.carried + tally.done + tally.someday + tally.dropped + tally.left))
            : planWhy(level, name, aboveName, mainAll.length)}
          onStep={(step) => setMeeting({ ...meeting!, step })}
          onLeave={() => void endMeeting(false)} onSave={() => void endMeeting(true)} saveLabel={`Mark ${name} planned`} />
      ) : folded ? <><GuideAnchor /><PlanSavedLine period={name} justSaved={toolbar.justSaved} /></> : <PlanToolbar {...toolbar} />}

      {level === 'season' && meeting?.step !== 1 && !guidedReview && (
        // The season's shape: its months, today, its landmarks.
        <SeasonBand start={bounds.start} end={bounds.end} today={today} name={name}
          marks={landmarks.map((l) => ({ id: l.id, title: l.title, at: l.start }))} />
      )}
      {dragOn && meeting?.step !== 1 && !guidedReview ? (
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
