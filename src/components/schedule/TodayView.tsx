/**
 * TodayView — editorial Today shell.
 *
 * Drop-in replacement for TodaySchedule (same TodayScheduleProps interface).
 * Composes: TodayHeader, StatsRow, WeatherChip,
 *           EveningMealCard, ScheduleItem.
 *
 * NOT wired to the route yet — that happens in R4.
 */
import { createElement, useMemo, useCallback, useRef, useState, useEffect } from 'react'
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
import { useProactiveSuggestions } from '@/hooks/useProactiveSuggestions'
import { useRoutineStats } from '@/hooks/useRoutineStats'
import { useSystemHealth, getHealthTextClasses } from '@/hooks/useSystemHealth'
import { useRecurringEventDetection } from '@/hooks/useRecurringEventDetection'
import { useTimelineInsert } from '@/hooks/useTimelineInsert'
import { useDomain } from '@/hooks/useDomain'

import { Eye, EyeOff, Repeat, Binoculars, Sun, Printer, GripVertical, CalendarClock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AssigneeFilter } from '@/components/home/AssigneeFilter'

import { TodayAddInput } from './TodayAddInput'
import { TodaySectionList, findTimelineItem } from './TodaySectionList'
import { TodayDragProvider } from './TodayDragProvider'
import { resolveDrop, type DropIntent } from '@/lib/today/todayDrop'
import { useCalendarPermissions } from '@/hooks/useCalendarPermissions'
import { UpNextHero } from './UpNextHero'
import { selectUpNext } from '@/lib/today/upNext'
import { StatsRow } from './StatsRow'
import { TodayProgress } from './TodayProgress'
import { NeedsYourOK } from './NeedsYourOK'
import { ClarityCurtain } from '@/components/clarity/ClarityCurtain'
import { computeClaritySteps, type ClarityStepId } from '@/lib/clarity/claritySteps'
import { selectOverdue } from '@/lib/today/taskPools'
import { selectHorizonPool } from '@/lib/today/horizons'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'
import { getRoutinesForDatePure } from '@/lib/routineUtils'
import { StagingFloat } from './StagingFloat'
import { EndOfDayCard } from './EndOfDayCard'
import { EndOfDayReview } from './EndOfDayReview'
import { DayNavCluster } from './DayNavCluster'
import { OverdueSection } from './OverdueSection'
import { BulkActionToolbar } from './BulkActionToolbar'
import { TimelineNoteComposer } from './TimelineNoteComposer'

import { discussionItems } from '@/lib/discussionItems'
import { DiscussionBadge } from './DiscussionBadge'
import { PrintableDayList } from './PrintableDayList'
import { readHideRoutines, writeHideRoutines, onHideRoutinesChange } from '@/lib/hideRoutinesSignal'
import { useShareToFamilyNudges } from '@/lib/today/shareNudges'

// ─── Props: identical to TodayScheduleProps ───────────────────────────────────

interface TodayViewProps {
  // View-specific data
  tasks: Task[]
  events: CalendarEvent[]
  routines?: Routine[]
  dateInstances?: ActionableInstance[]
  projects?: Project[]
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  loading?: boolean
  viewedDate: Date
  onDateChange: (date: Date) => void
  /** Opens the optional "Plan today" daily-prep session (shown in the stats row). */
  onOpenPlanToday?: () => void
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

export function TodayView({
  tasks,
  events,
  routines = [],
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
  onOpenPlanToday,
  selectedAssignees,
  onSelectAssignees,
  assigneesWithTasks,
  hasUnassignedTasks,
  panelOpen,
  onClosePanel,
  onCreateNoteAt: onCreateNoteAtProp,
  onAppendNoteAt: onAppendNoteAtProp,
  onLinkNote: onLinkNoteProp,
  timelineNotes: timelineNotesProp,
}: TodayViewProps) {
  // ── Context ──────────────────────────────────────────────────────────────────
  const isMobile = useMobile()
  const navigate = useNavigate()
  const ctx = useScheduleActionsContext()
  // Only what THIS file still uses. The row-level handlers moved with the
  // section loop into TodaySectionList, which reads the same context itself.
  const {
    onToggleWaiting, onUpdateTask,
    onGroupTasks, onGroupItems,
    onAssignTaskAll, onAssignEventAll,
    onPushRoutine, onPushEvent, onUpdateEventContext,
    onOpenGuidedChat, onCreateFollowUp,
    onNotify,
    contactsMap, familyMembers = [],
    eventNotesMap,
  } = ctx

  // ── Bulk multi-select (hover checkbox on any row → bottom action bar) ──────
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [eodReviewOpen, setEodReviewOpen] = useState(false)
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

  // Derived set of raw task IDs from selectedKeys — needed by OverdueSection
  // which operates on raw task IDs rather than timeline keys.
  const overdueSelectedTaskIds = useMemo(() => {
    const s = new Set<string>()
    for (const k of selectedKeys) {
      if (k.startsWith('task-')) s.add(k.slice(5))
    }
    return s
  }, [selectedKeys])

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
  const todayInput = useMemo(() => ({
    tasks,
    events,
    routines,
    dateInstances,
    viewedDate,
    selectedAssignee: selectedAssignees ?? [],
    hideRoutines,
    completedLingerCutoff,
    weekStart: currentWeekStart,
    // Cast: EventNote.notes is string|null; TodayDataInput expects string|undefined — structurally compatible at runtime
    eventNotesMap: ctx.eventNotesMap as unknown as Map<string, { notes?: string; assignedTo?: string | null }> | undefined,
    eventContextOverrides: ctx.eventContextOverrides,
    getDomainForCalendar: ctx.getDomainForCalendar,
  }), [tasks, events, routines, dateInstances, viewedDate, selectedAssignees, hideRoutines, completedLingerCutoff,
      currentWeekStart, ctx.eventNotesMap, ctx.eventContextOverrides, ctx.getDomainForCalendar])

  const data = useTodayData(todayInput)

  // ── Up Next hero: the single next commitment, lifted out of its section ──
  const upNext = useMemo(() => {
    if (!data.isToday) return null
    const allItems = data.sectionsOrder.flatMap((s) => data.grouped[s] ?? [])
    return selectUpNext(allItems, new Date(nowTick))
  }, [data, nowTick])
  const upNextId = upNext?.item.id

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

  const proactive = useProactiveSuggestions()
  const { getStats: getRoutineStats } = useRoutineStats()
  const { isPromotionSuggested } = useRecurringEventDetection(events, eventNotesMap)

  // Timeline insert points: radial wheel pick → note composer (task/event/routine
  // are handled inline by TimelineInsertPoint via onCreate)
  const insert = useTimelineInsert()

  // Current life domain (work/family/personal/universal) for inline quick-capture
  const { currentDomain } = useDomain()

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

  const stagingHandlers = {
    allTasks: tasks,
    projects: projects ?? [],
    familyMembers,
    onPullToToday: (taskId: string) => {
      const t = new Date(); t.setHours(0, 0, 0, 0)
      ctx.onUpdateTask?.(taskId, { bucket: 'timed' as const, scheduledFor: t, isAllDay: true })
    },
    onSelectTask: (taskId: string) => onSelectItem(`task-${taskId}`),
    onCompleteTask: onToggleTask,
    onDeferTask: ctx.onPushTask ? (taskId: string, target: 'month' | 'quarter') => ctx.onPushTask!(taskId, target) : undefined,
    onDeleteTask: ctx.onDeleteTask,
    onUpdateTask: ctx.onUpdateTask,
  }

  const weekTrigger = (
    <StagingFloat tasks={data.weekTasks} horizon="week" {...stagingHandlers} inline />
  )

  const monthTrigger = (
    <StagingFloat tasks={data.monthTasks} horizon="month" {...stagingHandlers} inline />
  )

  const discussion = discussionItems(tasks)

  // ── Clarity binoculars + remediation popover for StatsRow ─────────────────────
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
    const untimedRoutines = getRoutinesForDatePure(routines, viewedDate).filter(
      (r) => r.recurrence_pattern?.type !== 'daily' && !r.time_of_day && r.visibility !== 'reference',
    ).length
    const isEvening = !!data.isToday && new Date().getHours() >= 17
    return computeClaritySteps({ inboxCount, overdueCount, placeableCount: weekCount + untimedRoutines, isEvening })
  }, [tasks, routines, viewedDate, data.isToday, currentWeekStart])

  const onClarityStep = useCallback((id: ClarityStepId) => {
    if (id === 'inbox') navigate('/inbox')
    else if (id === 'carried') { if (onOpenPlanToday) onOpenPlanToday(); else navigate('/inbox') }
    else if (id === 'plan') onOpenPlanToday?.()
    // 'review' simply closes for now (no dedicated review flow yet).
  }, [navigate, onOpenPlanToday])

  const clarityTrigger = (
    <button
      type="button"
      onClick={() => setClarityOpen(true)}
      className="group relative inline-flex items-center p-1.5 -m-1.5 rounded-lg hover:bg-neutral-100/60 transition-colors"
      aria-label="Clarity — where you are and your next move"
    >
      <Binoculars className={`w-5 h-5 ${clarityColorClass} group-hover:opacity-70 transition-opacity`} />
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 hidden group-hover:block w-56 rounded-lg bg-neutral-800 px-3 py-2 text-[11px] leading-snug text-white shadow-lg"
      >
        <span className="font-medium">Clarity</span> — where you are, and the next move to get clear.
      </span>
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
            onUpdateTask?.(intent.itemId.replace('task-', ''), {
              bucket: 'timed', scheduledFor: intent.when, isAllDay: false,
            })
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
          onUpdateTask?.(intent.itemId.replace('task-', ''), {
            bucket: 'timed', scheduledFor: midnight, isAllDay: true,
          })
          break
        }

        case 'reorder':
          await ctx.onReorderTasks?.(intent.writes)
          break

        case 'create-group':
          await onGroupItems?.(
            intent.taskIds, intent.memberRefs, intent.groupName, intent.date, intent.isAllDay,
          )
          break

        case 'add-to-group':
          await ctx.onAddToGroup?.(
            intent.wrapperId, intent.taskIds, intent.memberRefs, intent.date, intent.isAllDay,
          )
          break

        case 'remove-from-group':
          await ctx.onRemoveFromGroup?.(intent.taskId)
          break
      }
    }
  }, [ctx, onUpdateTask, onPushRoutine, onGroupItems, onNotify, viewedDate, data.grouped])

  // ── Follow-up task state: tracks which task just got completed → show follow-up input ──
  const [followUpTaskId, setFollowUpTaskId] = useState<string | null>(null)

  // Handle task toggle with follow-up support
  const handleToggleTaskWithFollowUp = useCallback((taskId: string, wasCompleted: boolean) => {
    onToggleTask(taskId)
    // Only show follow-up when completing (not uncompleting)
    if (!wasCompleted && onCreateFollowUp) {
      setFollowUpTaskId(taskId)
    }
  }, [onToggleTask, onCreateFollowUp])

  // Handle follow-up submission
  const handleFollowUpSubmit = useCallback((title: string, sourceTaskId: string) => {
    if (onCreateFollowUp) {
      onCreateFollowUp(title, sourceTaskId)
    }
    setFollowUpTaskId(null)
  }, [onCreateFollowUp])

  // Dismiss follow-up input
  const handleFollowUpDismiss = useCallback(() => {
    setFollowUpTaskId(null)
  }, [])

  // ── Handler stubs ─────────────────────────────────────────────────────────────
  const handleSelectItem = useCallback((id: string | null) => {
    onSelectItem(id)
  }, [onSelectItem])

  const listRef = useRef<HTMLDivElement>(null)

  // ── First-item marker (exactly one element gets data-today-first) ────────────
  // Overdue section takes priority; otherwise the first item id of the first non-empty section.
  const overdueWillRender = data.isToday && data.overdueTasks.length > 0
  const firstSectionItemId: string | null = overdueWillRender
    ? null
    : (() => {
        for (const section of data.sectionsOrder) {
          const items = data.grouped[section]
          // The Up Next hero lifts its item out of the section list, so the
          // marker goes to the first item still rendered in a section.
          const first = items?.find((i) => i.id !== upNextId)
          if (first) return first.id
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
    const id = requestAnimationFrame(() => {
      window.print()
      setPrinting(false)
    })
    return () => cancelAnimationFrame(id)
  }, [printing])

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[940px] w-full mx-auto px-0 py-2 md:px-8 md:py-8">
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
      {/* Date masthead with prev/next-day nav — mobile only. Desktop renders
          DayNavCluster in HomeHeader above the view; mobile had no date header,
          so surface the same control (it's responsive) here. */}
      <div className="md:hidden px-3 mb-2">
        <DayNavCluster viewedDate={viewedDate} onDateChange={onDateChange} />
      </div>

      {/* Needs your OK — COS-proposed actions awaiting approval. Top of Today
          so the assistant's proposals are the first thing you can clear in a
          tap. Renders nothing when the queue is empty. */}
      {data.isToday && (
        <div className="px-3 md:px-0">
          <NeedsYourOK />
        </div>
      )}

      {/* Unified Today header — one strip: momentum band (headline · rail ·
          count) with the controls chips on the same row. Collapsing the old
          two-row preamble is what buys the Up Next hero its above-the-fold
          position. */}
      <div className="px-3 md:px-0 mb-4 md:card md:rounded-2xl md:border md:border-neutral-200/70 md:px-4 md:py-2.5 md:flex md:flex-wrap md:items-center md:gap-x-5 md:gap-y-1">
        <div className="md:flex-1 md:min-w-0 md:basis-[18rem] overflow-hidden">
          <TodayProgress
            completedCount={data.counts.completedCount}
            actionableCount={data.counts.actionableCount}
            isToday={data.isToday}
          />
        </div>
        <div className="hidden md:block shrink-0">
          <StatsRow
          dueToday={data.counts.actionableCount}
          doneToday={data.counts.completedCount}
          thisWeek={data.weekTasks.length}
          total={tasks.filter((t) => !t.completed).length}
          aiAvailable={false}
          weekTrigger={weekTrigger}
          monthTrigger={monthTrigger}
          clarityTrigger={clarityTrigger}
          discussionTrigger={discussion.length > 0 ? <DiscussionBadge items={discussion} onSelectItem={onSelectItem} /> : undefined}
          endControls={
            <>
              {onSelectAssignees && ((assigneesWithTasks?.length ?? 0) > 0 || hasUnassignedTasks) && (
                <AssigneeFilter
                  selectedAssignees={selectedAssignees ?? []}
                  onSelectAssignees={onSelectAssignees}
                  assigneesWithTasks={assigneesWithTasks ?? []}
                  hasUnassignedTasks={!!hasUnassignedTasks}
                />
              )}
              <button
                type="button"
                onClick={toggleHideRoutines}
                title={hideRoutines ? 'Show daily activities' : 'Hide daily activities'}
                aria-label={hideRoutines ? 'Show daily' : 'Hide daily'}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[15px] transition-all ${hideRoutines ? 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100' : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100'}`}
              >
                {createElement(hideRoutines ? EyeOff : Eye, { className: 'w-5 h-5' })}
                <span>{hideRoutines ? 'Show daily' : 'Hide daily'}</span>
              </button>
              <button
                type="button"
                onClick={printList}
                title="Print a compact list of this day"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[15px] text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-all"
              >
                <Printer className="w-5 h-5" />
                <span>Print list</span>
              </button>
              {data.isToday && ctx.onOpenPlanning && (
                <button
                  type="button"
                  onClick={ctx.onOpenPlanning}
                  title="Block out the day on an hour grid"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[15px] text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-all"
                >
                  <CalendarClock className="w-5 h-5" />
                  <span>Time-block</span>
                </button>
              )}
              {data.isToday && onOpenPlanToday && (
                <button
                  type="button"
                  onClick={onOpenPlanToday}
                  title="Plan today — review carried-over and pull from the week"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[15px] text-primary-600 hover:bg-primary-50 transition-all"
                >
                  <Sun className="w-5 h-5" />
                  <span>Plan today</span>
                </button>
              )}
            </>
          }
        />
        </div>
      </div>

      {/* Up Next hero — the single next commitment, above everything else.
          Its item is lifted out of its day section below. */}
      {upNext && (
        <div className="px-3 md:px-0">
          <UpNextHero
            selection={upNext}
            onSelectItem={onSelectItem}
            onToggleTask={onToggleTask}
            projectsMap={ctx.projectsMap}
          />
        </div>
      )}

      {/* Inline "Add to today" — today-only, when onCreateTask is wired.
          Desktop: full-width add input. Mobile: same input but flanked by the
          assignee + show-daily filters on the right, so the whole filter row
          is folded into this one to save vertical space. */}
      {data.isToday && (ctx.onCreateTaskParsed ?? ctx.onCreateTask) && (
        <>
          {/* Desktop: just the add input */}
          <div className="hidden md:block mb-4">
            <TodayAddInput
              onAdd={ctx.onCreateTaskParsed!}
              parserContext={ctx.parserContext!}
              currentDomain={ctx.currentDomain ?? 'universal'}
              resolver={ctx.resolverContext!}
              getRecentTaskForContact={ctx.getRecentTaskForContact}
            />
          </div>
          {/* Mobile: combined add + filters */}
          <div className="md:hidden mb-2 px-3 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <TodayAddInput
                onAdd={ctx.onCreateTaskParsed!}
                parserContext={ctx.parserContext!}
                currentDomain={ctx.currentDomain ?? 'universal'}
                resolver={ctx.resolverContext!}
                getRecentTaskForContact={ctx.getRecentTaskForContact}
              />
            </div>
            {onSelectAssignees && ((assigneesWithTasks?.length ?? 0) > 0 || hasUnassignedTasks) && (
              <AssigneeFilter
                selectedAssignees={selectedAssignees ?? []}
                onSelectAssignees={onSelectAssignees}
                assigneesWithTasks={assigneesWithTasks ?? []}
                hasUnassignedTasks={!!hasUnassignedTasks}
              />
            )}
            <button
              type="button"
              onClick={toggleHideRoutines}
              title={hideRoutines ? 'Show daily activities' : 'Hide daily activities'}
              aria-label={hideRoutines ? 'Show daily activities' : 'Hide daily activities'}
              aria-pressed={!hideRoutines}
              className={`shrink-0 p-2 rounded-lg transition-colors ${hideRoutines ? 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100' : 'text-primary-600 hover:bg-primary-50'}`}
            >
              <Repeat className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* Task list — wrapped in a card on desktop; on mobile the rows go
          full-width (no card, no border, no inner padding) to match the
          compact list the pre-redesign mobile had. */}
      <div ref={listRef} className="md:card md:rounded-2xl md:border md:border-neutral-200/70 md:px-5 md:py-4">
        {data.counts.totalItems === 0 ? (
          <div className="text-center py-16">
            <p className="font-display text-xl text-neutral-700">
              {/* While the day's data is still in flight, an empty list means
                  "not loaded yet" — not "clear". Say so, so the user never sees
                  a false "Your day is clear" flash before items arrive. */}
              {loading
                ? 'Loading your day…'
                : data.isToday && data.counts.completedCount > 0 ? 'All cleared — nicely done' : 'Your day is clear'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overdue section — gets data-today-first marker when it renders.
                Shown on mobile too (OverdueSection has its own mobile layout). */}
            {data.isToday && data.overdueTasks.length > 0 && (
              <div data-today-first="">
                <OverdueSection
                  tasks={data.overdueTasks}
                  selectedItemId={selectedItemId}
                  onSelectTask={onSelectItem}
                  onToggleTask={onToggleTask}
                  onToggleWaiting={onToggleWaiting}
                  onPushTask={ctx.onPushTask}
                  onUpdateTask={ctx.onUpdateTask}
                  contactsMap={ctx.contactsMap}
                  projectsMap={ctx.projectsMap}
                  familyMembers={ctx.familyMembers}
                  onAssignTask={ctx.onAssignTask}
                  onAssignTaskAll={ctx.onAssignTaskAll}
                  bulkSelectedIds={overdueSelectedTaskIds}
                  onToggleBulkSelect={(taskId) => toggleBulkSelect(`task-${taskId}`)}
                  followUpTaskId={followUpTaskId}
                  onToggleWithFollowUp={handleToggleTaskWithFollowUp}
                  onFollowUpSubmit={onCreateFollowUp ? handleFollowUpSubmit : undefined}
                  onFollowUpDismiss={handleFollowUpDismiss}
                  panelOpen={panelOpen}
                  onClosePanel={onClosePanel}
                  onDeleteTask={ctx.onDeleteTask}
                  suggestionsForTask={proactive.suggestionsForEntity}
                  onActSuggestion={proactive.actOnSuggestion}
                  onDismissSuggestion={proactive.dismissSuggestion}
                  onOpenGuidedChat={onOpenGuidedChat}
                />
              </div>
            )}

            {/* Sections — lifted into TodaySectionList so this file stops
                carrying the whole day list (Stage 2b spec). */}
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
            <TodaySectionList
              isReadOnlyEvent={isReadOnlyEvent}
              sectionsOrder={data.sectionsOrder}
              grouped={data.grouped}
              viewedDate={viewedDate}
              isMobile={isMobile}
              selectedItemId={selectedItemId}
              upNextId={upNextId}
              firstSectionItemId={firstSectionItemId}
              collapsedKeys={collapsedKeys}
              openedByUser={openedByUser}
              onToggleSection={toggleSection}
              selectedKeys={selectedKeys}
              onToggleBulkSelect={toggleBulkSelect}
              tasksMap={tasksMap}
              shareNudgeByEventId={shareNudgeByEventId}
              parserContext={parserContext}
              currentDomain={currentDomain}
              insert={insert}
              proactive={proactive}
              getRoutineStats={getRoutineStats}
              isPromotionSuggested={isPromotionSuggested}
              onSelectItem={handleSelectItem}
              onToggleTask={onToggleTask}
              onCompleteRoutine={onCompleteRoutine}
              onCompleteEvent={onCompleteEvent}
              panelOpen={panelOpen}
              onClosePanel={onClosePanel}
            />
            </TodayDragProvider>
          </div>
        )}
      </div>

      {/* End of day — closing chapter for the timeline. Desktop-only; mobile
          keeps a tighter schedule-focused view. */}
      <div className="mt-5 hidden md:block">
        <EndOfDayCard onOpenReview={() => setEodReviewOpen(true)} />
      </div>
      <EndOfDayReview
        isOpen={eodReviewOpen}
        onClose={() => setEodReviewOpen(false)}
        tasks={tasks}
        viewedDate={viewedDate}
        onUpdateTask={(id, u) => onUpdateTask?.(id, u)}
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
