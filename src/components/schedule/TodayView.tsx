/**
 * TodayView — editorial Today shell.
 *
 * Drop-in replacement for TodaySchedule (same TodayScheduleProps interface).
 * Composes: TodayHeader, StatsRow, TodaysFocusCard, WeatherCard,
 *           AiSuggestionBanner, EveningMealCard, ScheduleItem.
 *
 * NOT wired to the route yet — that happens in R4.
 */
import { createElement, useMemo, useCallback, useRef } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { TimelineCaptureResult } from '@/components/schedule/TimelineQuickInput'

import { useTodayData } from '@/hooks/useTodayData'
import { useSystemHealth } from '@/hooks/useSystemHealth'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { useProactiveSuggestions } from '@/hooks/useProactiveSuggestions'
import { useRoutineStats } from '@/hooks/useRoutineStats'
import { useRecurringEventDetection } from '@/hooks/useRecurringEventDetection'

import { TodayHeader } from './TodayHeader'
import { StatsRow } from './StatsRow'
import { ClarityIndicator } from './ClarityIndicator'
import { TodaysFocusCard } from './TodaysFocusCard'
import { WeatherCard } from './WeatherCard'
import { AiSuggestionBanner } from './AiSuggestionBanner'
import { EveningMealCard } from './EveningMealCard'
import { ScheduleItem } from './ScheduleItem'

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
  panelOpen,
  onClosePanel,
}: TodayViewProps) {
  // ── Context ──────────────────────────────────────────────────────────────────
  const ctx = useScheduleActionsContext()
  const {
    onToggleWaiting, onUpdateTask, onPushTask,
    onAssignTask, onAssignTaskAll, onAssignEvent, onAssignEventAll,
    onAssignRoutine, onAssignRoutineAll,
    onSkipRoutine, onPushRoutine, onUpdateRoutine,
    onSkipEvent, onPushEvent, onUpdateEventContext,
    onOpenTask, onOpenGuidedChat,
    contactsMap, projectsMap, familyMembers = [],
    eventNotesMap,
  } = ctx

  // ── Derived data ─────────────────────────────────────────────────────────────
  const todayInput = useMemo(() => ({
    tasks,
    events,
    routines,
    dateInstances,
    viewedDate,
    selectedAssignee: selectedAssignee ?? null,
    hideRoutines: false,
    // Cast: EventNote.notes is string|null; TodayDataInput expects string|undefined — structurally compatible at runtime
    eventNotesMap: ctx.eventNotesMap as unknown as Map<string, { notes?: string; assignedTo?: string | null }> | undefined,
    eventContextOverrides: ctx.eventContextOverrides,
    getDomainForCalendar: ctx.getDomainForCalendar,
  }), [tasks, events, routines, dateInstances, viewedDate, selectedAssignee,
      ctx.eventNotesMap, ctx.eventContextOverrides, ctx.getDomainForCalendar])

  const data = useTodayData(todayInput)
  const health = useSystemHealth({ tasks, projects, projectsWithLinkedEvents: new Set() })
  const proactive = useProactiveSuggestions()
  const { getStats: getRoutineStats } = useRoutineStats()
  const { isPromotionSuggested } = useRecurringEventDetection(events, eventNotesMap)

  // ── Clarity label ─────────────────────────────────────────────────────────────
  const clarityLabel = (
    { excellent: 'Excellent', good: 'Good', fair: 'Fair', needsAttention: 'Needs attention' } as const
  )[health.healthColor]

  const clarityTrigger = (
    <ClarityIndicator
      tasks={tasks}
      projects={projects ?? []}
      familyMembers={familyMembers}
      onOpenProject={ctx.onOpenProject}
      onAssignTaskAll={ctx.onAssignTaskAll}
      trigger={<span className="cursor-pointer">Clarity <span className="text-neutral-400">{clarityLabel}</span></span>}
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
    <div className="max-w-3xl mx-auto px-6 py-10">
      {/* Header */}
      <TodayHeader
        viewedDate={viewedDate}
        onDateChange={onDateChange}
      />

      {/* Stats row */}
      <div className="mb-6">
        <StatsRow
          dueToday={data.counts.actionableCount}
          doneToday={data.counts.completedCount}
          thisWeek={data.weekTasks.length}
          total={tasks.filter((t) => !t.completed).length}
          clarityLabel={clarityLabel}
          aiAvailable={false}
          clarityTrigger={clarityTrigger}
        />
      </div>

      {/* Two-up: Focus card + Weather — only shown when there is something to focus on */}
      {data.counts.totalItems > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-4 mb-6">
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

      {/* Task list card */}
      <div ref={listRef} className="card p-4">
        {data.counts.totalItems === 0 ? (
          <div className="text-center py-16">
            <p className="font-display text-xl text-neutral-700">Your day is clear</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overdue section — gets data-today-first marker when it renders */}
            {data.isToday && data.overdueTasks.length > 0 && (
              <section data-today-first="" className="mb-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">
                  Overdue
                </div>
                {data.overdueTasks.map((task) => {
                  const itemId = `task-${task.id}`
                  return (
                    <ScheduleItem
                      key={itemId}
                      item={{
                        id: itemId,
                        type: 'task',
                        title: task.title,
                        completed: task.completed,
                        startTime: task.scheduledFor ? new Date(task.scheduledFor) : null,
                        endTime: null,
                        allDay: task.isAllDay,
                        projectId: task.projectId ?? undefined,
                        contactId: task.contactId ?? undefined,
                        assignedTo: task.assignedTo ?? undefined,
                        originalTask: task,
                      }}
                      isOverdue
                      selected={selectedItemId === itemId}
                      onSelect={() => handleSelectItem(itemId)}
                      onToggleComplete={() => onToggleTask(task.id)}
                      onToggleWaiting={onToggleWaiting ? () => onToggleWaiting(task.id) : undefined}
                      onPush={onPushTask ? (target) => onPushTask(task.id, target) : undefined}
                      onSchedule={onUpdateTask
                        ? (date, isAllDay) => onUpdateTask(task.id, { bucket: 'timed', scheduledFor: date, isAllDay })
                        : undefined}
                      contactName={task.contactId && contactsMap?.get(task.contactId)?.name || undefined}
                      projectName={task.projectId && projectsMap?.get(task.projectId)?.name || undefined}
                      projectId={task.projectId ?? undefined}
                      familyMembers={familyMembers}
                      assignedTo={task.assignedTo ?? undefined}
                      onAssign={onAssignTask ? (memberId) => onAssignTask(task.id, memberId) : undefined}
                      assignedToAll={task.assignedToAll ?? []}
                      onAssignAll={onAssignTaskAll ? (memberIds) => onAssignTaskAll(task.id, memberIds) : undefined}
                      onContextChange={onUpdateTask
                        ? (context) => onUpdateTask(task.id, { context })
                        : undefined}
                      onOpenParentTask={onOpenTask}
                      panelOpen={panelOpen}
                      onClosePanel={onClosePanel}
                    />
                  )
                })}
              </section>
            )}

            {/* Sections */}
            {data.sectionsOrder.map((section) => {
              const items = data.grouped[section]
              if (!items || items.length === 0) return null
              const meta = daySectionMeta(section)
              return (
                <section key={section}>
                  <h3 className="time-group-header mb-3 flex items-center gap-2">
                    {createElement(meta.Icon, { className: 'w-4 h-4 text-amber-500 shrink-0' })}
                    <span>{meta.label}</span>
                    {meta.range && (
                      <span className="text-[11px] font-normal tracking-normal text-neutral-400 normal-case">
                        {meta.range}
                      </span>
                    )}
                  </h3>

                  <div className="space-y-1">
                    {items.map((item) => {
                      const taskId = item.id.startsWith('task-') ? item.id.replace('task-', '') : null
                      const contactName = item.contactId && contactsMap?.get(item.contactId)?.name || undefined
                      const projectName = item.projectId && projectsMap?.get(item.projectId)?.name || undefined
                      const parentTaskId = item.parentTaskId
                      const parentTaskName = parentTaskId ? tasksMap.get(parentTaskId)?.title : undefined
                      const isFirstItem = item.id === firstSectionItemId

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
                          <div key={item.id} {...(isFirstItem ? { 'data-today-first': '' } : {})}>
                            <EveningMealCard
                              title={item.title}
                              timeLabel={timeLabel}
                              onSelect={() => onSelectItem(item.id)}
                            />
                          </div>
                        )
                      }

                      // Standard schedule item — mirror TodaySchedule wiring
                      return (
                        <div key={item.id} {...(isFirstItem ? { 'data-today-first': '' } : {})}>
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
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {/* AI banner */}
      <div className="mt-6">
        <AiSuggestionBanner />
      </div>
    </div>
  )
}
