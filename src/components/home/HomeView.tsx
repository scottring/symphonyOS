import { useState, useMemo, useCallback } from 'react'
import type { HomeViewType } from '@/types/homeView'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { filterEventsForLayers, filterRoutinesForLayers, filterTasksForLayers, filterByLayers } from '@/lib/today/domainFilter'
import { domainById } from '@/lib/domains'
import { useHomeView } from '@/hooks/useHomeView'
import { useMobile } from '@/hooks/useMobile'
import { useUndo } from '@/hooks/useUndo'
import { useDomain } from '@/hooks/useDomain'
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
import { CalendarReconnectBanner } from '@/components/home/CalendarReconnectBanner'

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
  bothPanelsOpen?: boolean
  /** Opens the plan-from-paper flow (photo of a written plan → placed tasks). */
  onOpenPlanFromPaper?: () => void
  /** Pin this mount to one sub-view, ignoring useHomeView. The Week bench
   *  (`/week`) mounts HomeView with fixedView="week" — its own route, not a
   *  switcher state (the D/W/M switcher died with the analog-planning pivot). */
  fixedView?: HomeViewType
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
  bothPanelsOpen,
  onOpenPlanFromPaper,
  fixedView,
}: HomeViewProps) {
  const ctx = useScheduleActionsContext()
  const { currentView: hookView, setCurrentView } = useHomeView()
  const currentView = fixedView ?? hookView
  const isMobile = useMobile()
  const { currentAction, pushAction, executeUndo, dismiss } = useUndo()
  const { layers, soleDomain } = useDomain()

  // Filter tasks, routines, projects, and events by the checked layer set.
  // Task scoping lives in filterTasksForLayers (shared with the Time-block
  // grid, which is launched from this page and must show the same day): an
  // item shows iff the layer its context maps to is checked — untagged items
  // are the Unsorted layer, not "everywhere". Life area only — never who
  // owns or is assigned the item; that is the assignee filter's job.
  const filteredTasks = useMemo(
    () => filterTasksForLayers(tasks, layers),
    [tasks, layers])

  // Neither TodayView nor CascadingRiverView consumes this for visibility any
  // more — both apply layer scoping themselves via resolveRoutine (rung 4)
  // against the raw `routines` prop. This memo survives only to feed
  // `hasUnassignedTasks` below, which wants the checked layers' routines.
  const filteredRoutines = useMemo(
    () => filterRoutinesForLayers(routines, layers),
    [routines, layers])

  const filteredProjects = useMemo(() => filterByLayers(projects, layers), [projects, layers])

  // Calendar events are layer-filtered like tasks. An event's context is
  // resolved (manual override → calendar→domain mapping → Unsorted). The
  // checked layers show their own events; an unmapped calendar sits in
  // Unsorted until mapped. This stops e.g. work-calendar events leaking into
  // the Family/Personal views.
  const filteredEvents = useMemo(
    () => filterEventsForLayers(events, layers, {
      eventContextOverrides: ctx.eventContextOverrides,
      getDomainForCalendar: ctx.getDomainForCalendar,
      eventNotesMap: ctx.eventNotesMap,
    }),
    [events, layers, ctx.eventContextOverrides, ctx.getDomainForCalendar, ctx.eventNotesMap])

  // Assignee filter state — persisted, and defaulting to EVERYONE.
  //
  // This used to seed `[currentUserMemberId]` on a first-ever load. Two people
  // in one household therefore opened the same day and saw two different
  // agendas: a family routine assigned to Ella was simply absent from Scott's
  // Today, from a row he could already fetch. Worse, `makeAssigneeFilter(['me'])`
  // returns false for an UNASSIGNED item (only the pseudo-id 'unassigned'
  // matches those), so the default also swallowed every unclaimed household
  // task and routine — the ones most likely to be dropped.
  //
  // The household's day is the default view; narrowing to one person is a lens
  // you reach for. The key is rotated to -v2 so the browsers that already
  // stored a self-filter under the old key adopt the new default once; an
  // explicit choice made after that is stored and wins.
  const ASSIGNEE_FILTER_KEY = 'symphony-assignee-filter-v2'
  const [selectedAssignees, setSelectedAssigneesState] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem(ASSIGNEE_FILTER_KEY)
      if (raw !== null) return JSON.parse(raw) as string[]
    } catch { /* ignore */ }
    return []
  })
  const setSelectedAssignees = useCallback((next: string[]) => {
    setSelectedAssigneesState(next)
    try { window.localStorage.setItem(ASSIGNEE_FILTER_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }, [])

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
    // Read the prior state from the FULL task list, not `filteredTasks`:
    // carried-over / overdue items are excluded from the today list, so looking
    // them up there returned undefined and mislabeled the toast.
    const task = tasks.find(t => t.id === taskId)
    const wasCompleted = task?.completed ?? false
    ctx.onToggleTask(taskId)
    // Undo sets the EXPLICIT prior state via updateTask — it must NOT call
    // onToggleTask again. `toggleTask` derives the next value from a snapshot of
    // `tasks` captured when this handler was built (still showing the task as
    // incomplete), so a second toggle would re-complete it instead of reverting
    // — the "undo does nothing" bug. Writing `completed` explicitly is immune to
    // that stale closure.
    pushAction(
      wasCompleted ? 'Task marked incomplete' : 'Task completed',
      () => ctx.onUpdateTask?.(taskId, { completed: wasCompleted })
    )
  }, [tasks, ctx.onToggleTask, ctx.onUpdateTask, pushAction])

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
          routines={allActiveRoutines}
          dateInstances={dateInstances}
          monthStart={monthStart}
          onMonthChange={setMonthStart}
          onSelectDay={handleSelectDay}
          selectedAssignee={selectedAssigneeForSchedule}
          layers={layers}
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
            routines={allActiveRoutines}
            dateInstances={dateInstances}
            weekStart={mondayStart}
            dayCount={5}
            onWeekChange={(d) => setWeekStart(sundayOfWeek(d))}
            selectedAssignee={selectedAssigneeForSchedule}
            selectedAssignees={selectedAssignees}
            layers={layers}
            onSelectItem={onSelectItem}
            onUpdateTask={ctx.onUpdateTask ?? (() => {})}
            onUpdateRoutine={ctx.onUpdateRoutine ?? (() => {})}
            onUpdateEvent={ctx.onUpdateEvent ?? (() => {})}
            pushAction={pushAction}
          />
          <WeekViewMobile
            tasks={filteredTasks}
            events={filteredEvents}
            routines={allActiveRoutines}
            weekStart={mondayStart}
            dayCount={5}
            selectedAssignees={selectedAssignees}
            layers={layers}
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
            routines={allActiveRoutines}
            dateInstances={dateInstances}
            weekStart={weekStart}
            onWeekChange={setWeekStart}
            onSelectDay={handleSelectDay}
            selectedAssignee={selectedAssigneeForSchedule}
            layers={layers}
            eventNotesMap={ctx.eventNotesMap}
          />
        )
      }
      return (
        <>
          <WeekViewV2
            tasks={filteredTasks}
            events={filteredEvents}
            routines={allActiveRoutines}
            dateInstances={dateInstances}
            weekStart={weekStart}
            onWeekChange={(d) => setWeekStart(sundayOfWeek(d))}
            selectedAssignee={selectedAssigneeForSchedule}
            selectedAssignees={selectedAssignees}
            layers={layers}
            onSelectItem={onSelectItem}
            onUpdateTask={ctx.onUpdateTask ?? (() => {})}
            onUpdateRoutine={ctx.onUpdateRoutine ?? (() => {})}
            onUpdateEvent={ctx.onUpdateEvent ?? (() => {})}
            pushAction={pushAction}
          />
          <WeekViewMobile
            tasks={filteredTasks}
            events={filteredEvents}
            routines={allActiveRoutines}
            weekStart={weekStart}
            selectedAssignees={selectedAssignees}
            layers={layers}
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
          // Domain-UNfiltered on purpose, same reasoning as TodayView below:
          // the river now applies layer scoping itself via resolveRoutine
          // (rung 4), reading `layers` from useDomain() itself. Passing the
          // shared `filteredRoutines` memo here would double-filter (harmless,
          // since both predicates agree) but re-couples this surface to a memo
          // it no longer needs — pass the raw list so River owns its own rung 4.
          routines={routines}
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
          layers={layers}
          familyMembers={ctx.familyMembers}
          selectedAssignees={selectedAssignees}
          onSelectAssignees={setSelectedAssignees}
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
        // Domain-UNfiltered on purpose: TodayView's own pipeline applies
        // layer scoping via resolveRoutine (rung 4), reading `layers` from
        // useDomain() itself. CascadingRiverView (above) now does the
        // same, so `filteredRoutines` below is no longer shared for routine
        // visibility by either surface — it survives only to compute
        // `hasUnassignedTasks`.
        routines={routines}
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
        selectedAssignees={selectedAssignees}
        onSelectAssignees={setSelectedAssignees}
        assigneesWithTasks={ctx.familyMembers}
        hasUnassignedTasks={hasUnassignedTasks}
        panelOpen={selectedItemId !== null}
        bothPanelsOpen={bothPanelsOpen}
        onClosePanel={() => onSelectItem(null)}
        onOpenPlanFromPaper={onOpenPlanFromPaper}
        onUpdateTasksBulk={handleUpdateTasksBulk}
        currentHomeView={currentView}
        onHomeViewChange={handleViewChange}
      />
    )
  }

  // Subtle domain background tint — only when exactly one real domain is checked.
  const tint = soleDomain ? domainById(soleDomain).bgClass : ''

  return (
    <div className={`relative flex flex-col h-full transition-colors duration-500 ${tint}`}>
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
              />
          </div>
        )}
        {/* Surfaces an expired/revoked calendar connection so the empty event
            state isn't silent. Wrapper collapses (empty:hidden) when the banner
            renders null, so it adds no padding while connected. */}
        <div className="px-6 pt-4 empty:hidden">
          <CalendarReconnectBanner />
        </div>
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
