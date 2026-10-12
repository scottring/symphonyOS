// src/components/plan/v2/WeekV2.tsx
//
// Week (docs/superpowers/specs/2026-10-04-planning-model-design.md): the week
// and the day are for doing. At rest the page is WeekViewV2's week canvas.
// "Plan the week" opens the session around it, in Scott's order (2026-10-12):
//
//   1 Inbox          choose the captures that need to happen this week
//   2 Last week      bring forward, deliberately, what still matters
//   3 Monthly goals  write the week's tasks with the month's goals beside them
//   4 Days & times   give the tasks their days (times optional) beside the
//                    calendar: events, routines and work already dated
//
// One complete weekly list builds through all four steps and never moves: it
// is the Month board's primary collection (canvas-plan.css), and the column
// beside it is the step's source — the Inbox, last week's list, the month's
// goals, then the days. Hiding the source never loses words or moves a task.
// "Review last week" opens step 2 directly; "Leave for now" keeps the step
// and any half-typed words (useSessionProgress, this browser only), and
// coming back continues there. Finishing marks the week planned
// (usePlanningSession) and shows what it holds.

import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { usePlanningSession, weekToken } from '@/hooks/usePlanningSession'
import { useSessionProgress } from '@/hooks/useSessionProgress'
import { useAuth } from '@/hooks/useAuth'
import { showToast } from '@/hooks/useToast'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { applyTriageWhen, describeTriageWhen } from '@/lib/triage/applyWhen'
import { placementSnapshot } from '@/lib/triage/feedback'
import { weekListTasks } from '@/lib/planning/weekList'
import { selectPeriodTasks } from '@/lib/planning/periodPage'
import { monthStartOf, monthsOfWeek } from '@/lib/planning/periodPlacement'
import { PlanMastheadSlotsContext } from './planMastheadSlots'
import { PlanMeetingBar, PlanSavedLine, PlanToolbar, PlanToolbarControls, PlanToolbarStatus, type PlanToolbarProps } from './PlanStatus'
import { GuideAnchor } from '@/components/guide/GuideBar'
import { EMPTY_TALLY, addToTally, decidedSentence, type Tally } from '@/lib/planning/v2/planTally'
import { readSeasons } from '@/lib/cadence/seasons'
import { readCadenceConfig, localYmd } from '@/lib/cadence/config'
import { weekOfYear } from '@/lib/planning/horizonNumerals'
import { writePlanView, lineDropUpdates, lookBackOpen, dayNamedIn } from '@/lib/planning/v2/planV2'
import type { Task, TaskContext } from '@/types/task'
import type { LineActions, LineVM } from './PlanLine'
import type { CloseDecision } from './FocusDeck'
import { FromPaper } from './FromPaper'
import { WeekListV2 } from './WeekListV2'
import { useAddArea } from './AddArea'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { planPeopleLens } from '@/lib/planning/peopleLens'
import { makePlanActions, timingRemoval } from '@/lib/planning/planActions'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useDayPlan } from '@/hooks/useDayPlan'
import { committedTo } from '@/lib/placement/model'
import type { FamilyMember } from '@/types/family'
import { WeekStepMain } from './WeekStepScreen'
import { linkedLine, monthLinkUpdates, monthLinkRestore } from '@/lib/week/monthLinks'
import { MonthLink } from './MonthLink'
import { useColumnsFitWindow } from '@/hooks/useColumnsFitWindow'
import { InboxSource, LastWeekSource, MonthGoalsSource, SourceHead, Fold, type LastWeekRow, type RowState } from './WeekStepPanels'

const DAY = 86_400_000

/** What the days are asked to show (WeekJournal). */
export interface DaysOptions {
  show?: 'all' | 'fixed'; routinesOpen?: boolean; readOnly?: boolean
  variant?: 'strip' | 'shape'; person?: string; members?: FamilyMember[]
  /** Every-day routines in the days (the page's Hide / Show). */
  dailyRoutines?: boolean
  /** "for October: Plan Thanksgiving" — the month line a task was written for. */
  forLabel?: (task: Task) => string | null
  /** The same, as a control that changes or removes it (2026-10-08). */
  forControl?: (task: Task) => ReactNode
}

/** Scott's four steps for planning the coming week, in his order (2026-10-12). */
export type WeekStep = 'inbox' | 'lastweek' | 'goals' | 'days'
const WEEK_STEPS: { key: WeekStep; label: string }[] = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'lastweek', label: 'Last week' },
  { key: 'goals', label: 'Monthly goals' },
  { key: 'days', label: 'Days & times' },
]
const isWeekStep = (s: string | undefined): s is WeekStep => WEEK_STEPS.some((x) => x.key === s)

/** Where a row came from, said on it for a moment as it joins the list. */
const ARRIVED_MS = 2400
const LINKED_MS = 1800
const SOURCE_KEY = 'symphony.week.sourceShown'
const readSourceShown = () => { try { return localStorage.getItem(SOURCE_KEY) !== 'hidden' } catch { return true } }

/** What the week canvas needs from the session that only this page holds. */
export interface WeekCanvasHost {
  /** Last week's open work waiting for a deliberate decision. */
  lastWeekOpen: number
  /** Opens the session on its look-back step ("Review last week"). */
  onLookBack: () => void
  /** Arrived to write (the month's "Choose what week N takes on"). */
  arrivedToWrite: boolean
}

export function WeekV2({ tasks, weekStart, meId, isCurrent, days, renderDays, onSelectTask, timingControl, dragEnabled = true, tools, canvas }: {
  /** The week at rest, as approved (2026-10-10): WeekViewV2's week canvas. */
  canvas?: ReactNode | ((host: WeekCanvasHost) => ReactNode)
  /** Layer-filtered tasks, as the week receives them. */
  tasks: Task[]
  weekStart: Date
  meId: string | null
  isCurrent: boolean
  /** v1's session (WeekPlanHost) — v2 runs its own meeting instead. */
  onPlan?: () => void
  /** v1's list, no longer drawn in v2. */
  list?: ReactNode
  /** The week's own "when" control, as WeekViewV2 builds it. */
  timingControl?: (task: Task) => ReactNode
  /** Rows drag onto the days (off on touch-width layouts). */
  dragEnabled?: boolean
  /** The week's display toggles, drawn in this toolbar. */
  tools?: ReactNode
  /** The journal of days, as WeekViewV2 builds it (a fixed node — tests). */
  days?: ReactNode
  /** The days, asked for what the session needs. Preferred over `days`. */
  renderDays?: (opts: DaysOptions) => ReactNode
  onSelectTask: (id: string) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const arrivedState = location.state as { write?: boolean; plan?: boolean } | null
  // Arriving from the month's "Choose what week N takes on": ready to write.
  const arrivedToWrite = !!arrivedState?.write
  const { user } = useAuth()
  const { toggleTask, updateTask, pushTask, updateTasksBulk, keepForward, dropCommitment, addTask, deleteTask, loading: tasksLoading } = useSupabaseTasks()
  const gated = useGatedTaskActions({ updateTask, pushTask, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))
  const { members } = useFamilyMembers()
  const addArea = useAddArea()
  const activity = useCanvasActivity()
  const { setPlanned, reschedule: rescheduleInstance } = useActionableInstances()
  const planActions = useMemo(() => makePlanActions({
    findTask: (id) => tasks.find((t) => t.id === id),
    updateTask: (id, u) => gated.updateTask(id, u),
    pushTask: (id, target) => gated.pushTask(id, target),
    setRoutinePlanned: (id, day, planned) => setPlanned('routine', id, day, planned),
    rescheduleRoutine: (id, from, when) => rescheduleInstance('routine', id, from, when),
    notify: (m) => showToast(m, 'warning'),
  }), [tasks, gated, setPlanned, rescheduleInstance])
  const token = weekToken(weekStart)
  const session = usePlanningSession('weekly', token)
  const progressApi = useSessionProgress('weekly', token)
  const progress = progressApi.progress
  const weekKey = localYmd(weekStart)
  const weekNo = weekOfYear(weekStart, readCadenceConfig().weekStartsOn)
  const weekName = isCurrent ? 'this week' : `week ${weekNo}`
  const prevName = 'last week'
  const range = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(weekStart.getTime() + 6 * DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  // ── The page's filters: the top bar's people lens over layer-filtered tasks.
  // Every list, count and preview below reads through it.
  const [people] = useAssigneeFilter()
  const lens = useMemo(() => planPeopleLens(people, meId), [people, meId])

  // The week's own month (its middle day) names it; the goals shown are every
  // month the week touches, so a week across a month end shows both.
  const monthStart = useMemo(() => monthStartOf(new Date(weekStart.getTime() + 3 * DAY)), [weekStart])
  const refMonths = useMemo(() => monthsOfWeek(weekStart).map((start) => {
    const name = start.toLocaleDateString('en-US', { month: 'long' })
    // Legacy undated rows answer to the current period: the week's own month.
    const current = isCurrent && start.getTime() === monthStart.getTime()
    const rows = selectPeriodTasks(tasks, 'month', start, current, lens.scopeId, readSeasons()).filter(lens.keep)
    return { start, name, rows }
  }), [tasks, weekStart, monthStart, isCurrent, lens])
  const monthName = refMonths.map((m) => m.name).join(' and ')

  // The whole week: every task committed to it, dated or not.
  const allWeek = useMemo(() => weekListTasks(tasks, weekStart, lens.scopeId, { isCurrent }).filter(lens.keep), [tasks, weekStart, lens, isCurrent])
  const prevWeek = useMemo(() => new Date(weekStart.getTime() - 7 * DAY), [weekStart])
  const nextWeek = useMemo(() => new Date(weekStart.getTime() + 7 * DAY), [weekStart])
  const prevTasks = useMemo(() => weekListTasks(tasks, prevWeek, lens.scopeId, { isCurrent: false }).filter(lens.keep), [tasks, prevWeek, lens])

  const toVM = (t: Task, anyDay: string): LineVM => ({
    task: t, fate: t.completed ? 'done' : 'open', partOf: null,
    where: t.scheduledFor ? t.scheduledFor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : anyDay,
  })
  const lines: LineVM[] = allWeek.map((t) => toVM(t, `Any day ${weekName}`))
  // Unfinished work from earlier weeks, decided in the look-back after last
  // week's own (Scott, 2026-10-03: "move earlier into look back").
  const now = useMemo(() => new Date(), [])
  const { plan: dayPlan } = useDayPlan(now, weekStart)
  const onLastWeek = new Set(prevTasks.map((t) => t.id))
  const earlierLines: LineVM[] = (dayPlan?.unfinished ?? []).flatMap((e) =>
    e.task && !e.completed && !onLastWeek.has(e.task.id) && !committedTo(e.task, 'week', weekStart, { isCurrent }) && lens.keep(e.task)
      ? [{ ...toVM(e.task, 'Not in a week yet'), origin: e.context ?? 'Unfinished' }]
      : [])
  // Last week's open work: the work given a day was the most firmly meant
  // (walkthrough 2026-10-02 #33); work already dated into this week or later
  // is in hand. Nothing here is decided by itself.
  const lastWeekOpen = prevTasks.filter((t) => !t.completed && (!t.scheduledFor || t.scheduledFor < weekStart))
  // The page asks for the review only once that week has reached its last day (#34).
  const reviewDue = lookBackOpen('week', weekStart, new Date())
  const reviewCount = reviewDue ? lastWeekOpen.length + earlierLines.length : 0

  // ── Which month goal a week task is for (2026-10-08) ─────────────────────
  const goalIds = useMemo(() => new Set(refMonths.flatMap((m) => m.rows.map((t) => t.id))), [refMonths])
  const forOptions = { month: monthName, lines: refMonths.flatMap((m) => m.rows.filter((t) => !t.completed).map((t) => ({ id: t.id, title: t.title }))) }
  const forLine = (t: Task) => {
    const l = linkedLine(t, tasks)
    if (!l) return null
    return { id: l.id, title: l.title, month: (l.monthStart ?? monthStart).toLocaleDateString('en-US', { month: 'long' }) }
  }
  const isWeekItem = (t: Task) => !t.completed && !t.isGoal && !goalIds.has(t.id) && !!committedTo(t, 'week', weekStart, { isCurrent })

  // ── Motion that explains a saved change (reduced-motion safe in CSS) ────
  const [arrived, setArrived] = useState<Record<string, string>>({})
  const timers = useRef<number[]>([])
  useEffect(() => () => { for (const t of timers.current) window.clearTimeout(t) }, [])
  const markArrived = (id: string, tag: string) => {
    setArrived((a) => ({ ...a, [id]: tag }))
    timers.current.push(window.setTimeout(() => setArrived((a) => { const n = { ...a }; delete n[id]; return n }), ARRIVED_MS))
  }
  const [linked, setLinked] = useState<{ child: string; parent: string } | null>(null)
  useEffect(() => {
    if (!linked) return
    const t = window.setTimeout(() => setLinked(null), LINKED_MS)
    return () => window.clearTimeout(t)
  }, [linked])

  // ── Writes. Each goes through the canvas activity (saving / saved / didn't
  // save, Undo, Retry) and reports whether it was stored.
  const [rowState, setRowState] = useState<Record<string, RowState>>({})
  const setRow = (id: string, s: RowState) => setRowState((x) => { const n = { ...x }; if (s) n[id] = s; else delete n[id]; return n })

  const setMonthLine = async (t: Task, lineId: string | null) => {
    const { updates, revealed } = monthLinkUpdates(t, lineId)
    if (!Object.keys(updates).length) return
    const before = monthLinkRestore(t, updates)
    const line = lineId ? tasks.find((x) => x.id === lineId) : null
    const still = revealed ? tasks.find((x) => x.id === revealed) : null
    const ok = await activity.run(line ? `“${t.title}” is for ${line.title}`
      : still ? `“${t.title}” is no longer written for that goal; it is still a step of “${still.title}”`
      : `“${t.title}” is no longer tied to a month goal`,
      async () => (await updateTask(t.id, updates)) !== false,
      { ids: [t.id], undo: async () => (await updateTask(t.id, before)) !== false })
    if (ok && lineId) setLinked({ child: t.id, parent: lineId })
  }

  // One add path for the list and the goal cards: "Talk to Tim on Monday"
  // lands on Monday in one write; `forId` links it to its month goal in the
  // same write. Resolves the new id only once stored.
  const addWeekItem = async (title: string, forId?: string): Promise<string | null> => {
    const day = dayNamedIn(title, weekStart, new Date())
    const goal = forId ? tasks.find((x) => x.id === forId) : null
    const opts: { ids: string[]; undo?: () => Promise<boolean | void> } = { ids: [] }
    let created: string | null = null
    const ok = await activity.run(goal ? `Add “${title}” for ${goal.title}` : `Add “${title}” to ${weekName}`, async () => {
      const id = await addTask(title, undefined, undefined, day ?? undefined, {
        bucket: 'week', weekStart, assignedTo: meId ?? undefined, context: addArea.area ?? goal?.context ?? undefined,
        ...(day ? { isAllDay: true } : {}), ...(forId ? { sourceId: forId } : {}),
      })
      if (!id) return false
      created = id
      opts.ids.push(id)
      opts.undo = async () => { await deleteTask(id) }
      return true
    }, opts)
    if (!ok || !created) return null
    if (forId) setLinked({ child: created, parent: forId })
    if (day) showToast(`“${title}” → ${day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}, any time.`, 'success', 5000)
    return created
  }

  const actions: LineActions = {
    done: async (t) => { await activity.run(t.completed ? `Reopen “${t.title}”` : `Done: “${t.title}”`, async () => (await toggleTask(t.id)) !== false, { ids: [t.id], undo: async () => (await toggleTask(t.id)) !== false }) },
    carry: async (t) => { if (await keepForward(t.id, { weekStart: nextWeek }, weekStart)) showToast(`“${t.title}” moved to next week.`, 'success', 5000) },
    someday: async (t) => { await gated.updateTask(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined }); showToast(`“${t.title}” → Someday.`, 'success', 5000) },
    drop: async (t) => { if (await dropCommitment(t.id, 'week', weekStart)) showToast(`Dropped “${t.title}” from ${weekName}. It’s in the Inbox if you want it back.`, 'success', 6000) },
    assign: (t, ids) => { void gated.updateTask(t.id, { assignedToAll: ids, assignedTo: ids[0] ?? undefined }) },
    details: (t) => onSelectTask(t.id),
    rename: (t, title) => { void updateTask(t.id, { title }) },
    openPartOf: (link) => navigate(`/task/${link.id}`),
    today: async (t) => { if (await planActions.chooseTaskDay(t.id, new Date())) showToast(`“${t.title}” is on today — any time.`, 'success', 5000) },
    monthLine: { month: monthName, lines: forOptions.lines, current: (t) => forLine(t), run: (t, id) => void setMonthLine(t, id) },
    // The triage contract's When (lib/triage): the same destinations, words
    // and write as every task surface; confirmed on the strip with Undo once
    // stored, or Retry when it did not land.
    when: {
      pick: function pickWhen(t, when) {
        const before = placementSnapshot(t)
        void activity.run(`${describeTriageWhen(when)}: “${t.title}”`, () => applyTriageWhen(when, t.id, {
          onPushTask: gated.pushTask,
          onSetBucket: (id, bucket) => gated.updateTask(id, { bucket, scheduledFor: undefined }),
          onUpdateTask: gated.updateTask,
          onFocus: (id, day) => gated.updateTask(id, { plannedOn: day }),
        }), { ids: [t.id], undo: async () => { await gated.updateTask(t.id, before) }, retry: () => pickWhen(t, when) })
      },
      pickDate: function pickDate(t, at, isAllDay) {
        const before = placementSnapshot(t)
        void activity.run(`Move “${t.title}” to ${at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
          async () => (await gated.updateTask(t.id, { bucket: 'timed', scheduledFor: at, isAllDay })) !== false,
          { ids: [t.id], undo: async () => { await gated.updateTask(t.id, before) }, retry: () => pickDate(t, at, isAllDay) })
      },
    },
  }

  // ── Step 1: the Inbox ───────────────────────────────────────────────────
  // A capture thrown away hides at once and is deleted when its Undo closes —
  // the Inbox page's rule, so Undo brings back the same row.
  const [trashed, setTrashed] = useState<Set<string>>(() => new Set())
  const trash = (t: Task) => {
    setTrashed((s) => new Set(s).add(t.id))
    let undone = false
    const timer = window.setTimeout(() => { if (!undone) void deleteTask(t.id) }, 6000)
    showToast(`Deleted “${t.title}”.`, 'success', 6000, { label: 'Undo', onClick: () => {
      undone = true; window.clearTimeout(timer)
      setTrashed((s) => { const n = new Set(s); n.delete(t.id); return n })
    } })
  }
  const inbox = tasks.filter((t) => !t.completed && t.bucket === 'inbox' && !trashed.has(t.id) && lens.keep(t))
  const sortInbox = async (t: Task, verdict: 'week' | 'someday' | 'done') => {
    if (rowState[t.id] === 'pending') return
    setRow(t.id, 'pending')
    const ok = verdict === 'week'
      // The capture itself joins the week — the same row, no copy. Undo lets
      // go of the week again, which returns it to the Inbox.
      ? await activity.run(`Add “${t.title}” to ${weekName}`, async () => (await gated.updateTask(t.id, { bucket: 'week', weekStart })) !== false,
          { ids: [t.id], undo: async () => !!(await dropCommitment(t.id, 'week', weekStart)), retry: () => void sortInbox(t, verdict) })
      : verdict === 'someday'
        ? await activity.run(`“${t.title}” → Someday`, async () => (await gated.updateTask(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })) !== false, { ids: [t.id] })
        : await activity.run(`Done: “${t.title}”`, async () => (await toggleTask(t.id)) !== false, { ids: [t.id], undo: async () => (await toggleTask(t.id)) !== false })
    setRow(t.id, ok ? undefined : 'failed')
    if (!ok) return
    progressApi.decide(`inbox:${t.id}`, verdict)
    if (verdict === 'week') markArrived(t.id, 'From Inbox')
  }

  // ── Step 2: last week ──────────────────────────────────────────────────
  // Each writer's own contract: keepForward resolves the task id, undefined
  // when it (or a step it carries) failed; dropCommitment, toggleTask and the
  // gated updateTask resolve true when stored. A carry is two writes when the
  // row had a day; a retry reads the row as it is NOW, so it never carries twice.
  const decideWrite = async (vm: LineVM, d: CloseDecision): Promise<boolean> => {
    const t = vm.task
    const cur = tasks.find((x) => x.id === t.id) ?? t
    if (vm.origin && (d === 'carried' || d === 'dropped')) {
      // Earlier work isn't on last week's list: it comes in as this week's,
      // any day, or lets go of its old day and week.
      return (await gated.updateTask(t.id, d === 'carried' ? lineDropUpdates(cur, { kind: 'week', at: weekStart }) : timingRemoval(cur, 'all').updates)) !== false
    }
    if (d === 'carried') {
      const c = committedTo(cur, 'week', weekStart, { isCurrent })
      const alreadyHere = !!c && c !== 'legacy' && c.status === 'open'
      // The same row carried: last week's record says "carried", this week's opens.
      let ok = alreadyHere || !!(await keepForward(t.id, { weekStart }, prevWeek))
      // A row that had a day last week comes in as "any day", not pinned to a past day.
      if (ok && cur.scheduledFor && cur.scheduledFor < weekStart) ok = (await gated.updateTask(t.id, timingRemoval(cur, 'day').updates)) !== false
      return ok
    }
    if (d === 'done') return cur.completed ? true : (await toggleTask(t.id)) !== false
    if (d === 'someday') return (await gated.updateTask(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })) !== false
    return (await dropCommitment(t.id, 'week', prevWeek)) === true
  }
  const VERB: Record<CloseDecision, string> = { carried: `Bring “%” into ${weekName}`, done: 'Done: “%”', someday: '“%” → Someday', dropped: 'Let go of “%”', left: '' }
  // A card once acted on stays: a write that half-landed (carried, its old
  // day not cleared) takes the row off last week's list, and the card must
  // still be there to try again (2026-10-08 review).
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const decideLastWeek = async (vm: LineVM, d: CloseDecision) => {
    const id = vm.task.id
    if (rowState[id] === 'pending') return
    if (!touched.has(id)) setTouched((x) => new Set(x).add(id))
    // Leaving it is a decision with nothing to write: it stays on last week.
    if (d === 'left') { progressApi.decide(`lw:${id}`, d); return }
    setRow(id, 'pending')
    const ok = await activity.run(VERB[d].replace('%', vm.task.title), () => decideWrite(vm, d), { ids: [id], retry: () => void decideLastWeek(vm, d) })
    setRow(id, ok ? undefined : 'failed')
    if (!ok) return
    progressApi.decide(`lw:${id}`, d)
    if (d === 'carried') markArrived(id, 'From last week')
  }
  const decisions = progress?.decisions ?? {}
  const decidedLast = (id: string) => decisions[`lw:${id}`] as CloseDecision | undefined
  // Last week's open work, plus anything decided this session (a carried row
  // has left last week's list, but its card stays to say what became of it).
  const earlierIds = new Set(earlierLines.map((l) => l.task.id))
  const lastWeekIds = [...new Set([
    ...lastWeekOpen.map((t) => t.id),
    ...[...touched].filter((id) => !earlierIds.has(id)),
    ...Object.keys(decisions).filter((k) => k.startsWith('lw:')).map((k) => k.slice(3)).filter((id) => !earlierIds.has(id)),
  ])]
  const lastWeekRows: LastWeekRow[] = lastWeekIds.flatMap((id) => {
    const t = tasks.find((x) => x.id === id)
    if (!t || !lens.keep(t)) return []
    const was = prevTasks.find((x) => x.id === id) ?? t
    return [{ vm: toVM(was, 'Any day last week'), decision: decidedLast(id), state: rowState[id] }]
  })
  const earlierRows: LastWeekRow[] = earlierLines.map((vm) => ({ vm, decision: decidedLast(vm.task.id), state: rowState[vm.task.id] }))
  const tally: Tally = Object.entries(decisions).filter(([k]) => k.startsWith('lw:')).reduce((x, [, d]) => addToTally(x, d as CloseDecision), EMPTY_TALLY)

  // ── Step 3: the month's goals ───────────────────────────────────────────
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const goalMonths = refMonths.map((m) => ({
    name: m.name, start: m.start, done: m.rows.filter((g) => g.completed).length,
    goals: m.rows.filter((g) => !g.completed).map((g) => ({ task: g, children: allWeek.filter((t) => t.id !== g.id && linkedLine(t, tasks)?.id === g.id) })),
  }))
  // The selected goal's tasks light up in the list — highlighted, never filtered.
  const related = new Set(goalMonths.flatMap((m) => m.goals).find((g) => g.task.id === selectedGoal)?.children.map((c) => c.id) ?? [])

  // ── The session ─────────────────────────────────────────────────────────
  // Open for the week on screen only: another week has its own progress.
  const [openFor, setOpenFor] = useState<string | null>(null)
  // Another week on screen closes this one's session (its progress stays),
  // and lets go of what this visit held for the last one.
  const [seenWeek, setSeenWeek] = useState(weekKey)
  if (seenWeek !== weekKey) {
    setSeenWeek(weekKey)
    setTouched(new Set()); setRowState({}); setSelectedGoal(null); setAddingFor(null)
  }
  if (openFor && openFor !== weekKey) setOpenFor(null)
  const active = openFor === weekKey && !!progress
  // Side by side, each column scrolls on its own: the list holds still.
  const boardRef = useColumnsFitWindow(active)
  const step: WeekStep = isWeekStep(progress?.step) ? progress!.step as WeekStep : 'inbox'
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [justSaved, setJustSaved] = useState<null | { detail: string; week: string }>(null)
  const [sourceShown, setSourceShown] = useState(readSourceShown)
  const toggleSource = () => setSourceShown((v) => { try { localStorage.setItem(SOURCE_KEY, v ? 'hidden' : 'shown') } catch { /* this visit only */ } return !v })
  const begin = (opts?: { step?: WeekStep }) => {
    progressApi.open('inbox', opts)
    // The week's line, as it was agreed, comes back to change.
    const saved = session.mine?.focus ?? session.saved?.notes?.focus
    if (!progress && saved) progressApi.setDraft('focus', saved)
    setOpenFor(weekKey)
    setJustSaved(null); setSaveFailed(false); setSelectedGoal(null); setAddingFor(null)
    window.scrollTo?.({ top: 0 })
  }
  const startPlan = () => begin()
  const startReview = () => begin({ step: 'lastweek' })
  const leave = () => { setOpenFor(null); setSaveFailed(false) }
  const drafts = progress?.drafts ?? {}
  const focus = drafts.focus ?? ''
  const finish = async () => {
    if (saving) return
    setSaving(true); setSaveFailed(false)
    let ok = false
    try { ok = await session.save({ wentWell: session.mine?.wentWell ?? '', didnt: session.mine?.didnt ?? '', focus: focus.trim() || undefined }) } catch { ok = false }
    setSaving(false)
    // Not saved: the session stays as it is — every choice and word — to try again.
    if (!ok) { setSaveFailed(true); return }
    setJustSaved({ detail: decidedSentence(tally, 'Last week'), week: weekKey })
    progressApi.finish()
    setOpenFor(null)
  }
  // Another week on screen: its own session, its own (or no) saved line.
  if (justSaved && justSaved.week !== weekKey) setJustSaved(null)

  useEffect(() => {
    const open = () => startPlan()
    window.addEventListener('pv2:plan-week', open)
    return () => window.removeEventListener('pv2:plan-week', open)
  })
  // Arriving with { plan: true } (the last day's "Plan week N →") opens it,
  // once per navigation — the page may stay mounted while the week changes.
  const plannedFrom = useRef<string | null>(null)
  useEffect(() => {
    if (!arrivedState?.plan || plannedFrom.current === location.key) return
    plannedFrom.current = location.key
    startPlan()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, weekKey])

  // The days always know the household, so each row shows who carries it,
  // and a week task on a day keeps its month goal as a control.
  const daysFor = (opts: DaysOptions) => (renderDays ? renderDays({
    members, forLabel: (t: Task) => { const f = forLine(t); return f ? `for ${f.month}: ${f.title}` : null },
    forControl: (t: Task) => (isWeekItem(t) ? <MonthLink compact title={t.title} current={forLine(t)} options={forOptions} onChange={(id) => void setMonthLine(t, id)} /> : null),
    ...opts,
  }) : days)

  const host: WeekCanvasHost = { lastWeekOpen: reviewCount, onLookBack: startReview, arrivedToWrite }
  const agreedBy = session.saved
    ? (session.saved.authorId === user?.id ? 'you' : members.find((m) => m.auth_user_id === session.saved!.authorId)?.name ?? 'your household')
    : null
  const endsToday = isCurrent && localYmd(new Date(weekStart.getTime() + 6 * DAY)) === localYmd(new Date())
  const toTodayHref = new URLSearchParams(location.search).get('view') === 'alongside' ? '/today?view=alongside' : '/today'
  const toolbar: PlanToolbarProps = {
    period: `week ${weekNo}`, saved: session.saved, loading: session.loading, error: !!session.error, agreedBy,
    reviewDue: !session.saved || reviewCount > 0, onPlan: startPlan, onRetry: session.reload,
    // On its last day the week offers the next one instead (one primary).
    planLabel: endsToday ? undefined : 'Plan the week',
    // Worded as Season and Year word theirs: where you left off, of how many.
    resumeLabel: progress && !endsToday ? `Continue planning week ${weekNo} · step ${Math.max(1, WEEK_STEPS.findIndex((x) => x.key === progress.step) + 1)} of ${WEEK_STEPS.length}` : undefined,
    secondary: endsToday ? null : { label: 'Review last week', onClick: startReview },
    lookBack: null, hasLines: allWeek.length > 0,
    tools: tools && <div className="pv2-wtools">{tools}</div>,
    justSaved: justSaved && {
      detail: justSaved.detail,
      next: isCurrent
        ? { label: 'Pick something for today', onClick: () => { writePlanView('today', 'ref'); navigate(toTodayHref) } }
        : { label: 'Back to Today', onClick: () => navigate(toTodayHref) },
      onDone: () => setJustSaved(null),
    },
  }
  const slots = useContext(PlanMastheadSlotsContext)

  const WHY: Record<WeekStep, string> = {
    inbox: `Look through what you captured and add what needs to happen in ${weekName}. It joins the list on the right; the rest can wait.`,
    lastweek: `Review ${prevName}’s list and bring forward only what still matters. Nothing comes over by itself, and ${prevName} keeps its record.`,
    goals: `Write ${weekName}’s tasks, with ${monthName}’s goals beside them. Linking a task to a goal is optional; the goal itself stays as it is.`,
    days: `Give each task a day, and a time only if it needs one — beside what’s already on the calendar. Drag a task onto a day, or use its When control. When it looks right, mark the week planned.`,
  }
  const sourceName: Record<WeekStep, string> = { inbox: 'Inbox', lastweek: 'last week', goals: `${monthName} goals`, days: 'the days' }

  // ── The anchored list: the same element, the same rows, in every step ──
  const list = (
    <section className="plan-month-goals wk-board-list" aria-labelledby="wk-board-question" data-explain="week-list" data-explain-label={`Everything ${weekName} holds`}>
      <div className="plan-month-intro">
        <h2 id="wk-board-question">What will week {weekNo} hold?</h2>
        <p>{range}. One list, built step by step: what you add from each step lands here.</p>
      </div>
      <WeekListV2 complete title={`Week ${weekNo}’s list`}
        hint={`Everything committed to ${weekName}, with a day or not.`}
        forLine={forLine} forOptions={forOptions} onForLine={(t, id) => void setMonthLine(t, id)}
        lines={lines} weekStart={weekStart} members={members} actions={actions} timingControl={timingControl}
        onContext={(t, c: TaskContext | undefined) => { void gated.updateTask(t.id, { context: c }) }}
        onAdd={async (title, forId) => !!(await addWeekItem(title, forId))}
        addPicker={addArea.picker}
        highlight={arrived} related={related} linkedId={linked?.child ?? null}
        initialDraft={drafts.write} onDraftChange={(v) => progressApi.setDraft('write', v)}
        dragEnabled={dragEnabled && step === 'days'} headerAction={<FromPaper altitude="week" periodStart={weekStart} tasks={tasks} />}
        emptyHint={`Nothing on ${weekName} yet. Each step adds to this list, or write the first thing below.`}
        footer={step === 'days' ? (
          <label className="wk-focus"><span>This week is for…</span>
            <input value={focus} onChange={(e) => progressApi.setDraft('focus', e.target.value)} placeholder="One line, if it helps: what would make this a good week?" />
          </label>
        ) : undefined} />
    </section>
  )

  const source = (
    <section id="wk-board-source" className="plan-month-source wk-board-source" hidden={!sourceShown} aria-labelledby="wk-source-title"
      data-explain="source" data-explain-label={`The source for this step: ${sourceName[step]}`}>
      {step === 'inbox' ? (
        <InboxSource tasks={inbox} weekName={weekName} stateOf={(id) => rowState[id]}
          onAdd={(t) => void sortInbox(t, 'week')} onSomeday={(t) => void sortInbox(t, 'someday')} onDone={(t) => void sortInbox(t, 'done')}
          onDelete={trash} onOpen={(t) => onSelectTask(t.id)}
          extra={<Fold title="Waiting on and to discuss">{() => <WeekStepMain step="between" tasks={tasks} weekStart={weekStart} onSelectTask={onSelectTask} onThisWeek={() => {}} />}</Fold>} />
      ) : step === 'lastweek' ? (
        <LastWeekSource rows={lastWeekRows} earlier={earlierRows} done={prevTasks.filter((t) => t.completed)} prevName={prevName} weekName={weekName}
          onDecide={(vm, d) => void decideLastWeek(vm, d)} onOpen={(t) => onSelectTask(t.id)} />
      ) : step === 'goals' ? (
        <MonthGoalsSource months={goalMonths} weekName={weekName} loading={tasksLoading}
          selected={selectedGoal} onSelect={setSelectedGoal} linkedGoal={linked?.parent ?? null}
          adding={addingFor} onStartAdd={setAddingFor} onCancelAdd={() => setAddingFor(null)}
          draftOf={(id) => drafts[`goal:${id}`] ?? ''} onDraft={(id, v) => progressApi.setDraft(`goal:${id}`, v)}
          onAdd={async (id, text) => !!(await addWeekItem(text, id))}
          onOpenMonth={(start) => navigate(`/month?start=${localYmd(start)}`)} />
      ) : (
        <>
          <SourceHead id="wk-source-title" title="The days" ask="What’s already fixed — events, routines and tasks with a day. Place the list’s tasks around them." />
          <div className="wk-board-days">{daysFor({})}</div>
          <Fold title="Routines this week">{() => <WeekStepMain step="routines" tasks={tasks} weekStart={weekStart} onSelectTask={onSelectTask} onThisWeek={() => {}} />}</Fold>
          <Fold title="Coming up after this week">{() => <WeekStepMain step="ahead" tasks={tasks} weekStart={weekStart} onSelectTask={onSelectTask}
            onThisWeek={(t) => { void activity.run(`Start “${t.title}” ${weekName}`, async () => (await gated.updateTask(t.id, { bucket: 'week', weekStart })) !== false, { ids: [t.id] }).then((ok) => { if (ok) markArrived(t.id, 'Starting this week') }) }} />}</Fold>
        </>
      )}
    </section>
  )

  // ── What the week holds, once planned ───────────────────────────────────
  const chosen = () => {
    const open = allWeek.filter((t) => !t.completed)
    const end = weekStart.getTime() + 7 * DAY
    const dated = open.filter((t) => t.scheduledFor && t.scheduledFor.getTime() >= weekStart.getTime() && t.scheduledFor.getTime() < end)
      .sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime())
    const anyDay = open.filter((t) => !dated.includes(t))
    return (
      <section className="wk-chosen" aria-label={`What week ${weekNo} holds`}>
        <h2>What week {weekNo} holds</h2>
        {open.length === 0 ? <p className="plan-empty">Nothing on the list — a quiet week.</p> : <>
          {dated.length > 0 && <ul aria-label="On a day">{dated.map((t) => (
            <li key={t.id}><span className="wk-chosen-day">{t.scheduledFor!.toLocaleDateString('en-US', { weekday: 'short' })}{!t.isAllDay ? ` ${t.scheduledFor!.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}</span> {t.title}</li>
          ))}</ul>}
          {anyDay.length > 0 && <><h3>Any day</h3><ul aria-label="Any day">{anyDay.map((t) => <li key={t.id}>{t.title}</li>)}</ul></>}
        </>}
      </section>
    )
  }

  if (active) {
    return (
      <div className="pv2-week wk-session" data-week={weekKey} data-step={step}>
        <PlanMeetingBar period={`week ${weekNo}`} steps={WEEK_STEPS} stepKey={step} onStepKey={(k) => progressApi.setStep(k)}
          why={WHY[step]} onLeave={leave} onSave={() => void finish()} saveLabel={`Mark week ${weekNo} planned`} saving={saving} />
        {saveFailed && <p className="wk-session-fail" role="alert">That didn’t save — week {weekNo} isn’t marked planned yet. Everything you chose is still here; try again.</p>}
        <div className="plan-toolbar wk-board-toolbar">
          <button type="button" className="canvas-link plan-source-toggle" aria-expanded={sourceShown} aria-controls="wk-board-source" onClick={toggleSource}>
            {sourceShown ? `Hide ${sourceName[step]}` : `Show ${sourceName[step]}`}</button>
        </div>
        {/* The list first: it is what the session builds, and what a phone
            shows first. Wide screens put the source on its left. */}
        <div ref={boardRef} className={`plan-month-board wk-board${sourceShown ? '' : ' is-source-hidden'}`}>
          {list}
          {source}
        </div>
      </div>
    )
  }

  return (
    <div className="pv2-week" data-week={weekKey}>
      {slots?.subline && slots.controls ? (
        // Desktop: the control row folds into the week's masthead.
        <>
          <GuideAnchor />
          {createPortal(<PlanToolbarStatus {...toolbar} />, slots.subline)}
          {createPortal(<PlanToolbarControls {...toolbar} />, slots.controls)}
          <PlanSavedLine period={`week ${weekNo}`} justSaved={toolbar.justSaved} />
        </>
      ) : <PlanToolbar {...toolbar} />}
      {justSaved && chosen()}
      {session.saved?.notes?.focus && (
        // What the week is for, as agreed when it was planned.
        <p className="wk-focus-line"><span>This week is for</span> <em>{session.saved.notes?.focus}</em></p>
      )}
      {endsToday && (
        // The week's last day: nothing left in it to plan, so say so and
        // offer the next one (walkthrough 2026-10-02 #18).
        <div className="pv2-saved pv2-endsweek" role="note">
          <span className="pv2-saved-text"><b>Week {weekNo} ends today.</b> Plan the week ahead while it’s fresh.</span>
          <button type="button" className="pv2-btn" onClick={() => navigate(`/week?start=${localYmd(nextWeek)}`, { state: { plan: true } })}>Plan week {weekOfYear(nextWeek, readCadenceConfig().weekStartsOn)} →</button>
        </div>
      )}
      <div className="wk-canvas">{typeof canvas === 'function' ? canvas(host) : canvas}</div>
    </div>
  )
}
