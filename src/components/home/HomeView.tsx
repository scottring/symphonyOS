import { keepsWeekView } from '@/lib/week/keepsWeekView'
import { weekStartParam } from '@/lib/week/weekStartParam'
import { useLocation, useSearchParams } from 'react-router-dom'
import { presetRange, weekRange, weekRangeFromStartParam } from '@/lib/planning/dateRange'
import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useCadenceConfig, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { HomeChromeControls } from './HomeChromeControls'
import type { HomeViewType } from '@/types/homeView'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { filterEventsForLayers, filterRoutinesForLayers, filterTasksForLayers, filterByLayers } from '@/lib/today/domainFilter'
import { dedupeCalendarEvents } from '@/lib/calendar/dedupeEvents'
import { domainById } from '@/lib/domains'
import { useHomeView } from '@/hooks/useHomeView'
import { useMobile } from '@/hooks/useMobile'
import { useUndo } from '@/hooks/useUndo'
import { useDomain } from '@/hooks/useDomain'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { WeekView } from './WeekView'
import { WeekViewV2, type WeekMode } from './week/WeekViewV2'
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
import { findTaskById } from '@/lib/findTaskById'
import { sundayOfWeek } from '@/lib/weekHelpers'
import { CascadingRiverView } from './CascadingRiverView'
import { TodayView } from '@/components/schedule/TodayView'
import { PAGE_GUTTER_X } from '@/components/layout/pageLayout'
import { UndoToast } from '@/components/undo/UndoToast'
import { HomeHeader } from '@/components/home/HomeHeader'
import { CalendarReconnectBanner } from '@/components/home/CalendarReconnectBanner'

interface HomeViewProps {
  tasks: Task[]
  /** Whose day this is — focus (task_focus) is per person. */
  userId?: string | null
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
  /** Pin this mount to one sub-view, ignoring useHomeView. The Week bench
   *  (`/week`) mounts HomeView with fixedView="week" — its own route, not a
   *  switcher state (the D/W/M switcher died with the analog-planning pivot). */
  fixedView?: HomeViewType
  /**
   * Register an undo with the HOST's stack instead of this component's own.
   *
   * Both this component and `HomeViewContainer` own a `useUndo()` and both
   * used to render an `UndoToast`, so a single routine completion — which the
   * container's ScheduleActions already registers — pushed to two independent
   * stacks and raised TWO Undo notifications (S3-12, seen live 2026-09-24).
   * Given this, the second stack goes unused and no second toast is drawn;
   * a double push then lands in one stack, where the later one replaces the
   * earlier, which is one notification.
   */
  registerUndo?: (message: string, undo: () => void) => void
  /** Today's planning reminder, drawn below its schedule (2026-09-22). */
  todayAfterSchedule?: ReactNode
}

export function HomeView({
  tasks,
  userId,
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
  fixedView,
  registerUndo,
  todayAfterSchedule,
}: HomeViewProps) {
  const ctx = useScheduleActionsContext()
  const { currentView: hookView, setCurrentView } = useHomeView()
  const currentView = fixedView ?? hookView
  const isMobile = useMobile()
  const { currentAction, pushAction: ownPushAction, executeUndo, dismiss } = useUndo()
  const pushAction = registerUndo ?? ownPushAction
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
  // dedupe FIRST, then filter by layer: the same meeting synced to two
  // calendars arrives twice, and every surface fed by `filteredEvents`
  // (Today, This Week, Month, the river) would otherwise have to remember to
  // collapse it. computeTodayData did remember, which is why the duplicates
  // stayed invisible until /week rendered the same data without it and showed
  // every school day and every dinner twice in overlapping lanes.
  const filteredEvents = useMemo(
    () => filterEventsForLayers(dedupeCalendarEvents(events), layers, {
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
  // The lens is shared with the Today pin (useAssigneeFilter), so both narrow
  // rows and counts identically.
  const [selectedAssignees, setSelectedAssignees] = useAssigneeFilter()

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

  // Week view state. Anchored to the user's "Week starts on" (Settings →
  // Planning Rhythm), which every other week reader already honours through
  // weekStartAnchor — the grid was the one place still hardcoded to Monday
  // (since 2026-02), so a Sunday setting silently did nothing here while the
  // task buckets it placed into moved.
  const { config: cadenceConfig } = useCadenceConfig()
  const weekStartsOn = cadenceConfig.weekStartsOn
  const [weekStart, setWeekStart] = useState(() => weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn))
  // How many days /week draws from weekStart. 7 is the week; the masthead's
  // presets and custom start/end set fewer. A range is a VIEW, never a bucket
  // — it changes what is drawn and writes nothing (Scott, 2026-09-06: the
  // time-block overlay's range picker moved here and the overlay went).
  const location = useLocation()
  const [, setSearchParams] = useSearchParams()
  const rangePreset = new URLSearchParams(location.search).get('range')
  const startParam = new URLSearchParams(location.search).get('start')
  const [rangeDays, setRangeDays] = useState(7)
  // Journal (the paper week) or Schedule (the hourly grid). Always opens as
  // the journal; switching is presentation only — same dates, same data.
  const [weekMode, setWeekMode] = useState<WeekMode>('journal')
  const onRangeChange = useCallback((range: Date[]) => {
    setWeekStart(range[0])
    setRangeDays(range.length)
    onDateChange(range[0])
  }, [onDateChange])

  // Set by goToWeek: the week it just wrote into the URL is already on screen,
  // so re-deriving the range from it would only undo the range length and the
  // Schedule/Journal choice the reader made.
  const selfWeekNav = useRef(false)
  /**
   * Page the week — and put it in the URL (S2-25).
   *
   * `weekStart` lived only in this component's state, so the week you paged to
   * existed nowhere durable: reload, or open a task and come back, and /week
   * re-derived the week from `new Date()` and returned you to this one
   * ("Assign a week, reload Week → Week reloads to September"). `?start=` is
   * already READ on arrival, so writing it makes reload, Back and Forward all
   * land where you were — the same contract `/month` got in S2-16.
   *
   * Only for the seven-day week: a weekend or a custom run has no round-trip
   * in the URL (`?range=custom` cannot carry its dates), so writing `start`
   * alone would reopen it as a full week. Those keep today's behaviour.
   */
  const goToWeek = useCallback((weekAnchor: Date, viewed: Date = weekAnchor) => {
    setWeekStart(weekAnchor)
    onDateChange(viewed)
    const next = weekStartParam(fixedView, rangeDays, location.search, weekAnchor)
    if (!next) return
    selfWeekNav.current = true
    setSearchParams(next, { replace: false })
  }, [onDateChange, fixedView, rangeDays, location.search, setSearchParams])

  const onDateChangeRef = useRef(onDateChange)
  const viewedDateRef = useRef(viewedDate)
  useEffect(() => {
    onDateChangeRef.current = onDateChange
    viewedDateRef.current = viewedDate
  })
  // Arriving at /week — from the navigation's Week menu or anywhere else —
  // opens the seven-day week unless the link names a shorter run
  // (?range=weekend | three) or a specific week (?start=YYYY-MM-DD, from a
  // planning nudge naming a week that isn't the current one). Keyed on the
  // navigation itself, so choosing "Weekend" twice, or "Open week page"
  // after a weekend, re-applies.
  const previousWeekLocation = useRef<{ pathname: string; search: string } | null>(null)
  useEffect(() => {
    const keepView = keepsWeekView(previousWeekLocation.current, location)
    previousWeekLocation.current = { pathname: location.pathname, search: location.search }
    if (selfWeekNav.current) { selfWeekNav.current = false; return }
    if (fixedView !== 'week' || keepView) return
    const range = weekRangeFromStartParam(startParam, readCadenceConfig().weekStartsOn)
      ?? (rangePreset === 'weekend' || rangePreset === 'three'
        ? presetRange(rangePreset, new Date())
        : weekRange(new Date(), readCadenceConfig().weekStartsOn))
    setWeekStart(range[0])
    setRangeDays(range.length)
    setWeekMode('journal')
    // The event fetch follows viewedDate (its week and the next); a weekend
    // chosen on a Sunday sits in next week, so move it along when needed.
    if (sundayOfWeek(viewedDateRef.current).getTime() !== sundayOfWeek(range[0]).getTime()) {
      onDateChangeRef.current(range[0])
    }
  }, [fixedView, rangePreset, startParam, location.key, location.pathname, location.search])

  // Changing the setting re-anchors the week on screen. Without this the view
  // keeps whatever the initial state captured until a remount, so the setting
  // appears not to work at the exact moment you change it. Only on a real
  // CHANGE: on mount it would re-anchor a weekend back to the week's start.
  const prevWeekStartsOn = useRef(weekStartsOn)
  useEffect(() => {
    if (prevWeekStartsOn.current === weekStartsOn) return
    prevWeekStartsOn.current = weekStartsOn
    setWeekStart((prev) => weekStartAnchor(prev, weekStartsOn))
    setRangeDays(7)
  }, [weekStartsOn])

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
    // them up there returned undefined and mislabeled the toast. And through
    // the shared nested lookup, not a flat `.find` — per-person items are
    // SUBTASKS, so a flat scan missed them exactly the same way, and `toggleTask`
    // (which this has to agree with) has always walked the nesting.
    const task = findTaskById(tasks, taskId)
    const wasCompleted = task?.completed ?? false
    const result = ctx.onToggleTask(taskId)
    // Undo sets the EXPLICIT prior state via updateTask — it must NOT call
    // onToggleTask again. `toggleTask` derives the next value from a snapshot of
    // `tasks` captured when this handler was built (still showing the task as
    // incomplete), so a second toggle would re-complete it instead of reverting
    // — the "undo does nothing" bug. Writing `completed` explicitly is immune to
    // that stale closure.
    // Only once it saved: a failed write has already rolled the row back and
    // said so, and "Task completed · Undo" beside that would be a false claim.
    void Promise.resolve(result).then((ok) => {
      if (ok === false) return
      pushAction(
        wasCompleted ? 'Task marked incomplete' : 'Task completed',
        () => ctx.onUpdateTask?.(taskId, { completed: wasCompleted })
      )
    })
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
            onWeekChange={(d) => goToWeek(sundayOfWeek(d), d)}
            selectedAssignee={selectedAssigneeForSchedule}
            selectedAssignees={selectedAssignees}
            layers={layers}
            onSelectItem={onSelectItem}
            onUpdateTask={ctx.onUpdateTask ?? (() => {})}
            onUpdateRoutine={ctx.onUpdateRoutine ?? (() => {})}
            onUpdateEvent={ctx.onUpdateEvent ?? (() => {})}
            onPushRoutine={ctx.onPushRoutine}
            pushAction={pushAction}
            mode={weekMode}
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
            onWeekChange={(d) => goToWeek(d)}
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
            dayCount={rangeDays}
            // A range start is wherever the range starts: stepping moves the
            // run by its own length, so a weekend stays a weekend and a
            // custom Thu–Wed week stays Thu–Wed.
            onWeekChange={(d) => goToWeek(d)}
            selectedAssignee={selectedAssigneeForSchedule}
            selectedAssignees={selectedAssignees}
            layers={layers}
            onSelectItem={onSelectItem}
            onUpdateTask={ctx.onUpdateTask ?? (() => {})}
            onUpdateRoutine={ctx.onUpdateRoutine ?? (() => {})}
            onUpdateEvent={ctx.onUpdateEvent ?? (() => {})}
            onPushRoutine={ctx.onPushRoutine}
            pushAction={pushAction}
            mode={weekMode}
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
        headerControls={<HomeChromeControls className="flex" />}
        afterSchedule={todayAfterSchedule}
        tasks={filteredTasks}
        userId={userId}
        allRoutines={allActiveRoutines}
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
      {/* Week keeps its masthead on a phone too: it is the only way to step
          to another week or pick a shorter run there. */}
      {(!isMobile || currentView === 'week') && currentView !== 'today' && (
        <div className={`${PAGE_GUTTER_X} pt-4`}>
          <HomeHeader
            currentView={currentView}
            onViewChange={handleViewChange}
            viewedDate={viewedDate}
            onDateChange={onDateChange}
            weekStart={weekStart}
            // Week nav must carry `viewedDate` along with the grid: the
            // container fetches events for the week containing viewedDate,
            // so a week viewedDate isn't in would render without its events.
            onWeekChange={(d) => goToWeek(d)}
            rangeDays={rangeDays}
            customRangeRequest={rangePreset === 'custom' ? location.key : undefined}
            weekMode={currentView === 'week' || currentView === 'workweek' ? weekMode : undefined}
            onWeekModeChange={setWeekMode}
            onRangeChange={onRangeChange}
            monthStart={monthStart}
            onMonthChange={setMonthStart}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Today draws its own masthead inside the day card, and HomeHeader
            returns null for it — the padded wrapper that used to mount it
            here was an empty band above the date (2026-09-22). */}
        {/* Surfaces an expired/revoked calendar connection so the empty event
            state isn't silent. Wrapper collapses (empty:hidden) when the banner
            renders null, so it adds no padding while connected. */}
        <div className={`${PAGE_GUTTER_X} pt-4 empty:hidden`}>
          <CalendarReconnectBanner />
        </div>
        {currentView === 'today' || showRiverView
          ? renderContent()
          : (
            // Week/month/workweek draw no column of their own — they used to
            // start flush against the content edge, 56px left of their own
            // masthead card. One gutter, one left edge (Scott, 2026-09-07).
            <div className={PAGE_GUTTER_X}>{renderContent()}</div>
          )}
      </div>

      {/* Only when nobody above is showing one. Two mounted at once is how a
          single completion produced two Undo notifications. */}
      {!registerUndo && (
        <UndoToast
          action={currentAction}
          onUndo={executeUndo}
          onDismiss={dismiss}
        />
      )}
    </div>
  )
}
