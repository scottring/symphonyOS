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
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { TimelineCaptureResult } from '@/components/schedule/TimelineQuickInput'
import type { ParserContext } from '@/lib/quickInputParser'
import type { HomeViewType } from '@/types/homeView'

import { useMobile } from '@/hooks/useMobile'
import { useTodayData } from '@/hooks/useTodayData'
import { mergeAssignees } from '@/lib/today/bulkAssign'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { useProactiveSuggestions } from '@/hooks/useProactiveSuggestions'
import { useRoutineStats } from '@/hooks/useRoutineStats'
import { useRecurringEventDetection } from '@/hooks/useRecurringEventDetection'
import { useTimelineInsert } from '@/hooks/useTimelineInsert'
import { useDomain } from '@/hooks/useDomain'
import { computeAnchorTime } from '@/lib/timelineAnchor'

import { Eye, EyeOff, Repeat, CalendarClock, Mail, Binoculars } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AssigneeFilter } from '@/components/home/AssigneeFilter'

import { TodayAddInput } from './TodayAddInput'
import { TimelineInsertPoint } from './TimelineInsertPoint'
import { StatsRow } from './StatsRow'
import { ClarityIndicator } from './ClarityIndicator'
import { StagingFloat } from './StagingFloat'
import { EveningMealCard } from './EveningMealCard'
import { EndOfDayCard } from './EndOfDayCard'
import { ScheduleItem } from './ScheduleItem'
import { OverdueSection } from './OverdueSection'
import { BulkActionToolbar } from './BulkActionToolbar'
import { TimelineNoteComposer } from './TimelineNoteComposer'

import { useEmailActionItems } from '@/hooks/useEmailActionItems'

import { discussionItems } from '@/lib/discussionItems'
import { DiscussionBadge } from './DiscussionBadge'
import { daySectionMeta } from '@/lib/daySectionMeta'
import { parseMealTitle } from '@/lib/mealTitle'
import { readHideRoutines, writeHideRoutines, onHideRoutinesChange } from '@/lib/hideRoutinesSignal'

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
  onCompleteRoutine?: (routineId: string, completed: boolean) => void
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
  loading: _loading,
  viewedDate,
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
    onAssignTask, onAssignTaskAll, onAssignEvent, onAssignEventAll,
    onAssignRoutine, onAssignRoutineAll,
    onSkipRoutine, onPushRoutine, onUpdateRoutine,
    onSkipEvent, onPushEvent, onUpdateEventContext,
    onOpenTask, onOpenGuidedChat, onCreateFollowUp,
    contactsMap, projectsMap, familyMembers = [],
    eventNotesMap,
  } = ctx

  // ── Bulk multi-select (hover checkbox on task rows → bottom action bar) ──────
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set())
  const clearBulkSelection = useCallback(() => setSelectedTaskIds(new Set()), [])
  const toggleBulkSelect = useCallback((taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }, [])
  const handleBulkDefer = useCallback((target: 'week' | 'month' | 'quarter') => {
    if (!onUpdateTask) return
    for (const id of selectedTaskIds) onUpdateTask(id, { bucket: target, scheduledFor: undefined })
    clearBulkSelection()
  }, [selectedTaskIds, onUpdateTask, clearBulkSelection])
  const handleBulkSchedule = useCallback((date: Date, isAllDay: boolean) => {
    if (!onUpdateTask) return
    for (const id of selectedTaskIds) onUpdateTask(id, { bucket: 'timed', scheduledFor: date, isAllDay })
    clearBulkSelection()
  }, [selectedTaskIds, onUpdateTask, clearBulkSelection])
  const handleBulkSetContext = useCallback((context: Task['context']) => {
    if (!onUpdateTask) return
    for (const id of selectedTaskIds) onUpdateTask(id, { context })
    clearBulkSelection()
  }, [selectedTaskIds, onUpdateTask, clearBulkSelection])
  // Additive assign: union the chosen members into each task's existing
  // assignees (so "assign these to Iris" adds Iris without dropping Scott),
  // matching the user's "if she isn't already assigned" intent.
  const handleBulkAssign = useCallback((memberIds: string[]) => {
    if (!onAssignTaskAll) return
    for (const id of selectedTaskIds) {
      onAssignTaskAll(id, mergeAssignees(tasks.find((x) => x.id === id), memberIds))
    }
    clearBulkSelection()
  }, [selectedTaskIds, tasks, onAssignTaskAll, clearBulkSelection])

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
    if (!isMobile) return
    const id = setInterval(() => setNowTick(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [isMobile])
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
      onCompleteTask={ctx.onToggleTask}
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
      className="inline-flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors"
      aria-label={`${activeEmailCount} email action${activeEmailCount !== 1 ? 's' : ''} in Inbox`}
    >
      <Mail className="w-4 h-4 text-blue-400" />
      {activeEmailCount} from email
    </button>
  ) : undefined

  // ── Clarity binoculars + remediation popover for StatsRow ─────────────────────
  // Interactive Clarity readout restored to the Today header (a static status
  // glance also lives in the sidebar). Trigger is a binoculars icon with an
  // explanatory hover tooltip; clicking opens ClarityIndicator's popover.
  const clarityTrigger = (
    <ClarityIndicator
      tasks={tasks}
      projects={projects}
      familyMembers={familyMembers}
      onScrollToInbox={() => navigate('/inbox')}
      onClearAssigneeFilter={onSelectAssignees ? () => onSelectAssignees([]) : undefined}
      onOpenProject={ctx.onOpenProject}
      onAssignTaskAll={onAssignTaskAll}
      trigger={
        <span className="group relative inline-flex items-center">
          <Binoculars
            className="w-4 h-4 text-neutral-400 group-hover:text-neutral-700 transition-colors"
            aria-label="Clarity — review what needs attention"
          />
          <span
            role="tooltip"
            className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 hidden group-hover:block w-56 rounded-lg bg-neutral-800 px-3 py-2 text-[11px] leading-snug text-white shadow-lg"
          >
            <span className="font-medium">Clarity</span> — a quick read on how settled your
            tasks and projects are. Click to see what still needs a home.
          </span>
        </span>
      }
    />
  )

  // ── Tasks map for parent task lookup ─────────────────────────────────────────
  const tasksMap = useMemo(() => {
    const map = new Map<string, Task>()
    for (const t of tasks) {
      map.set(t.id, t)
    }
    return map
  }, [tasks])

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
          if (items && items.length > 0) return items[0].id
        }
        return null
      })()

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[940px] w-full mx-auto px-0 py-2 md:px-8 md:py-8">
      {/* Stats + function bar — desktop only. Mobile combines the filters
          into the Add-to-today row below to save vertical space. */}
      <div className="hidden md:block mb-6">
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
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-all ${hideRoutines ? 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'}`}
              >
                {createElement(hideRoutines ? EyeOff : Eye, { className: 'w-4 h-4' })}
                <span>{hideRoutines ? 'Show daily' : 'Hide daily'}</span>
              </button>
              {data.isToday && ctx.onOpenPlanning && (
                <button
                  type="button"
                  onClick={ctx.onOpenPlanning}
                  title="Plan day — drag unscheduled tasks and routines onto the timeline"
                  aria-label="Plan day"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-primary-600 hover:bg-primary-50 transition-all"
                >
                  <CalendarClock className="w-4 h-4" />
                  <span>Plan day</span>
                </button>
              )}
            </>
          }
        />
      </div>

      {/* Inline "Add to today" — today-only, when onCreateTask is wired.
          Desktop: full-width add input. Mobile: same input but flanked by the
          assignee + show-daily filters on the right, so the whole filter row
          is folded into this one to save vertical space. */}
      {data.isToday && ctx.onCreateTask && (
        <>
          {/* Desktop: just the add input */}
          <div className="hidden md:block mb-4">
            <TodayAddInput onAdd={ctx.onCreateTask} />
          </div>
          {/* Mobile: combined add + filters */}
          <div className="md:hidden mb-2 px-3 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <TodayAddInput onAdd={ctx.onCreateTask} />
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
            {data.isToday && ctx.onOpenPlanning && (
              <button
                type="button"
                onClick={ctx.onOpenPlanning}
                aria-label="Plan day"
                className="shrink-0 p-2 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
              >
                <CalendarClock className="w-4 h-4" />
              </button>
            )}
          </div>
        </>
      )}

      {/* Task list — wrapped in a card on desktop; on mobile the rows go
          full-width (no card, no border, no inner padding) to match the
          compact list the pre-redesign mobile had. */}
      <div ref={listRef} className="md:card md:rounded-2xl md:border md:border-neutral-200/70 md:px-5 md:py-4">
        {data.counts.totalItems === 0 ? (
          <div className="text-center py-16">
            <p className="font-display text-xl text-neutral-700">Your day is clear</p>
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
                  bulkSelectedIds={selectedTaskIds}
                  onToggleBulkSelect={toggleBulkSelect}
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
              const items = data.grouped[section]
              if (!items || items.length === 0) return null
              const meta = daySectionMeta(section)
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
                            {insertBefore}
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

                      // Standard schedule item — mirror TodaySchedule wiring
                      return (
                        <div key={item.id}>
                        {insertBefore}
                        <div data-item-id={item.id} {...(isFirstItem ? { 'data-today-first': '' } : {})}>
                        <ScheduleItem
                          item={item}
                          selected={selectedItemId === item.id}
                          bulkSelectable={item.type === 'task' && !!taskId}
                          bulkSelected={!!taskId && selectedTaskIds.has(taskId)}
                          showBulkAffordance={selectedTaskIds.size > 0}
                          onToggleBulkSelect={taskId ? () => toggleBulkSelect(taskId) : undefined}
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
                              onCompleteRoutine(item.id.replace('routine-', ''), !item.completed)
                            } else if (item.type === 'event' && onCompleteEvent) {
                              onCompleteEvent(item.id.replace('event-', ''), !item.completed)
                            }
                          }}
                          onPush={
                            item.type === 'task' && taskId && onPushTask
                              ? (target) => onPushTask(taskId, target)
                              : item.type === 'routine' && onPushRoutine
                              ? (date) => { if (date instanceof Date) onPushRoutine(item.id.replace('routine-', ''), date) }
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
                              ? () => onSkipRoutine(item.id.replace('routine-', ''))
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
                              ? (memberId) => onAssignRoutine(item.id.replace('routine-', ''), memberId)
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
                              ? (memberIds) => onAssignRoutineAll(item.id.replace('routine-', ''), memberIds)
                              : undefined
                          }
                          onContextChange={
                            item.type === 'task' && taskId && onUpdateTask
                              ? (context) => onUpdateTask(taskId, { context })
                              : item.type === 'routine' && onUpdateRoutine
                              ? (context) => onUpdateRoutine(item.id.replace('routine-', ''), { context })
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
                              ? getRoutineStats(item.id.replace('routine-', ''))?.currentStreak
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

      {/* Bulk action bar — appears when ≥1 task row is selected via the
          hover checkbox. Reuses the shared toolbar (Inbox uses the same). */}
      {selectedTaskIds.size > 0 && (
        <BulkActionToolbar
          selectedCount={selectedTaskIds.size}
          onDefer={handleBulkDefer}
          onSchedule={handleBulkSchedule}
          onSetContext={handleBulkSetContext}
          onAssign={handleBulkAssign}
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
