/**
 * TodayView — editorial Today shell.
 *
 * Drop-in replacement for TodaySchedule (same TodayScheduleProps interface).
 * Composes: TodayHeader, StatsRow, TodaysFocusCard, WeatherCard,
 *           AiSuggestionBanner, EveningMealCard, ScheduleItem.
 *
 * NOT wired to the route yet — that happens in R4.
 */
import { createElement, useMemo, useCallback, useRef, useState } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { TimelineCaptureResult } from '@/components/schedule/TimelineQuickInput'
import type { ParserContext } from '@/lib/quickInputParser'
import type { HomeViewType } from '@/types/homeView'

import { useTodayData } from '@/hooks/useTodayData'
import { useSystemHealth } from '@/hooks/useSystemHealth'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { useProactiveSuggestions } from '@/hooks/useProactiveSuggestions'
import { useRoutineStats } from '@/hooks/useRoutineStats'
import { useRecurringEventDetection } from '@/hooks/useRecurringEventDetection'
import { useTimelineInsert } from '@/hooks/useTimelineInsert'
import { useDomain } from '@/hooks/useDomain'
import { computeAnchorTime } from '@/lib/timelineAnchor'

import { Eye, EyeOff } from 'lucide-react'
import { AssigneeFilter } from '@/components/home/AssigneeFilter'

import { TodayAddInput } from './TodayAddInput'
import { TimelineInsertPoint } from './TimelineInsertPoint'
import { TodayHeader } from './TodayHeader'
import { StatsRow } from './StatsRow'
import { ClarityIndicator } from './ClarityIndicator'
import { StagingFloat } from './StagingFloat'
import { TodaysFocusCard } from './TodaysFocusCard'
import { WeatherCard } from './WeatherCard'
import { AiSuggestionBanner } from './AiSuggestionBanner'
import { EveningMealCard } from './EveningMealCard'
import { ScheduleItem } from './ScheduleItem'
import { OverdueSection } from './OverdueSection'
import { EmailActionsBanner } from './EmailActionsBanner'
import { TimelineNoteComposer } from './TimelineNoteComposer'

import { useEmailActionItems } from '@/hooks/useEmailActionItems'

import { focusHeadline } from '@/lib/focusHeadline'
import { daySectionMeta } from '@/lib/daySectionMeta'

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
  // Assignee filter (managed by HomeView)
  selectedAssignee?: string | null
  onSelectAssignee?: (id: string | null) => void
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
  onDateChange,
  selectedAssignee,
  onSelectAssignee,
  assigneesWithTasks,
  hasUnassignedTasks,
  panelOpen,
  onClosePanel,
  onCreateNoteAt: onCreateNoteAtProp,
  onAppendNoteAt: onAppendNoteAtProp,
  onLinkNote: onLinkNoteProp,
  timelineNotes: timelineNotesProp,
  currentHomeView,
  onHomeViewChange,
}: TodayViewProps) {
  // ── Context ──────────────────────────────────────────────────────────────────
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

  // ── Hide-routines toggle (localStorage parity) ────────────────────────────────
  const [hideRoutines, setHideRoutines] = useState<boolean>(() => {
    try { return localStorage.getItem('symphony-hide-routines') === 'true' } catch { return false }
  })
  const toggleHideRoutines = useCallback(() => {
    setHideRoutines((v) => {
      try { localStorage.setItem('symphony-hide-routines', String(!v)) } catch { /* ignore */ }
      return !v
    })
  }, [])

  // ── Derived data ─────────────────────────────────────────────────────────────
  const todayInput = useMemo(() => ({
    tasks,
    events,
    routines,
    dateInstances,
    viewedDate,
    selectedAssignee: selectedAssignee ?? null,
    hideRoutines,
    // Cast: EventNote.notes is string|null; TodayDataInput expects string|undefined — structurally compatible at runtime
    eventNotesMap: ctx.eventNotesMap as unknown as Map<string, { notes?: string; assignedTo?: string | null }> | undefined,
    eventContextOverrides: ctx.eventContextOverrides,
    getDomainForCalendar: ctx.getDomainForCalendar,
  }), [tasks, events, routines, dateInstances, viewedDate, selectedAssignee, hideRoutines,
      ctx.eventNotesMap, ctx.eventContextOverrides, ctx.getDomainForCalendar])

  const data = useTodayData(todayInput)
  const health = useSystemHealth({ tasks, projects, projectsWithLinkedEvents: new Set() })
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

  // ── Clarity label ─────────────────────────────────────────────────────────────
  const clarityLabel = (
    { excellent: 'Excellent', good: 'Good', fair: 'Fair', needsAttention: 'Needs attention' } as const
  )[health.healthColor]

  // Build clarity ring trigger — reuse ClarityIndicator's ring logic inline so
  // the trigger shows: small ring (22 px) + stacked "Clarity" / status label.
  // ClarityIndicator receives this as `trigger` and wraps it in its click button.
  const clarityRingColorClass = (
    { excellent: 'text-primary-500', good: 'text-sage-500', fair: 'text-amber-500', needsAttention: 'text-orange-500' } as const
  )[health.healthColor]
  const clarityStatusColorClass = (
    { excellent: 'text-primary-600', good: 'text-sage-600', fair: 'text-amber-600', needsAttention: 'text-amber-600' } as const
  )[health.healthColor]
  const clarityRingSize = 22
  const clarityStroke = 2.5
  const clarityRadius = (clarityRingSize - clarityStroke) / 2
  const clarityCircumference = 2 * Math.PI * clarityRadius
  const clarityOffset = clarityCircumference - (health.score / 100) * clarityCircumference

  const clarityRingTrigger = (
    <span className="inline-flex items-center gap-1.5 cursor-pointer">
      {/* Mini ring — same geometry as ClarityIndicator's 32px ring, scaled to 22px */}
      <span className="relative shrink-0" style={{ width: clarityRingSize, height: clarityRingSize }}>
        <svg width={clarityRingSize} height={clarityRingSize} className="transform -rotate-90" aria-hidden="true">
          <circle
            cx={clarityRingSize / 2}
            cy={clarityRingSize / 2}
            r={clarityRadius}
            fill="none"
            stroke="currentColor"
            strokeWidth={clarityStroke}
            className="text-neutral-100"
          />
          <circle
            cx={clarityRingSize / 2}
            cy={clarityRingSize / 2}
            r={clarityRadius}
            fill="none"
            strokeWidth={clarityStroke}
            strokeLinecap="round"
            strokeDasharray={clarityCircumference}
            strokeDashoffset={clarityOffset}
            className={`${clarityRingColorClass} transition-all duration-500`}
          />
        </svg>
      </span>
      {/* Stacked label */}
      <span className="flex flex-col items-start leading-none">
        <span className="text-[13px] text-neutral-600 font-medium">Clarity</span>
        <span className={`text-[11px] ${clarityStatusColorClass}`}>{clarityLabel}</span>
      </span>
    </span>
  )

  const clarityTrigger = (
    <ClarityIndicator
      tasks={tasks}
      projects={projects ?? []}
      familyMembers={familyMembers}
      onOpenProject={ctx.onOpenProject}
      onAssignTaskAll={ctx.onAssignTaskAll}
      trigger={clarityRingTrigger}
    />
  )

  const weekTrigger = (
    <StagingFloat
      weekTasks={data.weekTasks}
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

  // ── Focus card counts ─────────────────────────────────────────────────────────
  const { focusPriorities, focusMeals, focusEvents } = useMemo(() => {
    const allItems = Object.values(data.grouped).flat()
    let focusPriorities = 0
    let focusMeals = 0
    let focusEvents = 0
    for (const item of allItems) {
      if (isMealItem(item.id, item.type, item.title)) {
        focusMeals++
      } else if (item.type === 'event') {
        focusEvents++
      } else if (item.type === 'task' && !item.completed) {
        focusPriorities++
      }
    }
    return { focusPriorities, focusMeals, focusEvents }
  }, [data.grouped])

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

  const handleFocusActivate = useCallback(() => {
    const el = listRef.current?.querySelector('[data-today-first]') as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

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
    <div className="max-w-[860px] mx-auto px-8 py-8">
      {/* Header */}
      <TodayHeader
        viewedDate={viewedDate}
        onDateChange={onDateChange}
        currentHomeView={currentHomeView}
        onHomeViewChange={onHomeViewChange}
      />

      {/* Stats + function bar — single consolidated row */}
      <div className="mb-6">
        <StatsRow
          dueToday={data.counts.actionableCount}
          doneToday={data.counts.completedCount}
          thisWeek={data.weekTasks.length}
          total={tasks.filter((t) => !t.completed).length}
          clarityLabel={clarityLabel}
          aiAvailable={false}
          clarityTrigger={clarityTrigger}
          weekTrigger={weekTrigger}
          endControls={
            <>
              {onSelectAssignee && ((assigneesWithTasks?.length ?? 0) > 0 || hasUnassignedTasks) && (
                <AssigneeFilter
                  selectedAssignees={selectedAssignee ? [selectedAssignee] : []}
                  onSelectAssignees={(ids) => onSelectAssignee(ids.length > 0 ? ids[0] : null)}
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
            </>
          }
        />
      </div>

      {/* Inline "Add to today" — desktop-only, today-only, when onCreateTask is wired */}
      {data.isToday && ctx.onCreateTask && (
        <div className="mb-4">
          <TodayAddInput onAdd={ctx.onCreateTask} />
        </div>
      )}

      {/* Two-up: Focus card + Weather — only shown when there is something to focus on */}
      {data.counts.totalItems > 0 && (
        <div className="grid grid-cols-[1.6fr_1fr] gap-4 mb-7 mt-6">
          <TodaysFocusCard
            headline={focusHeadline(health.healthColor)}
            priorities={focusPriorities}
            meals={focusMeals}
            events={focusEvents}
            onActivate={handleFocusActivate}
          />
          <WeatherCard />
        </div>
      )}

      {/* Task list card — single outer card wraps all sections */}
      <div ref={listRef} className="card rounded-2xl border border-neutral-200/70 px-5 py-4">
        {data.counts.totalItems === 0 ? (
          <div className="text-center py-16">
            <p className="font-display text-xl text-neutral-700">Your day is clear</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overdue section — gets data-today-first marker when it renders */}
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

            {/* Email action items - from Gmail scanner */}
            {data.isToday && (
              <EmailActionsBanner
                items={emailActions.items}
                onAcknowledge={emailActions.acknowledge}
                onDismiss={emailActions.dismiss}
                onSnooze={emailActions.snooze}
              />
            )}

            {/* Sections */}
            {data.sectionsOrder.map((section) => {
              const items = data.grouped[section]
              if (!items || items.length === 0) return null
              const meta = daySectionMeta(section)
              return (
                <section key={section}>
                  <h3 className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-neutral-400 mb-3">
                    {createElement(meta.Icon, { className: 'w-4 h-4 text-amber-500 shrink-0' })}
                    <span>{meta.label}</span>
                    {meta.range && (
                      <span className="text-neutral-300 normal-case font-normal">
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

                      // Evening meal gets a special card
                      if (
                        section === 'evening' &&
                        isMealItem(item.id, item.type, item.title)
                      ) {
                        const timeLabel = item.startTime
                          ? new Date(item.startTime).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          : ''
                        return (
                          <div key={item.id}>
                            {insertBefore}
                            <div {...(isFirstItem ? { 'data-today-first': '' } : {})}>
                              <EveningMealCard
                                title={item.title}
                                timeLabel={timeLabel}
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
                        <div {...(isFirstItem ? { 'data-today-first': '' } : {})}>
                        <ScheduleItem
                          item={item}
                          selected={selectedItemId === item.id}
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

      {/* AI banner */}
      <div className="mt-5">
        <AiSuggestionBanner />
      </div>

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
