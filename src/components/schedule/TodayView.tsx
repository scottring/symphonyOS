import { DesktopPageControls, DesktopControlsContext } from '@/components/layout/DesktopNavigation'
import { DesktopFooterAction, DesktopFooterActionContext } from '@/components/layout/DesktopFooter'
/**
 * TodayView — editorial Today shell.
 *
 * Drop-in replacement for TodaySchedule (same TodayScheduleProps interface).
 * Composes: TodayHeader, TodayOverflowMenu, WeatherChip,
 *           ScheduleItem.
 *
 * NOT wired to the route yet — that happens in R4.
 */
import { useContext, createElement, useMemo, useCallback, useRef, useState, useEffect } from 'react'
import type { Task, GroupMemberRef } from '@/types/task'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { TimelineCaptureResult } from '@/components/schedule/TimelineQuickInput'
import type { ParserContext } from '@/lib/quickInputParser'
import type { HomeViewType } from '@/types/homeView'
import type { DaySection } from '@/lib/timeUtils'
import type { TimelineItem } from '@/types/timeline'

import { parseRoutineTimelineId } from '@/lib/today/doseExpansion'
import { readCollapsed, setCollapsed, onCollapsedChange, sectionKey } from '@/lib/today/sectionCollapse'
import { useMobile } from '@/hooks/useMobile'
import { useTodayData } from '@/hooks/useTodayData'
import { mergeAssignees } from '@/lib/today/bulkAssign'
import { partitionSelection } from '@/lib/today/timelineKey'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'
import { useUnpromptedSuggestions, type UnpromptedItem } from '@/hooks/useUnpromptedSuggestions'
import { suggestionIsForFreeEvent } from '@/lib/today/eventFree'
import { UnpromptedLines } from '@/components/assistant/UnpromptedLines'
import { resolveSuggestionAction, revealItemId } from '@/lib/assistant/suggestionAction'
import { useSystemHealth, getHealthTextClasses } from '@/hooks/useSystemHealth'
import { useTimelineInsert } from '@/hooks/useTimelineInsert'
import { useDomain } from '@/hooks/useDomain'

import { Eye, EyeOff, Binoculars, Printer, GripVertical, Moon, Sparkles, NotebookPen, ArrowRight, PanelLeft, ChevronDown, ChevronRight, Plus, History } from 'lucide-react'
import { splitTodayJournal, splitCompletedFocus } from '@/lib/today/journalSplit'
import { panelActionsFor } from '@/components/reference/DayPlanPanel'
import { PlanningSheet } from '@/components/reference/PlanningSheet'
import { unhomedRoutines } from '@/lib/week/unhomedRoutines'
import { useWeekInstances } from '@/components/home/week/useWeekInstances'
import { useReferenceLists } from '@/components/reference/ReferenceListsContext'
import { makePlanActions } from '@/lib/planning/planActions'
import { localYmd } from '@/lib/cadence/config'
import { planDropHandlers } from '@/lib/planning/planDrag'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { findTaskById } from '@/lib/findTaskById'
import { showToast } from '@/hooks/useToast'
import { useNavigate } from 'react-router-dom'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { ALL_LAYERS } from '@/lib/domains'
import { AssigneeFilter } from '@/components/home/AssigneeFilter'

import { NeededTodayNote } from './NeededTodayNote'
import { TodayAddInput } from './TodayAddInput'
import { TodaySectionList, findTimelineItem } from './TodaySectionList'
import { TodayDragProvider } from './TodayDragProvider'
import { resolveDrop, writeMoveAndRegisterUndo, type DropIntent } from '@/lib/today/todayDrop'
import { useCalendarPermissions } from '@/hooks/useCalendarPermissions'
import { selectUpNext, formatUpNextStatus } from '@/lib/today/upNext'
import { forwardLook, forwardLine } from '@/lib/today/forwardLook'
import { NeedsYourOK } from './NeedsYourOK'
import { ClarityCurtain } from '@/components/clarity/ClarityCurtain'
import { computeClaritySteps, type ClarityStepId } from '@/lib/clarity/claritySteps'
import { selectOverdue } from '@/lib/today/taskPools'
import { selectHorizonPool } from '@/lib/today/horizons'
import { monthStartOf } from '@/lib/planning/periodPlacement'
import { doableBy } from '@/lib/planning/poolViews'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { placementFate } from '@/lib/planning/lineage'
import { useSuggestionsEnabled } from '@/lib/assistant/suggestionsPref'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'
import { resolveRoutine, isDraggableRoutine } from '@/lib/routineUtils'
import { TodayOverflowMenu } from './TodayOverflowMenu'
import { ReviewDrawer, type ReviewMode } from './ReviewDrawer'
import { HorizonPoolDropdown } from './HorizonPoolDropdown'
import { DayNavCluster } from './DayNavCluster'
import { MastheadCard } from '@/components/layout/MastheadCard'
import { WeatherChip } from './WeatherChip'
import { TodayBacklogFooter } from './TodayBacklogFooter'
import { EmailReviewSheet } from './EmailReviewSheet'
import { useUnreviewedCaptures } from '@/hooks/useUnreviewedCaptures'
import { InboxUndoToast } from './InboxUndoToast'
import { BulkActionToolbar } from './BulkActionToolbar'
import { TimelineNoteComposer } from './TimelineNoteComposer'

import { discussionItems } from '@/lib/discussionItems'
import { DiscussionBadge } from './DiscussionBadge'
import { PrintableDayList } from './PrintableDayList'
import { DuplicateSweep, DuplicateSweepTrigger } from './DuplicateSweep'
import { useDuplicateSweep } from '@/hooks/useDuplicateSweep'
import { ProposalPreview, ProposalTrigger } from './ProposalPreview'
import { useTodayProposal } from '@/hooks/useTodayProposal'
import { readHideRoutines, writeHideRoutines, onHideRoutinesChange } from '@/lib/hideRoutinesSignal'
import { useShareToFamilyNudges } from '@/lib/today/shareNudges'

// ─── Props: identical to TodayScheduleProps ───────────────────────────────────

interface TodayViewProps {
  // View-specific data
  tasks: Task[]
  /** Whose Today this is — focus (task_focus) is per person. */
  userId?: string | null
  events: CalendarEvent[]
  routines?: Routine[]
  /** Every active routine, not only the day's: the Planning sheet lists
   *  weekly routines with no day of their own, which no single day carries. */
  allRoutines?: Routine[]
  dateInstances?: ActionableInstance[]
  projects?: Project[]
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  loading?: boolean
  viewedDate: Date
  onDateChange: (date: Date) => void
  // Undo-wrapped handlers from HomeView
  onToggleTask: (taskId: string) => void
  onCompleteRoutine?: (routineId: string, completed: boolean, completedAt?: Date) => void
  onCompleteEvent?: (eventId: string, completed: boolean) => void
  // Assignee filter (managed by HomeView) — multi-select union; [] = everyone
  selectedAssignees?: string[]
  onSelectAssignees?: (ids: string[]) => void
  assigneesWithTasks?: FamilyMember[]
  hasUnassignedTasks?: boolean
  // Panel state
  panelOpen?: boolean
  bothPanelsOpen?: boolean
  onClosePanel?: () => void
  /** Opens plan-from-paper (photo of the written plan → placed tasks). */
  onOpenPlanFromPaper?: () => void
  /** Page chrome (domain chooser, assistant toggle) rendered in the day card's
   *  top-right corner. Passed in rather than read from context so TodayView
   *  stays renderable without an AppShell around it. */
  headerControls?: React.ReactNode
  /** Drawn after the Schedule block — the quiet place for a planning
   *  reminder (Scott via Codex, 2026-09-22: weekly planning is secondary,
   *  so its line sits below the day, never above the date). */
  afterSchedule?: React.ReactNode
  // Bulk actions (managed by HomeView)
  onUpdateTasksBulk?: (taskIds: string[], updates: Partial<Task>) => Promise<void>
  // Timeline insert points — fall back to context
  onCreateTaskAt?: (r: TimelineCaptureResult) => void
  onCreateEventAt?: (r: TimelineCaptureResult) => void
  onCreateRoutineAt?: (r: TimelineCaptureResult) => void
  onCreateNoteAt?: (content: string, anchor: Date | null) => void
  onAppendNoteAt?: (id: string, block: string, anchor: Date | null) => void
  onLinkNote?: (id: string) => void
  timelineNotes?: { id: string; title?: string; content: string; timelineAt?: Date }[]
  // D/W/M view switcher — threaded from HomeView
  currentHomeView?: HomeViewType
  onHomeViewChange?: (view: HomeViewType) => void
}

// ─── Component ─────────────────────────────────────────────────────────────────

/** Tasks: the day's untimed work — every task dated today plus what was chosen (chosen rows lead); then untimed occurrences. */
const FOCUS_SECTIONS: DaySection[] = ['allday', 'unscheduled']
/** Still ahead / Earlier today: the timed day, in order. */
const TIMED_SECTIONS: DaySection[] = ['earlyMorning', 'morning', 'afternoon', 'evening', 'night']

export function TodayView({
  tasks,
  userId,
  events,
  routines = [],
  allRoutines,
  dateInstances = [],
  projects = [],
  selectedItemId,
  onSelectItem,
  onToggleTask,
  onCompleteRoutine,
  onCompleteEvent,
  loading,
  viewedDate,
  onDateChange,
  selectedAssignees,
  onSelectAssignees,
  assigneesWithTasks,
  hasUnassignedTasks,
  panelOpen,
  onClosePanel,
  onOpenPlanFromPaper,
  headerControls,
  afterSchedule,
  onCreateNoteAt: onCreateNoteAtProp,
  onAppendNoteAt: onAppendNoteAtProp,
  onLinkNote: onLinkNoteProp,
  timelineNotes: timelineNotesProp,
}: TodayViewProps) {
  // ── Context ──────────────────────────────────────────────────────────────────
  const isMobile = useMobile()
  const navigate = useNavigate()
  const { isConnected: calendarConnected, error: calendarError } = useGoogleCalendar()
  const ctx = useScheduleActionsContext()
  // Only what THIS file still uses. The row-level handlers moved with the
  // section loop into TodaySectionList, which reads the same context itself.
  const {
    onUpdateTask,
    onGroupTasks, onGroupItems,
    onAssignTaskAll, onAssignEventAll,
    onPushRoutine, onPushEvent, onUpdateEventContext,
    onNotify,
    contactsMap, familyMembers = [],
  } = ctx
  // NOTE: completing a Needed Today list-item row is NOT wired from here.
  // It belongs to useNeededListItems (which the note owns), because
  // ListsContext.updateItem early-returns on any row that isn't in the open
  // list — and no list is ever open on Today.

  // ── Bulk multi-select (hover checkbox on any row → bottom action bar) ──────
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  // Raw task id of a group created by drag, held open on its name field.
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  // Review drawer — one body, two entries: the backlog footer's "Review"
  // opens the morning flavor; the ⋯ menu's "End of day review" the evening.
  const [reviewMode, setReviewMode] = useState<ReviewMode | null>(null)
  const clearBulkSelection = useCallback(() => setSelectedKeys(new Set()), [])
  const toggleBulkSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const handleBulkDefer = useCallback((target: 'week' | 'month' | 'quarter') => {
    const { taskIds, eventIds, routineIds } = partitionSelection(selectedKeys)
    for (const id of taskIds) onUpdateTask?.(id, { bucket: target, scheduledFor: undefined })
    const skipped = eventIds.length + routineIds.length
    if (skipped > 0) {
      onNotify?.(taskIds.length > 0
        ? `Deferred ${taskIds.length} — ${skipped} non-task item(s) skipped`
        : `Nothing deferred — ${skipped} non-task item(s) can't be deferred`)
    }
    clearBulkSelection()
  }, [selectedKeys, onUpdateTask, onNotify, clearBulkSelection])

  const handleBulkSchedule = useCallback((date: Date, isAllDay: boolean) => {
    const { taskIds, eventIds, routineIds } = partitionSelection(selectedKeys)
    for (const id of taskIds) onUpdateTask?.(id, { bucket: 'timed', scheduledFor: date, isAllDay })
    for (const id of routineIds) onPushRoutine?.(id, date)
    for (const id of eventIds) onPushEvent?.(id, date)
    clearBulkSelection()
  }, [selectedKeys, onUpdateTask, onPushRoutine, onPushEvent, clearBulkSelection])

  const handleBulkSetContext = useCallback((context: Task['context']) => {
    const { taskIds, eventIds, routineIds } = partitionSelection(selectedKeys)
    for (const id of taskIds) onUpdateTask?.(id, { context })
    for (const id of eventIds) onUpdateEventContext?.(id, context ?? null)
    if (routineIds.length > 0) onNotify?.(`Context set — ${routineIds.length} routine(s) skipped (edit the routine to change every day)`)
    clearBulkSelection()
  }, [selectedKeys, onUpdateTask, onUpdateEventContext, onNotify, clearBulkSelection])

  // Additive assign: union the chosen members into each task's existing
  // assignees (so "assign these to Iris" adds Iris without dropping Scott),
  // matching the user's "if she isn't already assigned" intent.
  const handleBulkAssign = useCallback((memberIds: string[]) => {
    const { taskIds, eventIds, routineIds } = partitionSelection(selectedKeys)
    for (const id of taskIds) {
      onAssignTaskAll?.(id, mergeAssignees(tasks.find((x) => x.id === id), memberIds))
    }
    for (const id of eventIds) onAssignEventAll?.(id, memberIds)
    if (routineIds.length > 0) onNotify?.(`Assigned — ${routineIds.length} routine(s) skipped`)
    clearBulkSelection()
  }, [selectedKeys, tasks, onAssignTaskAll, onAssignEventAll, onNotify, clearBulkSelection])

  const handleBulkGroup = useCallback(async (name: string, date: Date, isAllDay: boolean) => {
    const { taskIds, eventIds, routineIds } = partitionSelection(selectedKeys)
    const memberRefs: GroupMemberRef[] = [
      ...eventIds.map((id) => ({ type: 'event' as const, id })),
      ...routineIds.map((id) => ({ type: 'routine' as const, id })),
    ]
    if (onGroupItems) await onGroupItems(taskIds, memberRefs, name, date, isAllDay)
    else if (onGroupTasks) await onGroupTasks(taskIds, name, date, isAllDay)
    clearBulkSelection()
  }, [selectedKeys, onGroupItems, onGroupTasks, clearBulkSelection])

  // ── Hide-routines toggle (localStorage parity) ────────────────────────────────
  const [hideRoutines, setHideRoutines] = useState<boolean>(() => readHideRoutines())

  useEffect(() => onHideRoutinesChange(setHideRoutines), [])

  const toggleHideRoutines = useCallback(() => {
    setHideRoutines((v) => {
      const next = !v
      writeHideRoutines(next)
      return next
    })
  }, [])

  // ── Completed-task linger (mobile only) ───────────────────────────────────────
  // On mobile, a checked-off task stays visible (crossed out) for ~60s so the
  // completion registers, then drops off Today to keep the list focused on what's
  // left. Desktop keeps completed items for the whole day. `nowTick` advances on
  // an interval so lingering items expire on their own without a manual refresh.
  const COMPLETED_LINGER_MS = 60_000
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    // Ticks on all breakpoints: mobile uses it for completed-task linger,
    // and the Up Next hero uses it to stay minute-fresh everywhere.
    const id = setInterval(() => setNowTick(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])
  const completedLingerCutoff = isMobile ? nowTick - COMPLETED_LINGER_MS : undefined

  // ── Derived data ─────────────────────────────────────────────────────────────
  // The week Today belongs to. A week placement now names its week, so the
  // "This Week" strip has to say which week it is showing — otherwise a move
  // placed on a week a month out sits on today's strip. Memoized so it stays
  // referentially stable (todayInput depends on it). Fixed for the session's
  // lifetime, same as `todayStart` elsewhere — a week boundary crossed with the
  // tab open is the same edge case a day boundary already is.
  const currentWeekStart = useMemo(
    () => weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn),
    [],
  )
  // The checked layer set — feeds the resolver's rung 4 directly (routines no
  // longer arrive pre-filtered by domain from HomeView).
  const { layers } = useDomain()
  // Every instance touching this week: a flexible routine already placed on
  // one of its days has a home for the week and leaves the sheet's To plan.
  const weekInstances = useWeekInstances(currentWeekStart, 7)
  const todayInput = useMemo(() => ({
    tasks,
    events,
    routines,
    dateInstances,
    viewedDate,
    selectedAssignee: selectedAssignees ?? [],
    hideRoutines,
    layers,
    completedLingerCutoff,
    weekStart: currentWeekStart,
    userId,
    // The same set the Planning dock draws, so the sheet and the dock agree.
    unhomedRoutines: unhomedRoutines(allRoutines ?? routines, { member: selectedAssignees ?? [], prefs: { hideRoutines: false, layers } },
      { weekStart: currentWeekStart, instances: weekInstances }),
    // Cast: EventNote.notes is string|null; TodayDataInput expects string|undefined — structurally compatible at runtime
    eventNotesMap: ctx.eventNotesMap as unknown as Map<string, { notes?: string; assignedTo?: string | null }> | undefined,
    eventContextOverrides: ctx.eventContextOverrides,
    getDomainForCalendar: ctx.getDomainForCalendar,
  }), [tasks, userId, events, routines, allRoutines, dateInstances, viewedDate, selectedAssignees, hideRoutines, layers, completedLingerCutoff,
      currentWeekStart, weekInstances, ctx.eventNotesMap, ctx.eventContextOverrides, ctx.getDomainForCalendar])

  const data = useTodayData(todayInput)

  // ── The day's plan (dayPlan.ts) ────────────────────────────────────────
  // What the main list does not draw — dated-but-unchosen tasks, available
  // routine occurrences, the week's and month's lists — waits in the Today
  // pin. Today spends ONE line on it (never a list), so closing the pin can
  // never make an obligation disappear. Built from this page's own handlers:
  // no second task fetch.
  const references = useReferenceLists()
  const todayPinned = !!references?.pins.some((p) => p.kind === 'today')
  const { setPlanned, reschedule: rescheduleInstance } = useActionableInstances()
  const planActions = useMemo(() => makePlanActions({
    findTask: (id) => findTaskById(tasks, id),
    updateTask: (id, u) => ctx.onUpdateTask?.(id, u),
    pushTask: (id, target) => ctx.onPushTask?.(id, target),
    setRoutinePlanned: (id, day, planned) => setPlanned('routine', id, day, planned),
    rescheduleRoutine: (id, from, when) => rescheduleInstance('routine', id, from, when),
    notify: (m) => showToast(m, 'warning'),
  }), [tasks, ctx, setPlanned, rescheduleInstance])
  const planPanelActions = useMemo(() => panelActionsFor(viewedDate, {
    ...planActions,
    toggleTask: onToggleTask,
    completeRoutine: async (id, _day, done) => { onCompleteRoutine?.(id, done); return true },
  }, {
    changeRoutineRule: () => navigate('/routines'),
    // The sheet's row titles open the same detail pane the page's rows do.
    open: (kind, id) => onSelectItem(`${kind}-${id}`),
  }), [viewedDate, planActions, onToggleTask, onCompleteRoutine, navigate, onSelectItem])
  const [planOpenDay, setPlanOpenDay] = useState<string | null>(null)
  const planOpenInline = planOpenDay === localYmd(viewedDate)
  // The desktop pin is always TODAY's plan; another day, or a phone (which
  // has no dock), opens the same panel inline instead.
  // Desktop always plans in the dock (it plans the real today, whichever day
  // is being read); the sheet is the phone's. Keying this on `isToday` sent a
  // desktop day-browse to the phone sheet (review, 2026-09-21).
  const usePin = !isMobile && !!references
  // Opens the plan: the shell's dock on desktop (pin Today), the sheet on a
  // phone. Declared here because the ⋯ menu, built above the return, uses it.
  // One control, open or closed (2026-09-22): the chooser is closable from
  // the same button that opened it.
  const openPlan = () => {
    if (usePin) { if (todayPinned) references!.unpin('today'); else references!.pin('today') }
    else setPlanOpenDay(planOpenInline ? null : localYmd(viewedDate))
  }
  const chooserOpen = usePin ? todayPinned : planOpenInline
  const [agendaDropOver, setAgendaDropOver] = useState(false)
  const agendaDrop = planDropHandlers((payload) => {
    void planActions.drop(payload, { type: 'day', day: viewedDate }, { chooseOnly: true })
  }, setAgendaDropOver)

  // The week/month lists for the header dropdowns — separate from the daily
  // review by decree (Scott, 2026-08-19): look and pick from up here, never
  // inside the review session. They plan MY day, so they scope to the current
  // member the way the /week column and the month fold do (doableBy):
  // unassigned rows and mine; a row assigned exclusively to someone else is
  // rightly visible elsewhere but isn't mine to put on today. Not a view of
  // the assignee FILTER, which is a different question (Scott, 2026-09-05).
  const { getCurrentUserMember } = useFamilyMembers()
  const meId = getCurrentUserMember()?.id ?? null
  const desktopControls = useContext(DesktopControlsContext)
  // In the desktop shell the day's review lives in the page footer, so the
  // ⋯ menu drops its copy there (phones keep the menu entry).
  const reviewInFooter = !!useContext(DesktopFooterActionContext) && !isMobile
  const poolMatchMine = useMemo(
    () => (assignedTo: string | null | undefined, assignedToAll?: readonly string[] | null) =>
      !meId || doableBy({ assignedTo: assignedTo ?? undefined, assignedToAll: assignedToAll ? [...assignedToAll] : undefined }, meId),
    [meId],
  )
  const weekPool = useMemo(
    () => selectHorizonPool(tasks, 'week', poolMatchMine, currentWeekStart),
    [tasks, poolMatchMine, currentWeekStart],
  )
  // The month list is THIS month's (a legacy NULL month_start row is this
  // month's too); next month's rows wait their turn.
  const monthPool = useMemo(
    () => selectHorizonPool(tasks, 'month', poolMatchMine, undefined, monthStartOf(viewedDate)),
    [tasks, poolMatchMine, viewedDate],
  )

  // ── Up Next: the single next commitment, highlighted in place. It used to
  // be lifted out of its section into a hero card, which left its home
  // section rendering an empty heading — the timeline read as disassembled.
  const upNext = useMemo(() => {
    if (!data.isToday) return null
    const allItems = data.sectionsOrder.flatMap((s) => data.grouped[s] ?? [])
    return selectUpNext(allItems, new Date(nowTick))
  }, [data, nowTick])
  const upNextId = upNext?.item.id
  const upNextStatus = upNext ? formatUpNextStatus(upNext) : undefined

  // ── Backlog footer gate. The footer shows only a "Review" link now, but it
  // still has to know whether either backlog population is non-empty, so the
  // carried-over count survives as the gate. Incomplete count with a total
  // fallback, same readout the old collapsed strip showed.
  const carriedCount = useMemo(() => {
    const incomplete = data.overdueTasks.filter((t) => !t.completed).length
    return incomplete || data.overdueTasks.length
  }, [data.overdueTasks])
  const hasBacklog = carriedCount > 0 || data.attentionItems.length > 0

  // ── "New from email": the quiet door, and the sheet behind it ──────────────
  // The census gates the footer link — Today never shows a count, so the link's
  // presence IS the signal. Closing the sheet stamps reviewed_at on everything
  // it showed, so the door closes for good.
  const { captures: emailCaptures, markReviewed } = useUnreviewedCaptures()
  const [emailReviewOpen, setEmailReviewOpen] = useState(false)
  const closeEmailReview = useCallback(() => {
    setEmailReviewOpen(false)
    void markReviewed(emailCaptures.map((c) => c.id))
  }, [emailCaptures, markReviewed])

  // Dismissing a wrongly-extracted row. The DELETE is deferred to the end of
  // the undo window rather than fired immediately: deleteTask cascades to the
  // row's per-person subtasks, and nothing on the schedule-actions surface can
  // recreate a parent WITH its children — so an immediate delete would make
  // "Undo" a promise this page cannot keep. Holding the row for ten seconds
  // costs nothing and makes the undo real. Newest wins: a second dismiss
  // commits the one already pending.
  const pendingDismissRef = useRef<string | null>(null)
  const [pendingDismiss, setPendingDismiss] = useState<{ id: string; title: string } | null>(null)
  // The delete is reached through a ref rather than closed over. `commitDismiss`
  // used to depend on `ctx`, which re-identifies on every task change — and
  // InboxUndoToast restarts its timer whenever its props change, so on a live
  // page the timer that OWNS the commit was perpetually reset and the delete
  // could never fire.
  const deleteTaskRef = useRef(ctx.onDeleteTask)
  useEffect(() => { deleteTaskRef.current = ctx.onDeleteTask }, [ctx.onDeleteTask])
  const commitDismiss = useCallback(() => {
    if (pendingDismissRef.current) deleteTaskRef.current?.(pendingDismissRef.current)
    pendingDismissRef.current = null
    setPendingDismiss(null)
  }, [])
  // And nothing at all committed on unmount: navigating away inside the window
  // left the row un-deleted for good while the sheet had already reported it
  // gone. No setState here — the component is on its way out.
  useEffect(() => () => {
    if (pendingDismissRef.current) deleteTaskRef.current?.(pendingDismissRef.current)
    pendingDismissRef.current = null
  }, [])
  const handleDismissEmailRow = useCallback((taskId: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    if (pendingDismissRef.current && pendingDismissRef.current !== taskId) commitDismiss()
    pendingDismissRef.current = taskId
    setPendingDismiss({ id: taskId, title: task.title })
  }, [tasks, commitDismiss])

  // Which sections the user has folded shut. Persisted; Unscheduled starts
  // collapsed because it holds the untimed-routine slab. A section whose
  // remaining items are all complete also renders collapsed unless the user
  // has explicitly opened it — one mechanism, not two.
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => readCollapsed())
  const [openedByUser, setOpenedByUser] = useState<Set<string>>(new Set())
  useEffect(() => onCollapsedChange(setCollapsedKeys), [])
  // Sets an explicit state per the CURRENT rendered `collapsed` value rather
  // than blindly flipping both `collapsedKeys` and `openedByUser` — flipping
  // both in lockstep made "explicitly folded" and "explicitly opened" track
  // each other exactly, so the one state that should open an auto-collapsed
  // section (`collapsedKeys` false AND `openedByUser` true) was unreachable.
  const toggleSection = useCallback((section: DaySection, currentlyCollapsed: boolean) => {
    const key = sectionKey(section)
    if (currentlyCollapsed) {
      setCollapsedKeys(setCollapsed(key, false))
      setOpenedByUser((prev) => new Set(prev).add(key))
    } else {
      setCollapsedKeys(setCollapsed(key, true))
      setOpenedByUser((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [])

  // ── Unprompted tier ────────────────────────────────────────────────────────
  // Live urgency facts, resolved from the tasks/events this view already has, so
  // the policy scores against the real clock rather than the engine's 6h-old hint.
  const resolveUnpromptedFacts = useCallback((s: ProactiveSuggestion) => {
    if (s.entityType === 'task') {
      const t = tasks.find(x => x.id === s.entityId)
      if (!t) return null
      return {
        dueAt: t.scheduledFor ? new Date(t.scheduledFor).toISOString() : null,
        waitingSince: t.isWaiting && t.waitingSince
          ? new Date(t.waitingSince).toISOString()
          : null,
        deferCount: t.deferCount ?? null,
      }
    }
    if (s.entityType === 'calendar_event') {
      const e = events.find(x => x.id === s.entityId)
      if (!e) return null
      return { eventStartAt: e.allDay ? null : (e.startTime ?? null) }
    }
    return null
  }, [tasks, events])

  const [suggestionsEnabled, setSuggestionsEnabled] = useSuggestionsEnabled()

  const unprompted = useUnpromptedSuggestions('today', {
    resolveFacts: resolveUnpromptedFacts,
    // Off means off, including the synthetic planning-cadence nudge, which is
    // generated client-side and would otherwise survive the toggle.
    // Planning-cadence suggestions retired with the 2026-08 analog-planning
    // pivot (the guided sessions they pointed at are gone).
    includeCadence: false,
  })

  // A "free" event carries no prep/handoff expectation — its suggestion chips
  // (e.g. "leave by…") never surface, even if the engine generated one before
  // the flag was set.
  const visibleUnpromptedItems = useMemo(() => {
    return unprompted.items.filter(
      (item) => !suggestionIsForFreeEvent(item.suggestion, events, ctx.eventNotesMap),
    )
  }, [unprompted.items, events, ctx.eventNotesMap])

  // `?why=1` renders each suggestion's policy verdict — the thing that makes a
  // silent surface debuggable instead of mystical.
  const showWhyDebug = useMemo(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('why') === '1'
  }, [])

  const handleUnpromptedAct = useCallback((item: UnpromptedItem) => {
    const action = resolveSuggestionAction(item.suggestion)
    switch (action.kind) {
      case 'plan_session':
        navigate(`/today?plan=${action.horizon}`)
        return
      case 'call':
        window.open(`tel:${action.phoneNumber}`, '_self')
        break
      case 'text':
        window.open(`sms:${action.phoneNumber}`, '_self')
        break
      case 'email':
        window.open(`mailto:${action.email}`, '_blank')
        break
      case 'open_link':
        window.open(action.url, '_blank')
        break
      case 'navigate':
        window.open(
          action.placeId
            ? `https://www.google.com/maps/place/?q=place_id:${action.placeId}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(action.location)}`,
          '_blank',
        )
        break
      case 'reveal': {
        // Must be the prefixed composite id Today selects by — a bare entity
        // uuid matches no row, so the panel silently never opens.
        const itemId = revealItemId(item.suggestion)
        if (itemId) onSelectItem?.(itemId)
        return
      }
    }
    void unprompted.act(item.suggestion.id)
  }, [navigate, unprompted, onSelectItem])

  // Timeline insert points: radial wheel pick → note composer (task/event/routine
  // are handled inline by TimelineInsertPoint via onCreate)
  const insert = useTimelineInsert()

  // Referentially-stable parser context for inline timeline quick-capture.
  const parserContacts = useMemo(
    () => Array.from(contactsMap?.values() ?? []).map(c => ({ id: c.id, name: c.name })),
    [contactsMap],
  )
  const parserProjectsList = useMemo(
    () => projects.map(p => ({ id: p.id, name: p.name })),
    [projects],
  )
  const parserFamilyMembersList = useMemo(
    () => familyMembers.map(m => ({ id: m.id, name: m.name })),
    [familyMembers],
  )
  const parserContext = useMemo<ParserContext>(() => ({
    projects: parserProjectsList,
    contacts: parserContacts,
    familyMembers: parserFamilyMembersList,
  }), [parserProjectsList, parserContacts, parserFamilyMembersList])

  // Note composer handlers: props take precedence, fall back to context (legacy prop??ctx pattern)
  const onCreateNoteAt = onCreateNoteAtProp ?? ctx.onCreateNoteAt
  const onAppendNoteAt = onAppendNoteAtProp ?? ctx.onAppendNoteAt
  const onLinkNote = onLinkNoteProp ?? ctx.onLinkNote
  const timelineNotes = timelineNotesProp ?? ctx.timelineNotes

  const discussion = discussionItems(tasks)

  // ── Clarity binoculars + remediation popover (overflow menu) ────────────────
  // Interactive Clarity readout restored to the Today header (a static status
  // glance also lives in the sidebar). Trigger is a binoculars icon with an
  // explanatory hover tooltip; clicking opens ClarityIndicator's popover.
  // The binoculars are color-coded by clarity level (green = excellent/good,
  // amber = fair, orange = needs attention) using the same health computation.
  const clarityHealth = useSystemHealth({ tasks, projects })
  const clarityColorClass = getHealthTextClasses(clarityHealth.healthColor)
  // Clarity curtain — a full-page "where you are → your next move" guide. The
  // binoculars pull it down. Signals are a calm read of the current state.
  const [clarityOpen, setClarityOpen] = useState(false)
  const clarityResult = useMemo(() => {
    const matchAll = makeAssigneeFilter([])
    const inboxCount = tasks.filter((t) => !t.completed && t.bucket === 'inbox').length
    const overdueCount = selectOverdue(tasks, true, matchAll).length
    const weekCount = selectHorizonPool(tasks, 'week', matchAll, currentWeekStart).length
    // One resolver call per routine replaces the hand-rolled domain filter +
    // date filter + `type !== 'daily'` everyday-approximation + resting check.
    // `routines` is no longer domain-pre-filtered upstream (HomeView passes it
    // raw so the resolver can apply rung 4 itself) — rung 4 (domain) is what
    // used to need the separate filterRoutinesForLayers call. `hideRoutines:
    // true` sweeps ambient everyday routines (rung 7's fuller everyday-ness
    // test is a deliberate widening of the old `type !== 'daily'` check — see
    // the task report for the resulting count delta), but it deliberately does
    // NOT sweep a pinned or dosed one (isPinnedToTimeline): a tracked
    // obligation with no time slot yet — e.g. a med-tracker dose — is still
    // placeable work, same as every other surface that honors the pin escape.
    // Do not special-case it back out.
    const untimedRoutines = routines.filter(
      (r) =>
        isDraggableRoutine(r) &&
        resolveRoutine(r, {
          date: viewedDate,
          prefs: { hideRoutines: true, layers },
        }).shows,
    ).length
    const isEvening = !!data.isToday && new Date().getHours() >= 17
    return computeClaritySteps({ inboxCount, overdueCount, placeableCount: weekCount + untimedRoutines, isEvening })
  }, [tasks, routines, viewedDate, data.isToday, currentWeekStart, layers])

  const onClarityStep = useCallback((id: ClarityStepId) => {
    if (id === 'inbox') navigate('/inbox')
    else if (id === 'carried') navigate('/inbox')
    // 'plan' and 'review' simply close — the guided daily-prep session they
    // launched left with the 2026-08 analog-planning pivot.
  }, [navigate])

  // In the overflow menu it reads like every other row: icon + label. The
  // icon keeps its health colour; the bare icon with only a hover tooltip
  // read as an unlabelled button (demo walkthrough 2026-09-04).
  const clarityTrigger = (
    <button
      type="button"
      onClick={() => setClarityOpen(true)}
      title="Where you are, and the next move to get clear"
      aria-label="Clarity — where you are and your next move"
      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[15px] text-neutral-600 transition-all hover:bg-neutral-100"
    >
      <Binoculars className={`w-5 h-5 ${clarityColorClass}`} />
      <span>Clarity</span>
    </button>
  )

  // ── Tasks map for parent task lookup ─────────────────────────────────────────
  const tasksMap = useMemo(() => {
    const map = new Map<string, Task>()
    for (const t of tasks) {
      map.set(t.id, t)
    }
    return map
  }, [tasks])

  // Share-to-family nudges keyed by event id, for inline rendering below events.
  const shareNudges = useShareToFamilyNudges(
    events,
    ctx.eventNotesMap,
    ctx.eventContextOverrides,
    ctx.getDomainForCalendar,
  )
  const shareNudgeByEventId = useMemo(() => {
    const m = new Map<string, (typeof shareNudges)[number]>()
    for (const n of shareNudges) m.set(n.eventId, n)
    return m
  }, [shareNudges])

  // Duplicate sweep — on demand; a passive count is the only unsolicited part.
  const sweep = useDuplicateSweep(data.sectionsOrder, data.grouped, ctx.onDeleteTask)

  // Suggested order + grouping — a preview you accept, never an auto-apply.
  // Applying reuses the same writers the drag gestures use.
  const proposal = useTodayProposal(data.sectionsOrder, data.grouped, projects, viewedDate, {
    onGroupItems, onReorderTasks: ctx.onReorderTasks,
  })

  const nowForDisplay = useMemo(() => new Date(nowTick), [nowTick])
  const dayName = useMemo(
    () => viewedDate.toLocaleDateString('en-US', { weekday: 'long' }),
    [viewedDate],
  )
  const decisionCount = data.attentionItems.length + emailCaptures.length + visibleUnpromptedItems.length

  const nextTimeLabel = upNext?.item.allDay
    ? ''
    : upNext?.item.startTime
      ? upNext.item.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : upNext ? 'Today' : ''
  // upNext only resolves against the wall clock, so it is empty on every day
  // but today. Looking at Saturday, the honest opener is what Saturday starts
  // with — saying "nothing left with a time on it" over a 7:00 AM list is the
  // kind of small lie that teaches people not to read the header.
  const dayItems = useMemo(
    () => data.sectionsOrder.flatMap((section) => data.grouped[section] ?? []),
    [data.sectionsOrder, data.grouped],
  )
  const firstTimed = useMemo(() => {
    const timed = dayItems.filter((i) => i.startTime && !i.completed)
    if (timed.length === 0) return null
    return timed.reduce((a, b) => (a.startTime!.getTime() <= b.startTime!.getTime() ? a : b))
  }, [dayItems])
  const firstTimedLabel = firstTimed?.allDay
    ? ''
    : firstTimed?.startTime
      ? firstTimed.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : ''

  // The subline says what is actually next, by name. It replaced a tally
  // ("2 open of 2 actionable items") and a pair of status cards that between
  // them managed to point at the timeline without ever naming the thing on it.
  // Today is a commitment surface: no counts, no scores.
  //
  // A clear Today (nothing left with a time on it, or the whole day is
  // empty) looks FORWARD rather than sitting mute — the demo run 2026-09-06
  // found "Your day is clear" sitting over a week that already had 19 things
  // planned on it.
  const heroLine = loading
    ? 'Loading the day.'
    : data.isToday
      ? upNext
        ? `Next: ${upNext.item.title}${nextTimeLabel ? ` · ${nextTimeLabel}` : ''}`
        : forwardLine(forwardLook(tasks, viewedDate), viewedDate)
      : data.counts.totalItems === 0
        ? 'Nothing on the board for this day.'
        : firstTimed
          ? `Starts with: ${firstTimed.title}${firstTimedLabel ? ` · ${firstTimedLabel}` : ''}`
          : 'Nothing with a time on it.'
  // Viewing another day: "Tomorrow"/"Yesterday" reads better than repeating the
  // weekday the date line above already shows.
  const relativeDayLabel = useMemo(() => {
    const a = new Date(viewedDate); a.setHours(0, 0, 0, 0)
    const b = new Date(nowForDisplay); b.setHours(0, 0, 0, 0)
    const days = Math.round((a.getTime() - b.getTime()) / 86400000)
    if (days === 1) return 'Tomorrow'
    if (days === -1) return 'Yesterday'
    return dayName
  }, [viewedDate, nowForDisplay, dayName])

  // ── Drag: the pure resolver's inputs ─────────────────────────────────────────
  const { isReadOnlyCalendar } = useCalendarPermissions()

  const isReadOnlyEvent = useCallback((item: TimelineItem) => {
    const ev = item.originalEvent
    return isReadOnlyCalendar(ev?.calendar_id ?? ev?.calendarId ?? null)
  }, [isReadOnlyCalendar])

  // Every untimed task for this day, INCLUDING rows the domain or assignee
  // filter hides. Reorder renormalises against this: renormalising only the
  // rendered subset resets it to 0…n×1000 while hidden siblings keep their old
  // values and interleave on the next render (Stage 2a residual 3).
  const untimedOrder = useMemo(() => {
    const day = new Date(viewedDate); day.setHours(0, 0, 0, 0)
    const sameDay = (d?: Date | null) => {
      if (!d) return false
      const x = new Date(d); x.setHours(0, 0, 0, 0)
      return x.getTime() === day.getTime()
    }
    // Completed all-day tasks are INCLUDED. They still render on Today (they
    // linger), so leaving them out makes this set not-actually-full: a
    // renormalise would hand 0…n×1000 to the incomplete rows and leave the
    // completed ones null, sinking every one of them to the bottom of All Day
    // the first time anything is reordered. Same shape as Stage 2a residual 3,
    // caught by dragging on :5173 rather than by any test.
    const untimed = tasks
      .filter((t) => t.bucket === 'timed' && t.isAllDay && sameDay(t.scheduledFor))
      .sort((a, b) => {
        const ao = a.sortOrder ?? null, bo = b.sortOrder ?? null
        if (ao != null && bo != null) return ao - bo
        if (ao != null) return -1
        if (bo != null) return 1
        return a.title.localeCompare(b.title)
      })
    return {
      ids: untimed.map((t) => t.id),
      orders: new Map(untimed.map((t) => [t.id, t.sortOrder ?? null])),
    }
  }, [tasks, viewedDate])

  const resolve = useCallback((activeId: string, overId: string) => resolveDrop({
    activeId,
    overId,
    sections: data.grouped,
    fullOrderIds: { allday: untimedOrder.ids },
    orders: untimedOrder.orders,
    viewedDate,
    isReadOnlyEvent,
    // Read fresh at drop time — a stale array silently drops members and
    // addToGroup cannot defend itself (Stage 2a residual 4).
    groupMembersOf: (wrapperRawId) => tasksMap.get(wrapperRawId)?.groupMembers ?? [],
  }), [data.grouped, untimedOrder, viewedDate, isReadOnlyEvent, tasksMap])

  /**
   * Apply what the resolver decided. Three rules are worth naming, because each
   * is a way this could silently do the wrong thing:
   *
   * 1. `bucket:'timed'` and `scheduledFor` move in LOCKSTEP. A scheduledFor
   *    without the bucket never surfaces on Today at all — selectTimed gates on
   *    the bucket (taskPools.ts).
   * 2. Retiming a routine writes a ONE-DAY override via onPushRoutine, which
   *    reaches reschedule() → status:'pending' + deferred_to, exactly what
   *    grouping.ts reads back as a same-day time override. It must never call
   *    scheduleRoutineOnDate, which rewrites recurrence_pattern permanently —
   *    one drag would move every future occurrence.
   * 3. A refusal is SAID OUT LOUD. Silently ignoring a drop is how a surface
   *    teaches people not to trust it.
   */
  const applyIntents = useCallback(async (intents: DropIntent[]) => {
    for (const intent of intents) {
      switch (intent.kind) {
        case 'refuse':
          onNotify?.(intent.reason)
          break

        case 'set-time': {
          if (intent.itemId.startsWith('task-')) {
            const taskId = intent.itemId.replace('task-', '')
            const before = tasks.find((t) => t.id === taskId)
            // A drag is the easiest action in the app to do by accident — but
            // a cancelled domain gate (the row is Unsorted, the DomainGate
            // dialog is up) writes nothing, so writeMoveAndRegisterUndo skips
            // the "Moved · Undo" toast for a move that didn't happen.
            await writeMoveAndRegisterUndo(
              onUpdateTask,
              taskId,
              { bucket: 'timed', scheduledFor: intent.when, isAllDay: false },
              before && { bucket: before.bucket, scheduledFor: before.scheduledFor, isAllDay: before.isAllDay },
              `Moved "${before?.title}"`,
              ctx.onRegisterUndo,
            )
          } else if (intent.itemId.startsWith('routine-')) {
            const { routineId, slot } = parseRoutineTimelineId(intent.itemId)
            // Dosed steps are refused upstream; this is belt-and-braces.
            if (slot === null) onPushRoutine?.(routineId, intent.when)
          } else if (intent.itemId.startsWith('event-')) {
            const ev = findTimelineItem(data.grouped, intent.itemId)?.originalEvent
            if (ev) {
              const startStr = ev.start_time || ev.startTime
              const endStr = ev.end_time || ev.endTime
              const durationMs = startStr && endStr
                ? new Date(endStr).getTime() - new Date(startStr).getTime()
                : 30 * 60_000
              await ctx.onUpdateEvent?.(ev.google_event_id || ev.id, {
                startTime: intent.when,
                endTime: new Date(intent.when.getTime() + durationMs),
              })
            }
          }
          break
        }

        case 'make-all-day': {
          if (!intent.itemId.startsWith('task-')) {
            // A routine/event instance has no all-day concept to write. Say so
            // rather than accepting the gesture and doing nothing.
            onNotify?.('Only tasks can be moved to All day.')
            break
          }
          const midnight = new Date(viewedDate)
          midnight.setHours(0, 0, 0, 0)
          const allDayId = intent.itemId.replace('task-', '')
          const wasTimed = tasks.find((t) => t.id === allDayId)
          // A cancelled domain gate writes nothing — writeMoveAndRegisterUndo
          // skips the "Moved · Undo" toast for a move that didn't happen.
          await writeMoveAndRegisterUndo(
            onUpdateTask,
            allDayId,
            { bucket: 'timed', scheduledFor: midnight, isAllDay: true },
            wasTimed && { bucket: wasTimed.bucket, scheduledFor: wasTimed.scheduledFor, isAllDay: wasTimed.isAllDay },
            `Moved "${wasTimed?.title}" to All day`,
            ctx.onRegisterUndo,
          )
          break
        }

        case 'reorder':
          await ctx.onReorderTasks?.(intent.writes)
          break

        case 'create-group': {
          const wrapperId = await onGroupItems?.(
            intent.taskIds, intent.memberRefs, intent.groupName, intent.date, intent.isAllDay,
          )
          // Straight into the name field. The group's placeholder name is the
          // one thing the drag couldn't infer, so asking for it now — with the
          // text selected — costs no extra gesture.
          if (wrapperId) setRenamingGroupId(wrapperId)
          // Undo dissolves the group: detach the members, drop the wrapper.
          if (wrapperId) {
            ctx.onRegisterUndo?.('Made a group', () => {
              void ctx.onUngroup?.(wrapperId, intent.taskIds)
            })
          }
          break
        }

        case 'add-to-group': {
          await ctx.onAddToGroup?.(
            intent.wrapperId, intent.taskIds, intent.memberRefs, intent.date, intent.isAllDay,
          )
          const joined = intent.taskIds
          if (joined.length > 0) {
            ctx.onRegisterUndo?.('Added to group', () => {
              for (const id of joined) void ctx.onRemoveFromGroup?.(id)
            })
          }
          break
        }

        case 'remove-from-group': {
          const leaving = tasks.find((t) => t.id === intent.taskId)
          const formerParent = leaving?.parentTaskId
          await ctx.onRemoveFromGroup?.(intent.taskId)
          if (formerParent) {
            ctx.onRegisterUndo?.('Removed from group', () => {
              void ctx.onAddToGroup?.(
                formerParent, [intent.taskId], [], leaving?.scheduledFor ?? viewedDate,
                leaving?.isAllDay ?? false,
              )
            })
          }
          break
        }
      }
    }
  }, [ctx, onUpdateTask, onPushRoutine, onGroupItems, onNotify, viewedDate, data.grouped])

  // ── Handler stubs ─────────────────────────────────────────────────────────────
  const handleSelectItem = useCallback((id: string | null) => {
    onSelectItem(id)
  }, [onSelectItem])

  const listRef = useRef<HTMLDivElement>(null)

  // ── First-item marker (exactly one element gets data-today-first) ────────────
  // The first item id of the first non-empty section.
  const firstSectionItemId: string | null = (() => {
    for (const section of data.sectionsOrder) {
      const items = data.grouped[section]
      if (items && items.length > 0) return items[0].id
    }
    return null
  })()

  // ── Print: mount the compact list, then hand the page to the printer ──
  // The button sets state and an effect prints on the next commit, so the list
  // is in the DOM before the browser snapshots. beforeprint/afterprint cover
  // Cmd+P, which never goes through the button.
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    const before = () => setPrinting(true)
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
  const printList = useCallback(() => setPrinting(true), [])
  useEffect(() => {
    if (!printing) return
    // Next frame: let the list paint before the print dialog freezes the page.
    //
    // Teardown belongs to `afterprint` alone. In a browser window.print()
    // blocks and afterprint fires as the dialog closes, so clearing here too
    // was merely redundant — but in the Mac shell printing is handed to AppKit,
    // whose print panel is a sheet that outlives this call and renders the page
    // when the user confirms. Unmounting the list on the next line would print
    // the screen layout instead of the list.
    const id = requestAnimationFrame(() => window.print())
    return () => cancelAnimationFrame(id)
  }, [printing])

  // ── Render ────────────────────────────────────────────────────────────────────
  /* Today's secondary controls behind one button. ONE instance: on desktop it
     sits in the controls strip; on mobile that strip is `hidden md:flex`, so
     the same menu mounts beside the date masthead instead — otherwise "Plan
     from paper" was unreachable on the one device that always has a camera. */
  /* Plan from paper is the way a day gets planned here — the paper plan is
     the product (see the analog pivot). On desktop the sidenav carries it
     (Sidebar.tsx, from any page); on a phone the sidenav is hidden, so this
     button sits beside the date masthead. Never back in the overflow —
     Scott: "too important to be hidden" (2026-09-03). */
  const planFromPaperButton = onOpenPlanFromPaper && (
    <button
      type="button"
      onClick={onOpenPlanFromPaper}
      title="Plan from paper — photograph your written plan and place its items"
      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-primary-500/40 bg-primary-50 px-2.5 py-1.5 text-[13px] font-semibold text-primary-700 transition-colors hover:bg-primary-100"
    >
      <NotebookPen className="w-4 h-4" />
      <span>Plan from paper</span>
    </button>
  )
  const overflowMenu = (
    <TodayOverflowMenu>
      <button
        type="button"
        onClick={toggleHideRoutines}
        title={hideRoutines ? 'Show daily activities' : 'Hide daily activities'}
        aria-label={hideRoutines ? 'Show daily' : 'Hide daily'}
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[15px] text-neutral-600 transition-all hover:bg-neutral-100"
      >
        {createElement(hideRoutines ? EyeOff : Eye, { className: 'w-5 h-5' })}
        <span>{hideRoutines ? 'Show daily' : 'Hide daily'}</span>
      </button>
      {/* The unprompted tier's ONE control (2026-08-18): shows the pending
          count, toggles the suggestions onto/off the page. Off by default —
          the tier is opt-in. Only this tier is gated: the assistant pane
          and the chips inside an item you opened still work. Lives here,
          next to "Hide daily", because both answer the same question: how
          much is this page allowed to put in front of me. */}
      <button
        type="button"
        onClick={() => setSuggestionsEnabled(!suggestionsEnabled)}
        title={suggestionsEnabled
          ? 'Stop the assistant suggesting things on this page'
          : 'Show what the assistant would suggest for this page'}
        aria-pressed={suggestionsEnabled}
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[15px] text-neutral-600 transition-all hover:bg-neutral-100"
      >
        <Sparkles className={`w-5 h-5 ${suggestionsEnabled ? '' : 'opacity-40'}`} />
        <span>
          {suggestionsEnabled ? 'Hide suggestions' : 'Show suggestions'}
          {visibleUnpromptedItems.length > 0 && ` · ${visibleUnpromptedItems.length}`}
        </span>
      </button>
      <button
        type="button"
        onClick={printList}
        title="Print a compact list of this day"
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[15px] text-neutral-600 transition-all hover:bg-neutral-100"
      >
        <Printer className="w-5 h-5" />
        <span>Print list</span>
      </button>
      {/* The door to the morning review — carried-over and slipped work,
          triaged in a bounded drawer. Off the page and into the menu
          (2026-09-21): Today spends no line on the backlog, and the Planning
          panel's fold is the page's one entrance to unfinished work. Present
          whenever either backlog population is non-empty, and never a count. */}
      {data.isToday && hasBacklog && (
        <button
          type="button"
          onClick={() => setReviewMode('morning')}
          title="Decide what to do with work that slipped past its day"
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[15px] text-neutral-600 transition-all hover:bg-neutral-100"
        >
          <History className="w-5 h-5" />
          <span>Review carried-over work</span>
        </button>
      )}
      {data.isToday && !reviewInFooter && (
        <button
          type="button"
          onClick={() => setReviewMode('evening')}
          title="Reflect, prep for tomorrow, and close the day"
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[15px] text-neutral-600 transition-all hover:bg-neutral-100"
        >
          <Moon className="w-5 h-5" />
          <span>End of day review</span>
        </button>
      )}

      {clarityTrigger}

      {/* Signals that only appear when they have something to say. */}
      {(discussion.length > 0 ||
        (data.isToday && (sweep.pairs.length > 0 || proposal.count > 0))) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-neutral-100 px-2.5 pt-2 text-[12px] text-neutral-400">
          {discussion.length > 0 && (
            <DiscussionBadge items={discussion} onSelectItem={onSelectItem} />
          )}
          {data.isToday && sweep.pairs.length > 0 && (
            <DuplicateSweepTrigger count={sweep.pairs.length} onOpen={() => sweep.setOpen(true)} />
          )}
          {data.isToday && proposal.count > 0 && (
            <ProposalTrigger count={proposal.count} onOpen={() => proposal.setOpen(true)} />
          )}
        </div>
      )}
    </TodayOverflowMenu>
  )

  // The top group's shared column (PAGE_COLUMN_WIDE) on desktop, so the
  // masthead cards line up page to page; full-bleed on phones for the
  // timeline (px-0), which is why this isn't the constant itself. `mr-auto`,
  // not `mx-auto`: the column starts where every other page's does — see
  // pageLayout.ts.
  const desktopToolbar = (
                  <div
                    data-testid="today-controls"
                    className="hidden shrink-0 md:flex items-center gap-1"
                  >
              {/* The week/month LISTS — separate dropdowns, deliberately OUTSIDE
                  the review drawer. Always rendered (a place to look must always
                  be there). Each row leads with the daily gesture — tick, or
                  "Do today" from the week list / "This week" from the month
                  list — with the triage verbs behind ⋯ (planning lists, Step 4). */}
              {!desktopControls && <HorizonPoolDropdown
                label="This week"
                referenceKind="week"
                referenceDate={currentWeekStart}
                tasks={weekPool}
                offer={['today', 'tomorrow', 'someday', 'deleted']}
                lead="today"
                emptyCopy="Nothing on this week's list."
                viewedDate={viewedDate}
                onUpdateTask={(id, u) => onUpdateTask?.(id, u)}
                onPushTask={ctx.onPushTask}
                onDeleteTask={ctx.onDeleteTask}
                onCompleteTask={onToggleTask}
                benchRoute="/week"
                benchLabel="Open this week"
              />}
              {!desktopControls && <HorizonPoolDropdown
                label="This month"
                referenceKind="month"
                tasks={monthPool}
                offer={['week', 'today', 'someday', 'deleted']}
                lead="week"
                emptyCopy="Nothing on this month's list."
                placedFor={(t) => placementFate(t, tasks)}
                viewedDate={viewedDate}
                onUpdateTask={(id, u) => onUpdateTask?.(id, u)}
                onPushTask={ctx.onPushTask}
                onDeleteTask={ctx.onDeleteTask}
                onCompleteTask={onToggleTask}
              />}

              {onSelectAssignees && ((assigneesWithTasks?.length ?? 0) > 0 || hasUnassignedTasks) && (
                <AssigneeFilter
                  selectedAssignees={selectedAssignees ?? []}
                  onSelectAssignees={onSelectAssignees}
                  assigneesWithTasks={assigneesWithTasks ?? []}
                  hasUnassignedTasks={!!hasUnassignedTasks}
                />
              )}

              {!isMobile && overflowMenu}
            </div>
  )

  // ── The journal split (journalSplit.ts) ──────────────────────────────
  const journal = useMemo(
    () => splitTodayJournal(data.grouped, { isToday: data.isToday, now: new Date(nowTick), upNextId }),
    [data.grouped, data.isToday, nowTick, upNextId],
  )
  // Earlier today folds by default, per day: unfolding it is about this
  // reading of this day, not a standing preference.
  const focusWork = useMemo(() => splitCompletedFocus(journal.focus), [journal.focus])
  const [completedOpenDay, setCompletedOpenDay] = useState<string | null>(null)
  const completedOpen = completedOpenDay === localYmd(viewedDate)
  const [earlierOpenDay, setEarlierOpenDay] = useState<string | null>(null)
  const earlierOpen = earlierOpenDay === localYmd(viewedDate)
  // "Add task" beside the date opens the add box at the head of Tasks; the
  // box unmounts when it closes itself. Keyed by day so a day change closes it.
  const [addOpenDay, setAddOpenDay] = useState<string | null>(null)
  const addOpen = addOpenDay === localYmd(viewedDate)
  const canAdd = data.isToday && !!(ctx.onCreateTaskParsed ?? ctx.onCreateTask)
  // The page's two controls sit on the "For today" heading (approved white
  // journal, 2026-09-22): one Choose, one Add task. Nothing by the date.
  const addTaskButton = canAdd ? (
    <button
      type="button"
      onClick={() => setAddOpenDay(addOpen ? null : localYmd(viewedDate))}
      aria-expanded={addOpen}
      className="daybook-add-task inline-flex items-center gap-1 py-1.5 text-[13px] font-medium text-sage-600 transition-colors hover:text-sage-700"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      Add task
    </button>
  ) : undefined
  // Everything each slice of the journal shares — the same rows and actions
  // the one flat list had, handed to three renders of it.
  const listProps = {
    isReadOnlyEvent,
    viewedDate,
    isMobile,
    selectedItemId,
    upNextId,
    upNextStatus,
    now: new Date(nowTick),
    firstSectionItemId,
    collapsedKeys,
    openedByUser,
    onToggleSection: toggleSection,
    selectedKeys,
    onToggleBulkSelect: toggleBulkSelect,
    tasksMap,
    shareNudgeByEventId,
    parserContext,
    insert,
    onSelectItem: handleSelectItem,
    onToggleTask,
    onCompleteRoutine,
    onCompleteEvent,
    panelOpen,
    onClosePanel,
    renamingGroupId,
    onRenameGroupDone: () => setRenamingGroupId(null),
    currentMemberId: meId,
  }

  return (
    <div className="w-full max-w-[1152px] mr-auto px-0 py-2 md:px-10 lg:px-14 md:pt-2 md:pb-8">
      {desktopControls && !isMobile && <DesktopPageControls>{desktopToolbar}</DesktopPageControls>}
      {reviewInFooter && data.isToday && (
        <DesktopFooterAction>
          <button type="button" onClick={() => setReviewMode('evening')} title="Reflect, prep for tomorrow, and close the day">
            Review today
          </button>
        </DesktopFooterAction>
      )}
      {/* Mounted only while printing. Keeping it permanently in the DOM would
          duplicate every title — invisible to the eye (CSS-hidden) but very
          real to screen readers and to any getByText. */}
      {printing && (
        <PrintableDayList
          date={viewedDate}
          sectionsOrder={data.sectionsOrder}
          grouped={data.grouped}
          overdue={data.overdueTasks}
        />
      )}
      {/* Mobile-only action row. The date nav that used to live here moved into
          the day card below, which now carries it on every breakpoint. */}
      <div data-testid="today-mobile-masthead" className="md:hidden px-3 mb-2 flex flex-wrap items-center justify-end gap-2">
        {isMobile && planFromPaperButton}
        {isMobile && onSelectAssignees && ((assigneesWithTasks?.length ?? 0) > 0 || hasUnassignedTasks) && (
          <AssigneeFilter
            selectedAssignees={selectedAssignees ?? []}
            onSelectAssignees={onSelectAssignees}
            assigneesWithTasks={assigneesWithTasks ?? []}
            hasUnassignedTasks={!!hasUnassignedTasks}
          />
        )}
        {isMobile && overflowMenu}
      </div>

      {/* Needs your OK — COS-proposed actions awaiting approval. Top of Today
          so the assistant's proposals are the first thing you can clear in a
          tap. Renders nothing when the queue is empty. */}
      {data.isToday && (
        <div className="px-3 md:px-0">
          <NeedsYourOK />
        </div>
      )}

      {/* An open masthead and continuous agenda give Today the shape of a daybook. */}
      <MastheadCard
        variant="daybook"
        // The date gives the page its identity; the chosen work gives it its
        // purpose (2026-09-19). The eyebrow says where the day sits — Today,
        // Tomorrow, a weekday — and still opens the date picker.
        eyebrow={<DayNavCluster viewedDate={viewedDate} onDateChange={onDateChange} variant="inline" label={data.isToday ? 'Today' : relativeDayLabel} />}
        title={viewedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        // Adding moved to the "For today" heading with Choose (2026-09-22):
        // the date is the page's identity, the heading holds its two verbs.
        // "Next: …" is the Up next marker's job now, inside Schedule. The
        // line stays only when it says something the list can't: a clear day
        // looking forward, or another day's opener.
        subline={data.isToday && upNext ? undefined : heroLine}
        // Domain chooser + assistant toggle, in the card's corner.
        controls={headerControls}
        // The masthead's ear: today's weather, one quiet line. The feed only
        // knows today, so another day's page says nothing rather than
        // showing today's sky over Saturday.
        aside={data.isToday ? <WeatherChip now={nowForDisplay} /> : undefined}
        // Shell desktop controls live in the page navigation; standalone
        // mounts retain the footer controls as a fallback.
        footer={desktopControls ? undefined : desktopToolbar}

      />


      {/* The rail column only exists when the rail does; otherwise the day gets
          the full width instead of a 320px empty gutter. */}
      <div className={`px-3 md:px-0 ${decisionCount > 0 ? '@[62rem]:grid @[62rem]:grid-cols-[minmax(0,1fr)_320px] @[62rem]:items-start @[62rem]:gap-8' : ''}`}>
        <main className="min-w-0">
          {/* The "N need a decision" banner that stood here at narrow widths
              is gone (Scott, 2026-09-21): a count on Today is a scoreboard,
              and it sent you to the Inbox. Unfinished work now has one quiet
              line below Tasks — "Review unfinished work" — that opens the
              Planning panel with that list expanded; email captures keep the
              footer's "New from email", suggestions the ⋯ menu. */}
      {/* The agenda is part of the page, with no enclosing card. */}
      <div ref={listRef} {...agendaDrop} className={`daybook-agenda${agendaDropOver ? ' daybook-agenda-drop' : ''}`}>
        {/* Needed today — hand-curated, silent when empty. Placed first so a
            marked item reads as the day's opening note, not buried under the
            timeline. Safe at the top only because it renders nothing when
            nothing is marked (see NeededTodayNote). */}
        <NeededTodayNote
          tasks={tasks}
          viewedDate={viewedDate}
          // Only the evening "Tomorrow" group draws a pill, and only to say
          // whose bag has to be packed before the morning.
          members={familyMembers}
          onToggleTask={onToggleTask}
          onOpenTask={(id) => handleSelectItem(`task-${id}`)}
          // Into the temporal flow: same write shape as the bulk scheduler
          // above — scheduled_for implies bucket 'timed', and isAllDay is
          // always a real boolean (the invariant pair).
          onScheduleTask={(id, date, isAllDay) => onUpdateTask?.(id, { bucket: 'timed', scheduledFor: date, isAllDay })}
          onScheduleListItem={ctx.onScheduleListItemAsTask}
        />

        {/* Assistant lines — the unprompted tier, rendered ONLY when the ⋯
            menu's "Show suggestions" toggle is on (off by default; the menu
            entry carries the pending count). Only this tier is gated: chips
            inside an item you opened are answers to a question you asked by
            opening it. */}
        {suggestionsEnabled && (
          <UnpromptedLines
            items={visibleUnpromptedItems}
            onAct={handleUnpromptedAct}
            todayState={(item) => {
              if (item.suggestion.entityType !== 'task' || !ctx.onUpdateTask) return null
              const task = findTaskById(tasks, item.suggestion.entityId)
              if (!task || task.completed || task.isGoal) return null
              return task.scheduledFor && localYmd(task.scheduledFor) === localYmd(new Date()) ? 'added' : 'available'
            }}
            onAddToToday={async (item) => {
              // Accepting a suggestion plans the existing task; it does not
              // perform its Call action or mark that action as completed.
              return planActions.chooseTaskDay(item.suggestion.entityId, new Date())
            }}
            onSnooze={unprompted.snooze}
            decisions={unprompted.decisions}
            showWhy={showWhyDebug}
          />
        )}

        {loading && data.counts.totalItems === 0 ? (
          // While the day's data is still in flight, an empty list means "not
          // loaded yet" — never a false "nothing chosen" flash.
          <p className="py-16 text-center font-display text-xl text-neutral-700">Loading your day…</p>
        ) : (
          <TodayDragProvider
            resolve={resolve}
            onIntents={(intents) => { void applyIntents(intents) }}
            renderOverlay={(activeId) => {
              const item = findTimelineItem(data.grouped, activeId)
              return item ? (
                <div className="inline-flex max-w-[22rem] items-center gap-2 rounded-xl border border-primary-200 bg-bg-elevated px-3 py-2 text-sm shadow-lg">
                  <GripVertical className="h-4 w-4 shrink-0 text-neutral-400" />
                  <span className="truncate">{item.title}</span>
                </div>
              ) : null
            }}
          >
          {/* Today as a daily journal (2026-09-19): Week arranges the
              commitments; Today is where you settle into a few of them. The
              same rows, the same actions — read as what you chose, what is
              still ahead, and what is already behind you. */}
          <section aria-labelledby="today-focus-heading" className="daybook-journal-section today-focus-card">
            <div className="daybook-journal-heading">
              {/* "For today" holds the page's two verbs (approved white
                  journal, 2026-09-22): Choose opens and closes the chooser —
                  the dock beside the page, or the sheet on a phone — and Add
                  task opens the add box at the head of this list. */}
              <h2 id="today-focus-heading">{data.isToday ? 'For today' : 'For this day'}</h2>
              <div className="daybook-heading-actions">
                <button
                  type="button"
                  onClick={openPlan}
                  aria-expanded={chooserOpen}
                  aria-label={chooserOpen ? 'Close shelves' : 'Shelves'}
                  className={`daybook-choose${chooserOpen ? ' is-open' : ''}`}
                >
                  <PanelLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Shelves</span>
                </button>
                {addTaskButton}
              </div>
            </div>
            {/* The add box, at the head of the list it adds to. Mounted only
                while open; it unmounts itself on Escape or an empty blur. */}
            {addOpen && canAdd && (
              <div className="mt-2 mb-1">
                <TodayAddInput
                  key={localYmd(viewedDate)}
                  defaultExpanded
                  onCollapse={() => setAddOpenDay(null)}
                  onAdd={ctx.onCreateTaskParsed!}
                  parserContext={ctx.parserContext!}
                  resolver={ctx.resolverContext!}
                  getRecentTaskForContact={ctx.getRecentTaskForContact}
                />
              </div>
            )}
            {/* On a phone the Planning panel is a sheet, not an inline fold. */}
            {!usePin && (
              <PlanningSheet open={planOpenInline} onClose={() => setPlanOpenDay(null)} plan={data.dayPlan} day={viewedDate} actions={planPanelActions} />
            )}
            {focusWork.activeCount > 0 ? (
              <TodaySectionList
                {...listProps}
                sectionsOrder={FOCUS_SECTIONS}
                grouped={focusWork.active}
                // A filtered list cannot use full-day gap indices. Direct
                // entry stays on Add task; timed scheduling keeps its gaps.
                dropTargets={false}
                anytimeHeader={false}
              />
            ) : (
              // One door to the chooser (the labelled Shelves button),
              // one to adding (Add task by the date) — the empty list says
              // what those are for and offers no third prompt (Scott via
              // Codex, 2026-09-22).
              <div className="py-4">
                <p className="font-display text-lg text-neutral-600">{focusWork.completedCount ? 'Everything on your list is done.' : 'Nothing chosen yet.'}</p>
                <p className="mt-1 text-[14px] text-neutral-500">
                  Choose from this week's tasks, or add something for {data.isToday ? 'today' : 'this day'}.
                </p>
              </div>
            )}
            {focusWork.completedCount > 0 && <div className="today-completed">
              <button type="button" aria-expanded={completedOpen} onClick={() => setCompletedOpenDay(completedOpen ? null : localYmd(viewedDate))}>
                {completedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}Completed · {focusWork.completedCount}
              </button>
              {completedOpen && <TodaySectionList {...listProps} sectionsOrder={FOCUS_SECTIONS} grouped={focusWork.completed} anytimeHeader={false} dropTargets={false} />}
            </div>}
          </section>

          {/* Unfinished work from earlier has ONE entrance: the Planning
              panel's fold. The quiet line that used to sit here was a second
              door (2026-09-21). */}
          <section aria-labelledby="today-ahead-heading" className="daybook-journal-section">
            <div className="daybook-journal-heading">
              <h2 id="today-ahead-heading">Schedule</h2>
            </div>
            {journal.allDayEvents.length > 0 && (
              <ul className="daybook-journal-allday" aria-label="All day">
                {journal.allDayEvents.map((ev) => (
                  <li key={ev.id}>
                    <button type="button" onClick={() => handleSelectItem(ev.id)}>{ev.title}</button>
                  </li>
                ))}
              </ul>
            )}
            <TodaySectionList
              {...listProps}
              sectionsOrder={TIMED_SECTIONS}
              grouped={journal.ahead}
              gapOffset={journal.earlierCount}
            />
            {journal.aheadCount === 0 && (
              <p className="py-3 text-[15px] text-neutral-500">
                {/* A connected calendar with nothing on it must not read like a
                    disconnected one (the calendar status line above covers the
                    other states). */}
                {/* "Clear" is a claim: connected, synced, and no layer filtered
                    out. Otherwise say only what is shown — a hidden Personal
                    calendar under a Family filter is not a clear day. */}
                {data.isToday
                  ? (calendarConnected && !calendarError && layers.size === ALL_LAYERS.size
                      ? 'Nothing else with a time today. Your calendar is clear.'
                      : calendarConnected
                        ? 'Nothing else with a time today. No events shown for your current view.'
                        : 'Nothing else with a time today.')
                  : 'Nothing with a time on this day.'}
              </p>
            )}
            {journal.earlierSummary.rows > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  aria-expanded={earlierOpen}
                  onClick={() => setEarlierOpenDay(earlierOpen ? null : localYmd(viewedDate))}
                  className="inline-flex items-center gap-1 text-[13px] text-neutral-500 hover:text-neutral-800"
                >
                  {earlierOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Earlier today · {journal.earlierSummary.rows}
                  {journal.earlierSummary.notDone > 0 && ` · ${journal.earlierSummary.notDone} not done`}
                </button>
                {earlierOpen && (
                  <div className="mt-1 opacity-90">
                    <TodaySectionList
                      {...listProps}
                      sectionsOrder={TIMED_SECTIONS}
                      grouped={journal.earlier}
                      dropTargets={false}
                      upNextId={undefined}
                    />
                  </div>
                )}
              </div>
            )}
          </section>
          {/* Below the schedule, not above the date: the one planning
              reminder Today carries (2026-09-22). */}
          {data.isToday && afterSchedule}
          </TodayDragProvider>
        )}

        {/* Backlog footer — ONE muted line merging carried-over and
            needs-attention, deliberately OUTSIDE the totalItems ternary above.
            `counts.totalItems` does not include this work, so a day whose only
            remaining work is backlog renders "Your day is clear" — with 35
            items rotting invisibly behind it. That is exactly the
            permanently-buried failure expiry must not cause, so the footer
            renders in BOTH branches whenever either set is non-empty.

            Carried-over expands its list inline (those tasks have no other
            home); Review opens the morning Review drawer — Scott asked for
            ACTIVE management of this set from Today (2026-08-18), so the
            passive navigate-to-/week gave way to a bounded triage ritual.
            The page itself still spends only this one line: the drawer is a
            modal you summon, not furniture. */}
        {data.isToday && (
          <TodayBacklogFooter
            onReviewEmail={emailCaptures.length > 0 ? () => setEmailReviewOpen(true) : undefined}
          />
        )}

        {/* Undo window for a dismissed email row. Letting the toast go — by
            timeout or by the X — is what commits the delete. */}
        {pendingDismiss && (
          <InboxUndoToast
            message={`"${pendingDismiss.title}" dismissed`}
            onUndo={() => { pendingDismissRef.current = null; setPendingDismiss(null) }}
            onDismiss={commitDismiss}
          />
        )}
      </div>
        </main>

        {/* The decision rail is not a permanent fixture — it appears when the
            assistant, the inbox or email actually put something in it, and is
            absent otherwise. A card whose job is to announce its own emptiness
            still costs a third of the page. */}
        {decisionCount > 0 && (
        <aside className="mt-4 hidden space-y-3 @[62rem]:mt-0 @[62rem]:block">
          <section className="daybook-decisions">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-accent-600">Needs a Decision</p>
                <h2 className="font-display text-lg font-semibold text-neutral-900">
                  {decisionCount} item{decisionCount === 1 ? '' : 's'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => navigate('/inbox')}
                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Open inbox"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              {data.attentionItems.length > 0 && (
                <button type="button" onClick={() => setReviewMode('morning')} className="flex w-full items-center justify-between border-b border-neutral-200 px-3 py-2 text-left text-amber-900 transition-colors hover:bg-amber-100/70">
                  <span className="min-w-0 truncate">Review attention queue</span>
                  <span className="ml-3 shrink-0 text-xs font-semibold tabular-nums">{data.attentionItems.length}</span>
                </button>
              )}
              {emailCaptures.length > 0 && (
                <button type="button" onClick={() => setEmailReviewOpen(true)} className="flex w-full items-center justify-between border-b border-neutral-200 px-3 py-2 text-left text-primary-900 transition-colors hover:bg-primary-100/70">
                  <span className="min-w-0 truncate">Review captured email</span>
                  <span className="ml-3 shrink-0 text-xs font-semibold tabular-nums">{emailCaptures.length}</span>
                </button>
              )}
              {visibleUnpromptedItems.length > 0 && (
                <button type="button" onClick={() => setSuggestionsEnabled(true)} className="flex w-full items-center justify-between border-b border-neutral-200 px-3 py-2 text-left text-neutral-700 transition-colors hover:bg-neutral-50">
                  <span className="min-w-0 truncate">Show assistant suggestions</span>
                  <span className="ml-3 shrink-0 text-xs font-semibold tabular-nums">{visibleUnpromptedItems.length}</span>
                </button>
              )}
            </div>
          </section>

        </aside>
        )}
      </div>

      {/* Review drawer — evening from the ⋯ menu, morning from the backlog
          footer's Review. Triage verdicts write through the same handlers the
          page rows use. */}
      <ReviewDrawer
        isOpen={reviewMode !== null}
        mode={reviewMode ?? 'evening'}
        onClose={() => setReviewMode(null)}
        tasks={tasks}
        attentionItems={data.attentionItems}
        overdueTasks={data.overdueTasks}
        viewedDate={viewedDate}
        onCompleteTask={onToggleTask}
        onUpdateTask={(id, u) => onUpdateTask?.(id, u)}
        onPushTask={ctx.onPushTask}
        onDeleteTask={ctx.onDeleteTask}
      />

      {/* What arrived from a forwarded email and nobody has looked at yet. */}
      <EmailReviewSheet
        open={emailReviewOpen}
        captures={emailCaptures}
        tasks={tasks}
        members={ctx.familyMembers}
        onClose={closeEmailReview}
        onDismiss={handleDismissEmailRow}
        dismissedIds={pendingDismiss ? [pendingDismiss.id] : undefined}
      />

      {/* Clarity curtain — pulled down by the binoculars in the header. */}
      <ClarityCurtain
        open={clarityOpen}
        onClose={() => setClarityOpen(false)}
        result={clarityResult}
        onStepAction={onClarityStep}
      />

      {/* Bulk action bar — appears when ≥1 task row is selected via the
          hover checkbox. Reuses the shared toolbar (Inbox uses the same). */}
      {selectedKeys.size > 0 && (
        <BulkActionToolbar
          selectedCount={selectedKeys.size}
          onDefer={handleBulkDefer}
          onSchedule={handleBulkSchedule}
          onSetContext={handleBulkSetContext}
          onAssign={handleBulkAssign}
          onGroup={(onGroupItems || onGroupTasks) ? handleBulkGroup : undefined}
          onSendToList={() => {}}
          onCancel={clearBulkSelection}
          familyMembers={familyMembers}
        />
      )}

      {proposal.open && (
        <ProposalPreview
          proposal={proposal.proposal}
          titleOf={proposal.titleOf}
          onClose={() => proposal.setOpen(false)}
          onAcceptGroup={proposal.acceptGroup}
          onAcceptOrder={proposal.acceptOrder}
          onAcceptAll={proposal.acceptAll}
        />
      )}

      {sweep.open && (
        <DuplicateSweep
          pairs={sweep.pairs}
          onClose={() => sweep.setOpen(false)}
          onKeepOne={sweep.keepOne}
          onSkipRoutineToday={(routineId) => ctx.onSkipRoutine?.(routineId)}
        />
      )}

      {/* Timeline note composer (radial wheel → "Note" pick) */}
      {insert.noteComposer && (
        <TimelineNoteComposer
          anchor={insert.noteComposer.anchor}
          existingNotes={(timelineNotes ?? []).map(n => ({ id: n.id, title: n.title, content: n.content }))}
          onCreateNew={(c, a) => onCreateNoteAt?.(c, a)}
          onAppendExisting={(id, b, a) => onAppendNoteAt?.(id, b, a)}
          onLinkExisting={(id) => onLinkNote?.(id)}
          onClose={insert.closeNoteComposer}
        />
      )}
    </div>
  )
}
