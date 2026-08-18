/**
 * TodayView — editorial Today shell.
 *
 * Drop-in replacement for TodaySchedule (same TodayScheduleProps interface).
 * Composes: TodayHeader, TodayOverflowMenu, WeatherChip,
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
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'
import { useUnpromptedSuggestions, type UnpromptedItem } from '@/hooks/useUnpromptedSuggestions'
import { UnpromptedLines } from '@/components/assistant/UnpromptedLines'
import { resolveSuggestionAction, revealItemId } from '@/lib/assistant/suggestionAction'
import { useSystemHealth, getHealthTextClasses } from '@/hooks/useSystemHealth'
import { useRecurringEventDetection } from '@/hooks/useRecurringEventDetection'
import { useTimelineInsert } from '@/hooks/useTimelineInsert'
import { useDomain } from '@/hooks/useDomain'

import { Eye, EyeOff, Repeat, Binoculars, Sun, Printer, GripVertical, CalendarClock, Moon, Sparkles, NotebookPen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AssigneeFilter } from '@/components/home/AssigneeFilter'

import { TodayAddInput } from './TodayAddInput'
import { TodaySectionList, findTimelineItem } from './TodaySectionList'
import { TodayDragProvider } from './TodayDragProvider'
import { resolveDrop, type DropIntent } from '@/lib/today/todayDrop'
import { useCalendarPermissions } from '@/hooks/useCalendarPermissions'
import { selectUpNext, formatUpNextStatus } from '@/lib/today/upNext'
import { NeedsYourOK } from './NeedsYourOK'
import { ClarityCurtain } from '@/components/clarity/ClarityCurtain'
import { computeClaritySteps, type ClarityStepId } from '@/lib/clarity/claritySteps'
import { selectOverdue } from '@/lib/today/taskPools'
import { selectHorizonPool } from '@/lib/today/horizons'
import { useSuggestionsEnabled } from '@/lib/assistant/suggestionsPref'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'
import { getRoutinesForDatePure } from '@/lib/routineUtils'
import { TodayOverflowMenu } from './TodayOverflowMenu'
import { ReviewDrawer, type ReviewMode } from './ReviewDrawer'
import { DayNavCluster } from './DayNavCluster'
import { OverdueSection } from './OverdueSection'
import { TodayBacklogFooter } from './TodayBacklogFooter'
import { ToBuyLine } from './ToBuyLine'
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
  events: CalendarEvent[]
  routines?: Routine[]
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
  selectedAssignees,
  onSelectAssignees,
  assigneesWithTasks,
  hasUnassignedTasks,
  panelOpen,
  onClosePanel,
  onOpenPlanFromPaper,
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

  // ── Backlog footer state — the "N carried over" segment expands the
  // OverdueSection list inline beneath the footer line. Incomplete count with
  // a total fallback, same readout the old collapsed strip showed.
  const [carriedExpanded, setCarriedExpanded] = useState(false)
  const carriedCount = useMemo(() => {
    const incomplete = data.overdueTasks.filter((t) => !t.completed).length
    return incomplete || data.overdueTasks.length
  }, [data.overdueTasks])

  // ── "To buy" conversion toast — the page owns it because nudges fire from
  // deep inside the row tree (sections + carried-over) and the undo must
  // outlive the row that triggered it (the task is gone the moment it fires).
  const [toBuyToast, setToBuyToast] = useState<{ message: string; undo: () => Promise<void> } | null>(null)
  const handleSendToBuy = useCallback(async (taskId: string) => {
    const result = await ctx.onSendTaskToBuy?.(taskId)
    if (result) setToBuyToast({ message: `"${result.itemText}" moved to To buy`, undo: result.undo })
  }, [ctx])

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
    const untimedRoutines = getRoutinesForDatePure(routines, viewedDate).filter(
      (r) => r.recurrence_pattern?.type !== 'daily' && !r.time_of_day && r.visibility !== 'reference',
    ).length
    const isEvening = !!data.isToday && new Date().getHours() >= 17
    return computeClaritySteps({ inboxCount, overdueCount, placeableCount: weekCount + untimedRoutines, isEvening })
  }, [tasks, routines, viewedDate, data.isToday, currentWeekStart])

  const onClarityStep = useCallback((id: ClarityStepId) => {
    if (id === 'inbox') navigate('/inbox')
    else if (id === 'carried') navigate('/inbox')
    // 'plan' and 'review' simply close — the guided daily-prep session they
    // launched left with the 2026-08 analog-planning pivot.
  }, [navigate])

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

  // Duplicate sweep — on demand; a passive count is the only unsolicited part.
  const sweep = useDuplicateSweep(data.sectionsOrder, data.grouped, ctx.onDeleteTask)

  // Suggested order + grouping — a preview you accept, never an auto-apply.
  // Applying reuses the same writers the drag gestures use.
  const proposal = useTodayProposal(data.sectionsOrder, data.grouped, projects, viewedDate, {
    onGroupItems, onReorderTasks: ctx.onReorderTasks,
  })

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
            onUpdateTask?.(taskId, {
              bucket: 'timed', scheduledFor: intent.when, isAllDay: false,
            })
            // A drag is the easiest action in the app to do by accident.
            if (before) {
              ctx.onRegisterUndo?.(`Moved "${before.title}"`, () => {
                onUpdateTask?.(taskId, {
                  bucket: before.bucket,
                  scheduledFor: before.scheduledFor,
                  isAllDay: before.isAllDay,
                })
              })
            }
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
          onUpdateTask?.(allDayId, {
            bucket: 'timed', scheduledFor: midnight, isAllDay: true,
          })
          if (wasTimed) {
            ctx.onRegisterUndo?.(`Moved "${wasTimed.title}" to All day`, () => {
              onUpdateTask?.(allDayId, {
                bucket: wasTimed.bucket,
                scheduledFor: wasTimed.scheduledFor,
                isAllDay: wasTimed.isAllDay,
              })
            })
          }
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

      {/* Today's controls — one primary action, everything else one tap away.
          This strip used to carry a progress bar, four counters and seven
          always-visible buttons above a list of two tasks. Nothing here was
          removed; the rarely-used controls moved behind the overflow so the
          page spends its space on the day instead of on itself. */}
      <div
        data-testid="today-controls"
        className="px-3 md:px-0 mb-3 md:-mt-5 hidden md:flex items-center justify-end gap-1"
      >
        {onSelectAssignees && ((assigneesWithTasks?.length ?? 0) > 0 || hasUnassignedTasks) && (
          <AssigneeFilter
            selectedAssignees={selectedAssignees ?? []}
            onSelectAssignees={onSelectAssignees}
            assigneesWithTasks={assigneesWithTasks ?? []}
            hasUnassignedTasks={!!hasUnassignedTasks}
          />
        )}

        <TodayOverflowMenu>
          {onOpenPlanFromPaper && (
            <button
              type="button"
              onClick={onOpenPlanFromPaper}
              title="Plan from paper — photograph your written plan and place its items"
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[15px] text-neutral-600 transition-all hover:bg-neutral-100"
            >
              <NotebookPen className="w-5 h-5" />
              <span>Plan from paper</span>
            </button>
          )}
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
              {unprompted.items.length > 0 && ` · ${unprompted.items.length}`}
            </span>
          </button>
          {data.isToday && ctx.onOpenPlanning && (
            <button
              type="button"
              onClick={ctx.onOpenPlanning}
              title="Block out the day on an hour grid"
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[15px] text-neutral-600 transition-all hover:bg-neutral-100"
            >
              <CalendarClock className="w-5 h-5" />
              <span>Time-block</span>
            </button>
          )}
          <button
            type="button"
            onClick={printList}
            title="Print a compact list of this day"
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[15px] text-neutral-600 transition-all hover:bg-neutral-100"
          >
            <Printer className="w-5 h-5" />
            <span>Print list</span>
          </button>
          {data.isToday && (
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

          {/* Signals that only appear when they have something to say. */}
          {(clarityTrigger || discussion.length > 0 ||
            (data.isToday && (sweep.pairs.length > 0 || proposal.count > 0))) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-neutral-100 px-2.5 pt-2 text-[12px] text-neutral-400">
              {clarityTrigger}
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
      </div>

      {/* Task list — wrapped in a card on desktop; on mobile the rows go
          full-width (no card, no border, no inner padding) to match the
          compact list the pre-redesign mobile had.

          The add input and the assistant line live INSIDE the card, at its
          top: floating between the masthead and the card they read as
          orphaned chrome and cost a band of empty page ("hanging in mid
          air" — Scott, 2026-08-18). Anchored here they are part of the day. */}
      <div ref={listRef} className="md:card md:rounded-2xl md:border md:border-neutral-200/70 md:px-5 md:py-4">
        {/* Assistant lines — the unprompted tier, rendered ONLY when the ⋯
            menu's "Show suggestions" toggle is on (off by default; the menu
            entry carries the pending count). Only this tier is gated: chips
            inside an item you opened are answers to a question you asked by
            opening it. */}
        {suggestionsEnabled && (
          <UnpromptedLines
            items={unprompted.items}
            onAct={handleUnpromptedAct}
            onSnooze={unprompted.snooze}
            decisions={unprompted.decisions}
            showWhy={showWhyDebug}
          />
        )}

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
              upNextStatus={upNextStatus}
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
              isPromotionSuggested={isPromotionSuggested}
              onSelectItem={handleSelectItem}
              onToggleTask={onToggleTask}
              onCompleteRoutine={onCompleteRoutine}
              onCompleteEvent={onCompleteEvent}
              panelOpen={panelOpen}
              onClosePanel={onClosePanel}
              renamingGroupId={renamingGroupId}
              onRenameGroupDone={() => setRenamingGroupId(null)}
              onSendToBuy={ctx.onSendTaskToBuy ? handleSendToBuy : undefined}
            />
            </TodayDragProvider>
          </div>
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
        {/* Inline "Add to today" — BELOW the day's content (you add after
            you've seen the day), above the meta lines. Today-only, when
            onCreateTask is wired. Desktop: full-width add input. Mobile: same
            input but flanked by the assignee + show-daily filters on the
            right, so the whole filter row is folded into this one to save
            vertical space. */}
        {data.isToday && (ctx.onCreateTaskParsed ?? ctx.onCreateTask) && (
          <>
            {/* Desktop: just the add input */}
            <div className="hidden md:block mt-3">
              <TodayAddInput
                onAdd={ctx.onCreateTaskParsed!}
                parserContext={ctx.parserContext!}
                currentDomain={ctx.currentDomain ?? 'universal'}
                resolver={ctx.resolverContext!}
                getRecentTaskForContact={ctx.getRecentTaskForContact}
              />
            </div>
            {/* Mobile: combined add + filters */}
            <div className="md:hidden mt-2 px-3 flex items-center gap-2">
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

        {/* To buy — one fixed-budget line; the purchases live on the shared
            native list, not scattered through the timeline. */}
        {data.isToday && <ToBuyLine />}

        {data.isToday && (
          <TodayBacklogFooter
            carriedCount={carriedCount}
            attentionItems={data.attentionItems}
            carriedExpanded={carriedExpanded}
            onToggleCarried={() => setCarriedExpanded((v) => !v)}
            onReview={() => setReviewMode('morning')}
          >
            <OverdueSection
              headerless
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
              onSendToBuy={ctx.onSendTaskToBuy ? handleSendToBuy : undefined}
            />
          </TodayBacklogFooter>
        )}

        {/* Undo toast for a To buy conversion — the task was deleted, so this
            is the only way back for ten seconds. */}
        {toBuyToast && (
          <InboxUndoToast
            message={toBuyToast.message}
            onUndo={() => { void toBuyToast.undo(); setToBuyToast(null) }}
            onDismiss={() => setToBuyToast(null)}
          />
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
        currentWeekStart={currentWeekStart}
        onUpdateTask={(id, u) => onUpdateTask?.(id, u)}
        onPushTask={ctx.onPushTask}
        onDeleteTask={ctx.onDeleteTask}
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
