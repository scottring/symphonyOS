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

import { parseRoutineTimelineId } from '@/lib/today/doseExpansion'
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
import { computeAnchorTime } from '@/lib/timelineAnchor'

import { Eye, EyeOff, Repeat, Mail, Binoculars, Sun, ChevronDown, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AssigneeFilter } from '@/components/home/AssigneeFilter'

import { TodayAddInput } from './TodayAddInput'
import { UpNextHero } from './UpNextHero'
import { selectUpNext } from '@/lib/today/upNext'
import { TimelineInsertPoint } from './TimelineInsertPoint'
import { StatsRow } from './StatsRow'
import { TodayProgress } from './TodayProgress'
import { NeedsYourOK } from './NeedsYourOK'
import { ClarityCurtain } from '@/components/clarity/ClarityCurtain'
import { computeClaritySteps, type ClarityStepId } from '@/lib/clarity/claritySteps'
import { selectOverdue } from '@/lib/today/taskPools'
import { selectHorizonPool } from '@/lib/today/horizons'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { getRoutinesForDatePure } from '@/lib/routineUtils'
import { StagingFloat } from './StagingFloat'
import { EveningMealCard } from './EveningMealCard'
import { EndOfDayCard } from './EndOfDayCard'
import { ScheduleItem } from './ScheduleItem'
import { RoutineCollectionRow } from './RoutineCollectionRow'
import { DayNavCluster } from './DayNavCluster'
import { ShareToFamilyNudge } from './ShareToFamilyNudge'
import { OverdueSection } from './OverdueSection'
import { BulkActionToolbar } from './BulkActionToolbar'
import { TimelineNoteComposer } from './TimelineNoteComposer'

import { useEmailActionItems } from '@/hooks/useEmailActionItems'

import { discussionItems } from '@/lib/discussionItems'
import { DiscussionBadge } from './DiscussionBadge'
import { daySectionMeta } from '@/lib/daySectionMeta'
import { parseMealTitle } from '@/lib/mealTitle'
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

// ─── Meal detection ────────────────────────────────────────────────────────────

const MEAL_RE = /breakfast|brunch|lunch|dinner|supper/i

function isMealItem(id: string, type: string, title: string): boolean {
  return String(id).startsWith('meal:') || (type === 'event' && MEAL_RE.test(title))
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
  const {
    onToggleWaiting, onUpdateTask, onPushTask,
    onGroupTasks, onGroupItems,
    onAssignTask, onAssignTaskAll, onAssignEvent, onAssignEventAll,
    onAssignRoutine, onAssignRoutineAll,
    onSkipRoutine, onPushRoutine, onUpdateRoutine,
    onSkipEvent, onPushEvent, onUpdateEventContext,
    onOpenTask, onOpenGuidedChat, onCreateFollowUp,
    onNotify,
    contactsMap, projectsMap, familyMembers = [],
    eventNotesMap,
  } = ctx

  // ── Bulk multi-select (hover checkbox on any row → bottom action bar) ──────
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
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
  const todayInput = useMemo(() => ({
    tasks,
    events,
    routines,
    dateInstances,
    viewedDate,
    selectedAssignee: selectedAssignees ?? [],
    hideRoutines,
    completedLingerCutoff,
    // Cast: EventNote.notes is string|null; TodayDataInput expects string|undefined — structurally compatible at runtime
    eventNotesMap: ctx.eventNotesMap as unknown as Map<string, { notes?: string; assignedTo?: string | null }> | undefined,
    eventContextOverrides: ctx.eventContextOverrides,
    getDomainForCalendar: ctx.getDomainForCalendar,
  }), [tasks, events, routines, dateInstances, viewedDate, selectedAssignees, hideRoutines, completedLingerCutoff,
      ctx.eventNotesMap, ctx.eventContextOverrides, ctx.getDomainForCalendar])

  const data = useTodayData(todayInput)

  // ── Up Next hero: the single next commitment, lifted out of its section ──
  const upNext = useMemo(() => {
    if (!data.isToday) return null
    const allItems = data.sectionsOrder.flatMap((s) => data.grouped[s] ?? [])
    return selectUpNext(allItems, new Date(nowTick))
  }, [data, nowTick])
  const upNextId = upNext?.item.id

  // Sections whose remaining items are all complete render collapsed by
  // default; this tracks the ones the user has re-expanded.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const toggleSectionExpanded = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }, [])

  const proactive = useProactiveSuggestions()
  const emailActions = useEmailActionItems()
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

  // Create-at handlers: props take precedence, fall back to context
  const onCreateTaskAt = ctx.onCreateTaskAt
  const onCreateEventAt = ctx.onCreateEventAt
  const onCreateRoutineAt = ctx.onCreateRoutineAt

  // Note composer handlers: props take precedence, fall back to context (legacy prop??ctx pattern)
  const onCreateNoteAt = onCreateNoteAtProp ?? ctx.onCreateNoteAt
  const onAppendNoteAt = onAppendNoteAtProp ?? ctx.onAppendNoteAt
  const onLinkNote = onLinkNoteProp ?? ctx.onLinkNote
  const timelineNotes = timelineNotesProp ?? ctx.timelineNotes

  const weekTrigger = (
    <StagingFloat
      weekTasks={data.weekTasks}
      allTasks={tasks}
      projects={projects ?? []}
      familyMembers={familyMembers}
      onPullToToday={(taskId) => {
        const t = new Date(); t.setHours(0, 0, 0, 0)
        ctx.onUpdateTask?.(taskId, { bucket: 'timed' as const, scheduledFor: t, isAllDay: true })
      }}
      onSelectTask={(taskId) => onSelectItem(`task-${taskId}`)}
      onCompleteTask={onToggleTask}
      onDeferTask={ctx.onPushTask ? (taskId, target: 'month' | 'quarter') => ctx.onPushTask!(taskId, target) : undefined}
      onDeleteTask={ctx.onDeleteTask}
      onUpdateTask={ctx.onUpdateTask}
      inline
    />
  )

  const discussion = discussionItems(tasks)

  // ── Email nudge for StatsRow ──────────────────────────────────────────────
  const activeEmailCount = emailActions.items.filter(i => i.status === 'new').length
  const emailNudge = data.isToday && activeEmailCount > 0 ? (
    <button
      type="button"
      onClick={() => navigate('/inbox')}
      className="inline-flex items-center gap-1.5 text-[15px] text-neutral-600 hover:text-neutral-700 transition-colors"
      aria-label={`${activeEmailCount} email action${activeEmailCount !== 1 ? 's' : ''} in Inbox`}
    >
      <Mail className="w-5 h-5 text-blue-500" />
      {activeEmailCount} from email
    </button>
  ) : undefined

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
    const weekCount = selectHorizonPool(tasks, 'week', matchAll).length
    const untimedRoutines = getRoutinesForDatePure(routines, viewedDate).filter(
      (r) => r.recurrence_pattern?.type !== 'daily' && !r.time_of_day && r.visibility !== 'reference',
    ).length
    const isEvening = !!data.isToday && new Date().getHours() >= 17
    return computeClaritySteps({ inboxCount, overdueCount, placeableCount: weekCount + untimedRoutines, isEvening })
  }, [tasks, routines, viewedDate, data.isToday])

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

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[940px] w-full mx-auto px-0 py-2 md:px-8 md:py-8">
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
          clarityTrigger={clarityTrigger}
          discussionTrigger={discussion.length > 0 ? <DiscussionBadge items={discussion} onSelectItem={onSelectItem} /> : undefined}
          emailTrigger={emailNudge}
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

            {/* Sections */}
            {data.sectionsOrder.map((section) => {
              const allSectionItems = data.grouped[section]
              if (!allSectionItems || allSectionItems.length === 0) return null
              const meta = daySectionMeta(section)

              // The hero item is lifted out of its section; a section whose
              // remaining items are all complete (or whose only item IS the
              // hero) collapses to a single header line.
              const items = upNextId
                ? allSectionItems.filter((i) => i.id !== upNextId)
                : allSectionItems
              const restAllDone = items.every((i) => i.completed)
              const sectionExpanded = expandedSections.has(section)

              if (restAllDone && !sectionExpanded) {
                const emptyBecauseHero = items.length === 0
                return (
                  <section key={section}>
                    <button
                      type="button"
                      onClick={emptyBecauseHero ? undefined : () => toggleSectionExpanded(section)}
                      disabled={emptyBecauseHero}
                      aria-expanded={false}
                      className={`w-full flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-neutral-400 px-3 md:px-0 py-0.5 text-left ${emptyBecauseHero ? 'cursor-default' : 'hover:text-neutral-600 transition-colors'}`}
                    >
                      {createElement(meta.Icon, { className: 'w-4 h-4 text-amber-500/60 shrink-0' })}
                      <span>{meta.label}</span>
                      {meta.range && (
                        <span className="text-neutral-300 normal-case font-normal">{meta.range}</span>
                      )}
                      <span className="text-primary-600/70 normal-case font-normal">
                        · {emptyBecauseHero ? 'up next' : 'complete'}
                      </span>
                      {!emptyBecauseHero && <ChevronRight className="w-3.5 h-3.5 text-neutral-300" />}
                    </button>
                  </section>
                )
              }

              return (
                <section key={section}>
                  <h3 className="hidden md:flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-neutral-400 mb-3 px-3 md:px-0">
                    {createElement(meta.Icon, { className: 'w-4 h-4 text-amber-500 shrink-0' })}
                    <span>{meta.label}</span>
                    {meta.range && (
                      <span className="text-neutral-300 normal-case font-normal">
                        {meta.range}
                      </span>
                    )}
                    {restAllDone && sectionExpanded && (
                      <button
                        type="button"
                        onClick={() => toggleSectionExpanded(section)}
                        aria-label={`Collapse ${meta.label}`}
                        className="inline-flex items-center gap-1 text-primary-600/70 normal-case font-normal hover:text-primary-700"
                      >
                        · complete <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </h3>

                  <h3 className="md:hidden flex items-baseline gap-2 px-1 mb-2 mt-1">
                    <span className="font-display italic text-[15px] text-neutral-600">
                      {meta.label}
                    </span>
                    {meta.range && (
                      <span className="text-[11px] text-neutral-400 tabular-nums">
                        {meta.range}
                      </span>
                    )}
                  </h3>

                  <div className="space-y-1">
                    {items.map((item, itemIndex) => {
                      const taskId = item.id.startsWith('task-') ? item.id.replace('task-', '') : null
                      const contactName = item.contactId && contactsMap?.get(item.contactId)?.name || undefined
                      const projectName = item.projectId && projectsMap?.get(item.projectId)?.name || undefined
                      const parentTaskId = item.parentTaskId
                      const parentTaskName = parentTaskId ? tasksMap.get(parentTaskId)?.title : undefined
                      const isFirstItem = item.id === firstSectionItemId

                      // ── Group cards ──────────────────────────────────────
                      // A parent task and its adjacent subtask rows (grouping.ts
                      // places children directly after their parent within a
                      // section) render inside one enclosed, tinted card. Roles
                      // are derived purely from adjacency, so a parent whose
                      // children live in another section gets no card.
                      const prevItem = itemIndex > 0 ? items[itemIndex - 1] : null
                      const nextItem = itemIndex < items.length - 1 ? items[itemIndex + 1] : null
                      const isGroupParent = !!taskId && !!nextItem && !!nextItem.isSubtask && nextItem.parentTaskId === taskId
                      const isGroupChild = !!item.isSubtask && !!prevItem &&
                        (prevItem.id === `task-${item.parentTaskId}` ||
                          (!!prevItem.isSubtask && prevItem.parentTaskId === item.parentTaskId))
                      const isLastGroupChild = isGroupChild &&
                        (!nextItem || !(nextItem.isSubtask && nextItem.parentTaskId === item.parentTaskId))
                      const groupCardClass = isGroupParent
                        ? 'rounded-t-2xl border border-b-0 border-primary-200/70 bg-primary-50/30 pt-0.5'
                        : isLastGroupChild
                          ? 'border-x border-b border-primary-200/70 bg-primary-50/30 rounded-b-2xl pb-1 pl-4'
                          : isGroupChild
                            ? 'border-x border-primary-200/70 bg-primary-50/30 pl-4'
                            : ''
                      // Don't offer an insert point between a parent and its
                      // children — a task added there wouldn't be in the group.
                      const showInsert = !isGroupChild

                      // Insert point before this item (rendered unconditionally when totalItems>0)
                      const prevItemForInsert = itemIndex > 0 ? items[itemIndex - 1] : null
                      const insertCtxBefore = {
                        before: prevItemForInsert?.startTime ?? null,
                        after: item.startTime ?? null,
                        section,
                        date: viewedDate,
                      }
                      const insertBefore = (
                        <TimelineInsertPoint
                          onPick={(k) => insert.handlePick(insertCtxBefore, k)}
                          onCreate={(kind, r) => {
                            if (kind === 'task') onCreateTaskAt?.(r)
                            else if (kind === 'event') onCreateEventAt?.(r)
                            else onCreateRoutineAt?.(r)
                          }}
                          quickInput={{
                            anchorTime: computeAnchorTime(insertCtxBefore),
                            parserContext,
                            currentDomain,
                          }}
                        />
                      )

                      // Evening meal gets a special card (desktop only — on
                      // mobile we let meal items render as compact rows to
                      // match the pre-redesign list).
                      if (
                        !isMobile &&
                        section === 'evening' &&
                        isMealItem(item.id, item.type, item.title)
                      ) {
                        const timeLabel = item.startTime
                          ? new Date(item.startTime).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          : ''
                        const parsed = parseMealTitle(item.title)
                        // For synthesized meal events, MealEventsProvider stores
                        // the recipe source URL in `description` → maps onto
                        // `googleDescription` on the timeline item.
                        const recipeUrl = item.googleDescription?.startsWith('http')
                          ? item.googleDescription
                          : undefined
                        const fromPlan = String(item.id).startsWith('meal:')
                        // Core members (guests excluded) act as default diners
                        // until per-meal diner assignment lands. The first few
                        // surface as small stacked avatars on the card.
                        const coreMembers = familyMembers.filter((m) => m.member_type === 'core')
                        const diners = coreMembers.map((m) => ({
                          id: m.id,
                          initials: m.initials,
                          color: m.color,
                        }))
                        const servesCount = coreMembers.length > 0 ? coreMembers.length : undefined
                        return (
                          <div key={item.id}>
                            {showInsert && insertBefore}
                            <div {...(isFirstItem ? { 'data-today-first': '' } : {})}>
                              <EveningMealCard
                                title={parsed.title}
                                sides={parsed.sides}
                                timeLabel={timeLabel}
                                recipeUrl={recipeUrl}
                                fromPlan={fromPlan}
                                servesCount={servesCount}
                                diners={diners}
                                onSelect={() => onSelectItem(item.id)}
                              />
                            </div>
                          </div>
                        )
                      }

                      // Routine collection — collapsed row with per-step completion
                      if (item.type === 'routine-collection') {
                        return (
                          <div key={item.id} data-item-id={item.id}>
                            {showInsert && insertBefore}
                            <RoutineCollectionRow
                              item={item}
                              onSelect={() => handleSelectItem(item.id)}
                              onSelectStep={(stepId) => handleSelectItem(stepId)}
                              onCompleteStep={(stepTimelineId, completed) => {
                                if (!onCompleteRoutine) return
                                const { routineId, slot } = parseRoutineTimelineId(stepTimelineId)
                                const entityId = slot === null ? routineId : `${routineId}#${slot}`
                                onCompleteRoutine(entityId, completed)
                              }}
                              onSkipStep={onSkipRoutine ? (stepTimelineId) => {
                                const { routineId, slot } = parseRoutineTimelineId(stepTimelineId)
                                const entityId = slot === null ? routineId : `${routineId}#${slot}`
                                onSkipRoutine(entityId)
                              } : undefined}
                              onCompleteStepAt={onCompleteRoutine ? (stepTimelineId, completedAt) => {
                                const { routineId, slot } = parseRoutineTimelineId(stepTimelineId)
                                const entityId = slot === null ? routineId : `${routineId}#${slot}`
                                onCompleteRoutine(entityId, true, completedAt)
                              } : undefined}
                              onHideToday={onUpdateRoutine ? () => {
                                // Pause until tomorrow: reference + paused_until, so the
                                // useRoutines auto-resume brings it back on the next day.
                                const parentId = item.id.replace('routine-collection-', '')
                                const tomorrow = new Date()
                                tomorrow.setHours(0, 0, 0, 0)
                                tomorrow.setDate(tomorrow.getDate() + 1)
                                onUpdateRoutine(parentId, { visibility: 'reference', paused_until: tomorrow.toISOString() })
                              } : undefined}
                              onRemove={onUpdateRoutine ? () => {
                                const parentId = item.id.replace('routine-collection-', '')
                                onUpdateRoutine(parentId, { visibility: 'reference' })
                              } : undefined}
                            />
                          </div>
                        )
                      }

                      // Standard schedule item — mirror TodaySchedule wiring
                      return (
                        <div key={item.id} className={isGroupChild ? '-mt-1' : undefined}>
                        {showInsert && insertBefore}
                        <div data-item-id={item.id} className={groupCardClass || undefined} {...(isFirstItem ? { 'data-today-first': '' } : {})}>
                        {(() => {
                          const { routineId: bareRoutineId, slot } = item.type === 'routine'
                            ? parseRoutineTimelineId(item.id)
                            : { routineId: '', slot: null }
                          const routineEntityId = slot === null ? bareRoutineId : `${bareRoutineId}#${slot}`
                          return (
                            <>
                        <ScheduleItem
                          item={item}
                          selected={selectedItemId === item.id}
                          bulkSelectable={true}
                          bulkSelected={selectedKeys.has(item.id)}
                          showBulkAffordance={selectedKeys.size > 0}
                          onToggleBulkSelect={() => toggleBulkSelect(item.id)}
                          onSelect={() => handleSelectItem(item.id)}
                          onToggleWaiting={
                            item.type === 'task' && taskId && onToggleWaiting
                              ? () => onToggleWaiting(taskId)
                              : undefined
                          }
                          onToggleComplete={() => {
                            if (item.type === 'task' && taskId) {
                              onToggleTask(taskId)
                            } else if (item.type === 'routine' && onCompleteRoutine) {
                              onCompleteRoutine(routineEntityId, !item.completed)
                            } else if (item.type === 'event' && onCompleteEvent) {
                              onCompleteEvent(item.id.replace('event-', ''), !item.completed)
                            }
                          }}
                          onPush={
                            item.type === 'task' && taskId && onPushTask
                              ? (target) => onPushTask(taskId, target)
                              : item.type === 'routine' && onPushRoutine
                              ? (date) => { if (date instanceof Date) onPushRoutine(bareRoutineId, date) }
                              : item.type === 'event' && onPushEvent
                              ? (date) => { if (date instanceof Date) onPushEvent(item.id.replace('event-', ''), date) }
                              : undefined
                          }
                          onSchedule={
                            item.type === 'task' && taskId && onUpdateTask
                              ? (date, isAllDay) => onUpdateTask(taskId, { bucket: 'timed', scheduledFor: date, isAllDay })
                              : undefined
                          }
                          onSkip={
                            item.type === 'routine' && onSkipRoutine
                              ? () => onSkipRoutine(routineEntityId)
                              : item.type === 'event' && onSkipEvent
                              ? () => onSkipEvent(item.id.replace('event-', ''))
                              : undefined
                          }
                          contactName={contactName}
                          projectName={projectName}
                          projectId={item.projectId ?? undefined}
                          parentTaskName={parentTaskName}
                          parentTaskId={parentTaskId}
                          onOpenParentTask={onOpenTask}
                          familyMembers={familyMembers}
                          assignedTo={item.assignedTo}
                          onAssign={
                            item.type === 'task' && taskId && onAssignTask
                              ? (memberId) => onAssignTask(taskId, memberId)
                              : item.type === 'event' && onAssignEvent
                              ? (memberId) => onAssignEvent(item.id.replace('event-', ''), memberId)
                              : item.type === 'routine' && onAssignRoutine
                              ? (memberId) => onAssignRoutine(bareRoutineId, memberId)
                              : undefined
                          }
                          assignedToAll={
                            item.type === 'event' && eventNotesMap
                              ? eventNotesMap.get(item.id.replace('event-', ''))?.assignedToAll ?? []
                              : item.type === 'task'
                              ? item.originalTask?.assignedToAll ?? []
                              : item.type === 'routine'
                              ? item.originalRoutine?.assigned_to_all ?? []
                              : []
                          }
                          onAssignAll={
                            item.type === 'task' && taskId && onAssignTaskAll
                              ? (memberIds) => onAssignTaskAll(taskId, memberIds)
                              : item.type === 'event' && onAssignEventAll
                              ? (memberIds) => onAssignEventAll(item.id.replace('event-', ''), memberIds)
                              : item.type === 'routine' && onAssignRoutineAll
                              ? (memberIds) => onAssignRoutineAll(bareRoutineId, memberIds)
                              : undefined
                          }
                          onContextChange={
                            item.type === 'task' && taskId && onUpdateTask
                              ? (context) => onUpdateTask(taskId, { context })
                              : item.type === 'routine' && onUpdateRoutine
                              ? (context) => onUpdateRoutine(bareRoutineId, { context })
                              : item.type === 'event' && onUpdateEventContext
                              ? (context) => onUpdateEventContext(item.id.replace('event-', ''), context ?? null)
                              : undefined
                          }
                          onUpdateDiscussion={
                            item.type === 'task' && taskId && onUpdateTask
                              ? (next) => onUpdateTask(taskId, next)
                              : undefined
                          }
                          panelOpen={panelOpen}
                          onClosePanel={onClosePanel}
                          isSuggestedPromotion={
                            item.type === 'event'
                              ? isPromotionSuggested(item.id.replace('event-', ''))
                              : undefined
                          }
                          variant={item.type === 'routine' ? 'minimal' : 'full'}
                          routineStreak={
                            item.type === 'routine'
                              ? getRoutineStats(bareRoutineId)?.currentStreak
                              : undefined
                          }
                          suggestions={(() => {
                            const entityType = item.type === 'event' ? 'calendar_event' : item.type === 'task' ? 'task' : null
                            const entityId = item.type === 'event' ? item.id.replace('event-', '') : taskId
                            if (!entityType || !entityId) return undefined
                            const s = proactive.suggestionsForEntity(entityType, entityId)
                            return s.length > 0 ? s : undefined
                          })()}
                          onActSuggestion={proactive.actOnSuggestion}
                          onDismissSuggestion={proactive.dismissSuggestion}
                          onOpenGuidedChat={onOpenGuidedChat}
                        />
                        {item.type === 'event' && (() => {
                          const nudge = shareNudgeByEventId.get(item.id.replace('event-', ''))
                          if (!nudge) return null
                          return (
                            <ShareToFamilyNudge
                              contextLabel={nudge.context}
                              onAdd={() => ctx.onShareEventWithFamily?.(nudge.eventId)}
                              onDismiss={() => ctx.onDismissShareNudge?.(nudge.eventId)}
                            />
                          )
                        })()}
                            </>
                          )
                        })()}
                        </div>
                        </div>
                      )
                    })}
                    {/* Trailing insert point: after the last item per section */}
                    {(() => {
                      const insertCtxTrailing = {
                        before: items.length > 0 ? (items[items.length - 1].startTime ?? null) : null,
                        after: null,
                        section,
                        date: viewedDate,
                      }
                      return (
                        <TimelineInsertPoint
                          onPick={(k) => insert.handlePick(insertCtxTrailing, k)}
                          onCreate={(kind, r) => {
                            if (kind === 'task') onCreateTaskAt?.(r)
                            else if (kind === 'event') onCreateEventAt?.(r)
                            else onCreateRoutineAt?.(r)
                          }}
                          quickInput={{
                            anchorTime: computeAnchorTime(insertCtxTrailing),
                            parserContext,
                            currentDomain,
                          }}
                        />
                      )
                    })()}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {/* End of day — closing chapter for the timeline. Desktop-only; mobile
          keeps a tighter schedule-focused view. onOpenReview is a no-op until
          Phase 2 wires the review flow (intentional handoff). */}
      <div className="mt-5 hidden md:block">
        <EndOfDayCard onOpenReview={() => {}} />
      </div>

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
