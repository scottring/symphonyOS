import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { resolveEventContext } from '@/lib/today/eventContext'
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
import { mondayOfWeek } from '@/lib/workweekHelpers'
import { sundayOfWeek } from '@/lib/weekHelpers'
import { CascadingRiverView } from './CascadingRiverView'
import { TodayView } from '@/components/schedule/TodayView'
import { UndoToast } from '@/components/undo/UndoToast'
import { HomeHeader } from '@/components/home/HomeHeader'

interface HomeViewProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  allActiveRoutines: Routine[]
  projects: Project[]
  dateInstances: ActionableInstance[]
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  loading?: boolean
  viewedDate: Date
  onDateChange: (date: Date) => void
  currentUserMemberId?: string
  bothPanelsOpen?: boolean
  onOpenWeeklyPlanning?: () => void
}

export function HomeView({
  tasks,
  events,
  routines,
  allActiveRoutines,
  projects,
  dateInstances,
  selectedItemId,
  onSelectItem,
  loading,
  viewedDate,
  onDateChange,
  currentUserMemberId,
  bothPanelsOpen,
  onOpenWeeklyPlanning,
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
    return tasks.filter(task => {
      // Hide other members' work/personal tasks (private domains) in ALL views.
      // A private task is visible to anyone it's assigned to, so check membership
      // in the full assignee set — not just the first entry. (The old code used
      // assignedToAll?.[0], which hid a shared private task from everyone but the
      // first assignee.)
      if (currentUserMemberId && (task.context === 'work' || task.context === 'personal')) {
        const assignees = task.assignedToAll && task.assignedToAll.length > 0
          ? task.assignedToAll
          : (task.assignedTo ? [task.assignedTo] : [])
        if (assignees.length > 0 && !assignees.includes(currentUserMemberId)) return false
      }
      // Universal shows everything that passes the privacy filter above
      if (currentDomain === 'universal') return true

      // A specific domain isolates to its OWN items plus UNTAGGED tasks.
      // Untagged tasks stay visible in every domain (and get a pulsing tag glow
      // nudging the user to categorize them) so they're never lost — but tagged
      // items from OTHER domains don't leak in. This deliberately replaces the
      // old "always show overdue/inbox regardless of domain" overrides, which
      // leaked e.g. family overdue items into the Work view.
      return task.context === currentDomain || task.context == null
    })
  }, [tasks, currentDomain, currentUserMemberId])

  const filteredRoutines = useMemo(() => {
    if (currentDomain === 'universal') return routines
    return routines.filter(routine => routine.context === currentDomain)
  }, [routines, currentDomain])

  // All active routines, domain-filtered — used by Week/Month which do their
  // own per-day recurrence matching. filteredRoutines is today-filtered and
  // unsuitable for multi-day views.
  const filteredAllActiveRoutines = useMemo(() => {
    if (currentDomain === 'universal') return allActiveRoutines
    return allActiveRoutines.filter(routine => routine.context === currentDomain)
  }, [allActiveRoutines, currentDomain])

  const filteredProjects = useMemo(() => {
    if (currentDomain === 'universal') return projects
    return projects.filter(project => project.context === currentDomain)
  }, [projects, currentDomain])

  // Calendar events are domain-filtered like tasks. An event's context is
  // resolved (manual override → calendar→domain mapping → null). A specific
  // domain shows its own events PLUS untagged ones (calendars with no domain
  // mapping stay visible everywhere until mapped); Universal shows all. This
  // stops e.g. work-calendar events leaking into the Family/Personal views.
  const filteredEvents = useMemo(() => {
    if (currentDomain === 'universal') return events
    return events.filter(event => {
      const resolved = resolveEventContext(event, ctx.eventContextOverrides, ctx.getDomainForCalendar)
      return resolved === currentDomain || resolved == null
    })
  }, [events, currentDomain, ctx.eventContextOverrides, ctx.getDomainForCalendar])

  // Assignee filter state — persisted, and defaulted to the logged-in person
  // ("my tasks") so each member sees their own world first and can tap to
  // "Everyone". Persisting + defaulting means the selection survives view
  // switches and reloads instead of resetting to "everyone" every time.
  const ASSIGNEE_FILTER_KEY = 'symphony-assignee-filter'
  const hadStoredAssigneeRef = useRef(false)
  const [selectedAssignees, setSelectedAssigneesState] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem(ASSIGNEE_FILTER_KEY)
      if (raw !== null) { hadStoredAssigneeRef.current = true; return JSON.parse(raw) as string[] }
    } catch { /* ignore */ }
    return []
  })
  const setSelectedAssignees = useCallback((next: string[]) => {
    setSelectedAssigneesState(next)
    try { window.localStorage.setItem(ASSIGNEE_FILTER_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }, [])

  // First-ever load (no stored preference): default to the current user once we
  // know who they are. An explicit later choice (including "Everyone" → []) is
  // stored and wins on subsequent loads.
  const didDefaultAssigneeRef = useRef(false)
  useEffect(() => {
    if (hadStoredAssigneeRef.current || didDefaultAssigneeRef.current) return
    if (currentUserMemberId) {
      didDefaultAssigneeRef.current = true
      setSelectedAssignees([currentUserMemberId])
    }
  }, [currentUserMemberId, setSelectedAssignees])

  const showRiverView = useMemo(() => {
    const realMemberCount = selectedAssignees.filter(id => id !== 'unassigned').length
    return realMemberCount >= 2
  }, [selectedAssignees])

  // Keep the assignee selection across view switches (don't reset to Everyone).
  const handleViewChange = useCallback((view: typeof currentView) => {
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
          routines={filteredAllActiveRoutines}
          dateInstances={dateInstances}
          monthStart={monthStart}
          onMonthChange={setMonthStart}
          onSelectDay={handleSelectDay}
          selectedAssignee={selectedAssigneeForSchedule}
          eventNotesMap={ctx.eventNotesMap}
        />
      )
    }

    if (currentView === 'workweek') {
      // Workweek anchors weekStart to Monday (vs. Sunday for 7-day week).
      // We compute the displayed start locally so it doesn't permanently
      // shift the underlying weekStart state — switching back to Week keeps
      // the prior Sunday anchor.
      const mondayStart = mondayOfWeek(weekStart)
      return (
        <>
          <WeekViewV2
            tasks={filteredTasks}
            events={filteredEvents}
            routines={filteredAllActiveRoutines}
            dateInstances={dateInstances}
            weekStart={mondayStart}
            dayCount={5}
            onWeekChange={(d) => setWeekStart(sundayOfWeek(d))}
            selectedAssignee={selectedAssigneeForSchedule}
            onSelectItem={onSelectItem}
            onUpdateTask={ctx.onUpdateTask ?? (() => {})}
            onUpdateRoutine={ctx.onUpdateRoutine ?? (() => {})}
            onUpdateEvent={ctx.onUpdateEvent ?? (() => {})}
            pushAction={pushAction}
          />
          <WeekViewMobile
            tasks={filteredTasks}
            events={filteredEvents}
            routines={filteredAllActiveRoutines}
            weekStart={mondayStart}
            dayCount={5}
            onSelectItem={onSelectItem}
          />
        </>
      )
    }

    if (currentView === 'week') {
      const useV2 = isWeekV2Enabled()
      if (!useV2) {
        return (
          <WeekView
            tasks={filteredTasks}
            events={filteredEvents}
            routines={filteredAllActiveRoutines}
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
            routines={filteredAllActiveRoutines}
            dateInstances={dateInstances}
            weekStart={weekStart}
            onWeekChange={(d) => setWeekStart(sundayOfWeek(d))}
            selectedAssignee={selectedAssigneeForSchedule}
            onSelectItem={onSelectItem}
            onUpdateTask={ctx.onUpdateTask ?? (() => {})}
            onUpdateRoutine={ctx.onUpdateRoutine ?? (() => {})}
            onUpdateEvent={ctx.onUpdateEvent ?? (() => {})}
            pushAction={pushAction}
          />
          <WeekViewMobile
            tasks={filteredTasks}
            events={filteredEvents}
            routines={filteredAllActiveRoutines}
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
      {/* Today header is rendered INSIDE the scroll container so it shares
          the exact same max-w/px column as TodayView's content, keeping the
          date label and controls left/right-aligned with the task rows.
          Week/Month headers stay outside the scroll container (full-width). */}
      {!isMobile && currentView !== 'today' && (
        <div className="px-6 pt-4">
          <HomeHeader
            currentView={currentView}
            onViewChange={handleViewChange}
            viewedDate={viewedDate}
            onDateChange={onDateChange}
            weekStart={weekStart}
            onWeekChange={setWeekStart}
            monthStart={monthStart}
            onMonthChange={setMonthStart}
            onOpenWeeklyPlanning={onOpenWeeklyPlanning}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {!isMobile && currentView === 'today' && (
          <div className="max-w-[940px] w-full mx-auto px-0 md:px-8 pt-4">
            <HomeHeader
              currentView={currentView}
              onViewChange={handleViewChange}
              viewedDate={viewedDate}
              onDateChange={onDateChange}
              weekStart={weekStart}
              onWeekChange={setWeekStart}
              monthStart={monthStart}
              onMonthChange={setMonthStart}
              onOpenWeeklyPlanning={onOpenWeeklyPlanning}
            />
          </div>
        )}
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
