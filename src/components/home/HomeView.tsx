import { useState, useMemo, useCallback } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { useHomeView } from '@/hooks/useHomeView'
import { useMobile } from '@/hooks/useMobile'
import { useUndo } from '@/hooks/useUndo'
import { useDomain, type Domain } from '@/hooks/useDomain'
import { WeekView } from './WeekView'
import { WeekViewV2 } from './week/WeekViewV2'
import { WeekViewMobile } from './week/WeekViewMobile'
import { MonthView } from './MonthView'

const WEEK_V2_FLAG = 'symphony-week-v2'
function isWeekV2Enabled(): boolean {
  if (typeof window === 'undefined') return false
  // Default ON. Users can opt out by running in the browser console:
  //   localStorage.setItem('symphony-week-v2', 'off'); location.reload()
  // Known Phase 4b gaps still to address: undo/toast wiring, prev/next-week
  // nav arrows, mobile events/routines rendering, DragOverlay block ghost.
  return localStorage.getItem(WEEK_V2_FLAG) !== 'off'
}
import { CascadingRiverView } from './CascadingRiverView'
import { TodayView } from '@/components/schedule/TodayView'
import { UndoToast } from '@/components/undo/UndoToast'
import { DomainSwitcher } from '@/components/domain/DomainSwitcher'

interface HomeViewProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  projects: Project[]
  dateInstances: ActionableInstance[]
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  loading?: boolean
  viewedDate: Date
  onDateChange: (date: Date) => void
  currentUserMemberId?: string
  bothPanelsOpen?: boolean
}

export function HomeView({
  tasks,
  events,
  routines,
  projects,
  dateInstances,
  selectedItemId,
  onSelectItem,
  loading,
  viewedDate,
  onDateChange,
  currentUserMemberId,
  bothPanelsOpen,
}: HomeViewProps) {
  const ctx = useScheduleActionsContext()
  const { currentView, setCurrentView } = useHomeView()
  const isMobile = useMobile()
  const { currentAction, pushAction, executeUndo, dismiss } = useUndo()
  const { currentDomain } = useDomain()

  // Filter tasks, routines, projects, and events by current domain
  // Specific domains show ONLY matching items — untagged items stay in universal
  // For work/personal: hide tasks assigned to someone else (they're not yours)
  const filteredTasks = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return tasks.filter(task => {
      // Hide other members' work/personal tasks (private domains) in ALL views
      if (currentUserMemberId && (task.context === 'work' || task.context === 'personal')) {
        const assignee = task.assignedTo || (task.assignedToAll?.[0])
        if (assignee && assignee !== currentUserMemberId) return false
      }
      // Universal shows everything that passes the privacy filter above
      if (currentDomain === 'universal') return true

      // Always show overdue tasks regardless of domain — they need attention
      if (task.scheduledFor && !task.completed) {
        const taskDate = new Date(task.scheduledFor)
        taskDate.setHours(0, 0, 0, 0)
        if (taskDate < today) return true
      }

      // Always show inbox tasks regardless of domain — they need triage
      if (task.bucket === 'inbox' && !task.completed) return true

      // Specific domains show ONLY matching items
      return task.context === currentDomain
    })
  }, [tasks, currentDomain, currentUserMemberId])

  const filteredRoutines = useMemo(() => {
    if (currentDomain === 'universal') return routines
    return routines.filter(routine => routine.context === currentDomain)
  }, [routines, currentDomain])

  const filteredProjects = useMemo(() => {
    if (currentDomain === 'universal') return projects
    return projects.filter(project => project.context === currentDomain)
  }, [projects, currentDomain])

  // Calendar events (including meal-plan entries synthesized in App.tsx) flow
  // through unfiltered — domain filtering applies to tasks/routines/projects only.
  const filteredEvents = events

  // Assignee filter state
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])

  const showRiverView = useMemo(() => {
    const realMemberCount = selectedAssignees.filter(id => id !== 'unassigned').length
    return realMemberCount >= 2
  }, [selectedAssignees])

  const handleViewChange = useCallback((view: typeof currentView) => {
    setSelectedAssignees([])
    setCurrentView(view)
  }, [setCurrentView])

  const selectedAssigneeForSchedule = useMemo(() => {
    if (selectedAssignees.length === 0) return null
    if (selectedAssignees.length === 1) return selectedAssignees[0]
    return null
  }, [selectedAssignees])

  // Bulk update handler for inbox triage
  const handleUpdateTasksBulk = useCallback(async (taskIds: string[], updates: Partial<Task>) => {
    if (!ctx.onUpdateTask) return
    for (const taskId of taskIds) {
      ctx.onUpdateTask(taskId, updates)
    }
  }, [ctx.onUpdateTask])

  // Check for unassigned tasks/events/routines
  const hasUnassignedTasks = useMemo(() => {
    for (const task of filteredTasks) {
      if (!task.completed && !task.assignedTo && (!task.assignedToAll || task.assignedToAll.length === 0)) {
        return true
      }
    }
    for (const event of filteredEvents) {
      const eventId = event.google_event_id || event.id
      const eventNote = ctx.eventNotesMap?.get(eventId)
      if (!eventNote?.assignedTo && (!eventNote?.assignedToAll || eventNote.assignedToAll.length === 0)) {
        return true
      }
    }
    for (const routine of filteredRoutines) {
      if (!routine.assigned_to && (!routine.assigned_to_all || routine.assigned_to_all.length === 0)) {
        return true
      }
    }
    return false
  }, [filteredTasks, filteredEvents, filteredRoutines, ctx.eventNotesMap])

  // Week view state
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date()
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(today)
    monday.setDate(diff)
    monday.setHours(0, 0, 0, 0)
    return monday
  })

  const [monthStart, setMonthStart] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })

  const handleSelectDay = (date: Date) => {
    onDateChange(date)
    setCurrentView('today')
  }

  // Wrap callbacks with undo functionality
  const handleToggleTaskWithUndo = useCallback((taskId: string) => {
    const task = filteredTasks.find(t => t.id === taskId)
    if (!task) return
    const wasCompleted = task.completed
    ctx.onToggleTask(taskId)
    pushAction(
      wasCompleted ? 'Task marked incomplete' : 'Task completed',
      () => ctx.onToggleTask(taskId)
    )
  }, [filteredTasks, ctx.onToggleTask, pushAction])

  const handleDeleteTaskWithUndo = useCallback((taskId: string) => {
    if (!ctx.onDeleteTask) return
    const task = filteredTasks.find(t => t.id === taskId)
    if (!task) return
    ctx.onDeleteTask(taskId)
    pushAction(`Deleted "${task.title}"`, () => {})
  }, [filteredTasks, ctx.onDeleteTask, pushAction])

  const handleCompleteRoutineWithUndo = useCallback((routineId: string, completed: boolean) => {
    if (!ctx.onCompleteRoutine) return
    ctx.onCompleteRoutine(routineId, completed)
    pushAction(
      completed ? 'Routine completed' : 'Routine marked incomplete',
      () => ctx.onCompleteRoutine!(routineId, !completed)
    )
  }, [ctx.onCompleteRoutine, pushAction])

  const handleCompleteEventWithUndo = useCallback((eventId: string, completed: boolean) => {
    if (!ctx.onCompleteEvent) return
    ctx.onCompleteEvent(eventId, completed)
    pushAction(
      completed ? 'Event completed' : 'Event marked incomplete',
      () => ctx.onCompleteEvent!(eventId, !completed)
    )
  }, [ctx.onCompleteEvent, pushAction])

  const renderContent = () => {
    if (currentView === 'month') {
      return (
        <MonthView
          tasks={filteredTasks}
          events={filteredEvents}
          routines={filteredRoutines}
          dateInstances={dateInstances}
          monthStart={monthStart}
          onMonthChange={setMonthStart}
          onSelectDay={handleSelectDay}
          selectedAssignee={selectedAssigneeForSchedule}
          eventNotesMap={ctx.eventNotesMap}
        />
      )
    }

    if (currentView === 'workweek' || currentView === 'week') {
      // TODO(Task 5): Separate workweek rendering (5-day grid) from week (7-day grid)
      const useV2 = isWeekV2Enabled()
      if (!useV2) {
        return (
          <WeekView
            tasks={filteredTasks}
            events={filteredEvents}
            routines={filteredRoutines}
            dateInstances={dateInstances}
            weekStart={weekStart}
            onWeekChange={setWeekStart}
            onSelectDay={handleSelectDay}
            selectedAssignee={selectedAssigneeForSchedule}
            eventNotesMap={ctx.eventNotesMap}
          />
        )
      }
      return (
        <>
          <WeekViewV2
            tasks={filteredTasks}
            events={filteredEvents}
            routines={filteredRoutines}
            dateInstances={dateInstances}
            weekStart={weekStart}
            onWeekChange={setWeekStart}
            selectedAssignee={selectedAssigneeForSchedule}
            onSelectItem={onSelectItem}
            onUpdateTask={ctx.onUpdateTask ?? (() => {})}
            onUpdateRoutine={ctx.onUpdateRoutine ?? (() => {})}
            // TODO: ScheduleActionsContext has no generic onUpdateEvent — only
            // onUpdateEventContext (sets context tag) and onUpdateEventProject.
            // Drag-to-reschedule on events will be a no-op until a full
            // onUpdateEvent is added to the context and wired to the Google
            // Calendar mutation hook.
            onUpdateEvent={() => {}}
          />
          <WeekViewMobile
            tasks={filteredTasks}
            events={filteredEvents}
            routines={filteredRoutines}
            weekStart={weekStart}
            onSelectItem={onSelectItem}
          />
        </>
      )
    }

    if (showRiverView) {
      return (
        <CascadingRiverView
          tasks={filteredTasks}
          events={filteredEvents}
          routines={filteredRoutines}
          dateInstances={dateInstances}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
          onToggleTask={handleToggleTaskWithUndo}
          onToggleWaiting={ctx.onToggleWaiting}
          onUpdateTask={ctx.onUpdateTask}
          onPushTask={ctx.onPushTask}
          onDeleteTask={handleDeleteTaskWithUndo}
          viewedDate={viewedDate}
          onDateChange={onDateChange}
          contactsMap={ctx.contactsMap}
          projectsMap={ctx.projectsMap}
          eventNotesMap={ctx.eventNotesMap}
          familyMembers={ctx.familyMembers}
          selectedAssignees={selectedAssignees}
          onAssignTask={ctx.onAssignTask}
          onAssignEvent={ctx.onAssignEvent}
          onAssignRoutine={ctx.onAssignRoutine}
          onCompleteRoutine={handleCompleteRoutineWithUndo}
          onSkipRoutine={ctx.onSkipRoutine}
          onPushRoutine={ctx.onPushRoutine}
          onCompleteEvent={handleCompleteEventWithUndo}
          onSkipEvent={ctx.onSkipEvent}
          onPushEvent={ctx.onPushEvent}
        />
      )
    }

    // Today view uses TodayView — it reads most props from context
    return (
      <TodayView
        tasks={filteredTasks}
        events={filteredEvents}
        routines={filteredRoutines}
        dateInstances={dateInstances}
        selectedItemId={selectedItemId}
        onSelectItem={onSelectItem}
        onToggleTask={handleToggleTaskWithUndo}
        onCompleteRoutine={handleCompleteRoutineWithUndo}
        onCompleteEvent={handleCompleteEventWithUndo}
        loading={loading}
        viewedDate={viewedDate}
        onDateChange={onDateChange}
        projects={filteredProjects}
        selectedAssignee={selectedAssigneeForSchedule}
        onSelectAssignee={(id) => setSelectedAssignees(id ? [id] : [])}
        assigneesWithTasks={ctx.familyMembers}
        hasUnassignedTasks={hasUnassignedTasks}
        panelOpen={selectedItemId !== null}
        bothPanelsOpen={bothPanelsOpen}
        onClosePanel={() => onSelectItem(null)}
        onUpdateTasksBulk={handleUpdateTasksBulk}
        currentHomeView={currentView}
        onHomeViewChange={handleViewChange}
      />
    )
  }

  // Subtle domain background tint
  const DOMAIN_BG: Record<Domain, string> = {
    universal: '',
    work: 'bg-blue-50/20',
    family: 'bg-amber-50/20',
    personal: 'bg-purple-50/20',
  }

  return (
    <div className={`relative flex flex-col h-full transition-colors duration-500 ${DOMAIN_BG[currentDomain]}`}>
      {/* Today renders its own DomainSwitcher inside TodayHeader (left of D/W/M) */}
      {!isMobile && currentView !== 'today' && (
        <div className="absolute top-4 right-6 z-20 flex items-center gap-3">
          <DomainSwitcher />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {renderContent()}
      </div>

      <UndoToast
        action={currentAction}
        onUndo={executeUndo}
        onDismiss={dismiss}
      />
    </div>
  )
}
