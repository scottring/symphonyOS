import { useState, useMemo, useCallback } from 'react'
import type { Task, TaskContext } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { EventNote } from '@/hooks/useEventNotes'
// Daily Brief disabled for now
// import type { DailyBriefActionType } from '@/types/action'
// import { useDailyBrief } from '@/hooks/useDailyBrief'
// import { useUserPreferences } from '@/hooks/useUserPreferences'
// import { DailyBriefModal } from '@/components/brief'
import { useHomeView } from '@/hooks/useHomeView'
import { useMobile } from '@/hooks/useMobile'
import { HomeViewSwitcher } from './HomeViewSwitcher'
import { HomeDashboard } from './HomeDashboard'
import { WeekView } from './WeekView'
import { CascadingRiverView } from './CascadingRiverView'
import { TodaySchedule } from '@/components/schedule/TodaySchedule'

interface HomeViewProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  dateInstances: ActionableInstance[]
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  onToggleTask: (taskId: string) => void
  onUpdateTask?: (id: string, updates: Partial<Task>) => void
  onPushTask?: (id: string, date: Date) => void
  onDeleteTask?: (id: string) => void
  onArchiveTask?: (id: string) => void
  loading?: boolean
  viewedDate: Date
  onDateChange: (date: Date) => void
  contactsMap?: Map<string, Contact>
  projectsMap?: Map<string, Project>
  projects: Project[]
  contacts: Contact[]
  onSearchContacts?: (query: string) => Contact[]
  onAddContact?: (name: string) => Promise<Contact | null>
  eventNotesMap?: Map<string, EventNote>
  onRefreshInstances?: () => void
  recentlyCreatedTaskId?: string | null
  onTriageCardCollapse?: () => void
  onOpenProject?: (projectId: string) => void
  familyMembers: FamilyMember[]
  onAssignTask?: (taskId: string, memberId: string | null) => void
  onAssignTaskAll?: (taskId: string, memberIds: string[]) => void
  onAssignEvent?: (eventId: string, memberId: string | null) => void
  onAssignEventAll?: (eventId: string, memberIds: string[]) => void
  onAssignRoutine?: (routineId: string, memberId: string | null) => void
  onAssignRoutineAll?: (routineId: string, memberIds: string[]) => void
  onCompleteRoutine?: (routineId: string, completed: boolean) => void
  onSkipRoutine?: (routineId: string) => void
  onPushRoutine?: (routineId: string, date: Date) => void
  onCompleteEvent?: (eventId: string, completed: boolean) => void
  onSkipEvent?: (eventId: string) => void
  onPushEvent?: (eventId: string, date: Date) => void
  onOpenPlanning?: () => void
  onCreateTask?: (title: string) => void
  onAddProject?: (project: { name: string }) => Promise<Project | null>
  // Bulk operations
  onBulkComplete?: (taskIds: string[]) => void
  onBulkUncomplete?: (taskIds: string[]) => void
  onBulkDelete?: (taskIds: string[]) => void
  onBulkReschedule?: (taskIds: string[], date: Date, isAllDay: boolean) => void
  // Calendar integration - create events from tasks
  onAddToCalendar?: (task: Task) => Promise<void>
  addingToCalendarTaskId?: string | null
  // Navigation callbacks for HomeDashboard
  onNavigateToContext?: (context: TaskContext) => void
  onNavigateToInbox?: () => void
  onNavigateToProjects?: () => void
}

export function HomeView({
  tasks,
  events,
  routines,
  dateInstances,
  selectedItemId,
  onSelectItem,
  onToggleTask,
  onUpdateTask,
  onPushTask,
  onDeleteTask,
  onArchiveTask,
  loading,
  viewedDate,
  onDateChange,
  contactsMap,
  projectsMap,
  projects,
  contacts,
  onSearchContacts,
  onAddContact,
  eventNotesMap,
  onRefreshInstances,
  recentlyCreatedTaskId,
  onTriageCardCollapse,
  onOpenProject,
  familyMembers,
  onAssignTask,
  onAssignTaskAll,
  onAssignEvent,
  onAssignEventAll,
  onAssignRoutine,
  onAssignRoutineAll,
  onCompleteRoutine,
  onSkipRoutine,
  onPushRoutine,
  onCompleteEvent,
  onSkipEvent,
  onPushEvent,
  onOpenPlanning,
  onCreateTask,
  onAddProject,
  // Bulk operations
  onBulkComplete,
  onBulkUncomplete,
  onBulkDelete,
  onBulkReschedule,
  // Calendar integration
  onAddToCalendar,
  addingToCalendarTaskId,
  // Navigation
  onNavigateToContext,
  onNavigateToInbox,
  onNavigateToProjects,
}: HomeViewProps) {
  const { currentView, setCurrentView } = useHomeView()
  const isMobile = useMobile()
  // const [briefModalOpen, setBriefModalOpen] = useState(false) // Daily Brief disabled

  // Daily Brief handler for task actions - disabled for now
  // const handleBriefTaskAction = useCallback((taskId: string, action: DailyBriefActionType) => {
  //   switch (action) {
  //     case 'complete': onToggleTask(taskId); break
  //     case 'delete': onDeleteTask?.(taskId); break
  //     case 'schedule':
  //       if (onUpdateTask) { const today = new Date(); today.setHours(0, 0, 0, 0); onUpdateTask(taskId, { scheduledFor: today }) }
  //       onSelectItem(taskId); break
  //     case 'defer':
  //       if (onPushTask) { const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7); nextWeek.setHours(0, 0, 0, 0); onPushTask(taskId, nextWeek) }
  //       break
  //     case 'open': case 'follow_up': case 'mark_resolved': case 'snooze': case 'draft_email': case 'send_note':
  //       onSelectItem(taskId); break
  //     default: onSelectItem(taskId)
  //   }
  // }, [onToggleTask, onDeleteTask, onSelectItem, onUpdateTask, onPushTask])

  // Daily Brief - disabled for now
  // const handleBriefProjectAction = useCallback((projectId: string, action: DailyBriefActionType) => {
  //   switch (action) {
  //     case 'open':
  //     default:
  //       onOpenProject?.(projectId)
  //       break
  //   }
  // }, [onOpenProject])
  // const { brief, isLoading: briefLoading, isGenerating: briefGenerating, generateBrief, dismissBrief, handleItemAction } = useDailyBrief(handleBriefTaskAction, handleBriefProjectAction)

  // User preferences - disabled for now (Daily Brief disabled)
  // const { preferences } = useUserPreferences()

  // Daily Brief auto-open - disabled for now
  // useEffect(() => {
  //   if (!preferences.autoShowDailyBrief) return
  //   if (brief && !brief.dismissedAt && currentView === 'today') {
  //     const today = new Date()
  //     const isToday = viewedDate.getFullYear() === today.getFullYear() && viewedDate.getMonth() === today.getMonth() && viewedDate.getDate() === today.getDate()
  //     if (isToday) setBriefModalOpen(true)
  //   }
  // }, [brief, currentView, viewedDate, preferences.autoShowDailyBrief])

  // Daily Brief handlers - disabled for now
  // const handleOpenBrief = useCallback(() => {
  //   if (brief && !brief.dismissedAt) {
  //     setBriefModalOpen(true)
  //   } else {
  //     generateBrief(true)
  //   }
  // }, [brief, generateBrief])
  // const handleCloseBrief = useCallback(() => setBriefModalOpen(false), [])

  // Assignee filter state - now supports multi-select
  // Empty array = "All", single id = single filter, multiple ids = river view
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])

  // Context filter state (work/family/personal)
  const [selectedContext, setSelectedContext] = useState<TaskContext | null>(null)

  // Check if we should show river view (2+ real members selected, not counting 'unassigned')
  const showRiverView = useMemo(() => {
    const realMemberCount = selectedAssignees.filter(id => id !== 'unassigned').length
    return realMemberCount >= 2
  }, [selectedAssignees])

  // Reset filters when view changes
  const handleViewChange = useCallback((view: typeof currentView) => {
    setSelectedAssignees([])
    setSelectedContext(null) // Clear context filter
    setCurrentView(view)
  }, [setCurrentView])

  // Convert multi-select to single-select format for TodaySchedule compatibility
  // When single member selected or 'unassigned', pass that. Otherwise null for 'all'.
  const selectedAssigneeForSchedule = useMemo(() => {
    if (selectedAssignees.length === 0) return null // All
    if (selectedAssignees.length === 1) return selectedAssignees[0] // Single
    return null // Multi-select uses river view, schedule shows all
  }, [selectedAssignees])

  // Filter tasks by context if a context is selected
  const filteredTasks = useMemo(() => {
    if (!selectedContext) return tasks
    return tasks.filter(task => task.context === selectedContext)
  }, [tasks, selectedContext])

  // Get context display info
  const contextInfo = useMemo(() => {
    if (!selectedContext) return null
    const info = {
      work: { label: 'Work', color: 'bg-neutral-900 text-white', icon: '💼' },
      family: { label: 'Family', color: 'bg-accent-400 text-white', icon: '🏠' },
      personal: { label: 'Personal', color: 'bg-primary-500 text-white', icon: '👤' },
    }
    return info[selectedContext]
  }, [selectedContext])

  // Check if there are any unassigned tasks/events/routines for the filter dropdown
  const hasUnassignedTasks = useMemo(() => {
    // Check tasks
    for (const task of tasks) {
      if (!task.completed && !task.assignedTo && (!task.assignedToAll || task.assignedToAll.length === 0)) {
        return true
      }
    }

    // Check events
    for (const event of events) {
      const eventId = event.google_event_id || event.id
      const eventNote = eventNotesMap?.get(eventId)
      if (!eventNote?.assignedTo && (!eventNote?.assignedToAll || eventNote.assignedToAll.length === 0)) {
        return true
      }
    }

    // Check routines
    for (const routine of routines) {
      if (!routine.assigned_to && (!routine.assigned_to_all || routine.assigned_to_all.length === 0)) {
        return true
      }
    }

    return false
  }, [tasks, events, routines, eventNotesMap])

  // Week view state
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date()
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1) // Monday start
    const monday = new Date(today)
    monday.setDate(diff)
    monday.setHours(0, 0, 0, 0)
    return monday
  })

  // Handle day selection from week view
  const handleSelectDay = (date: Date) => {
    onDateChange(date)
    setCurrentView('today')
  }

  // Navigation handlers for dashboard
  const handleNavigateToSchedule = useCallback(() => {
    onDateChange(new Date())
    setCurrentView('today')
  }, [onDateChange, setCurrentView])

  const handleNavigateToContext = useCallback((context: TaskContext) => {
    // Set context filter and switch to today view
    setSelectedContext(context)
    setCurrentView('today')
    // Also reset assignee filter when switching contexts
    setSelectedAssignees([])

    // Call external handler if provided (for app-level navigation)
    if (onNavigateToContext) {
      onNavigateToContext(context)
    }
  }, [onNavigateToContext, setCurrentView])

  const handleNavigateToInbox = useCallback(() => {
    if (onNavigateToInbox) {
      onNavigateToInbox()
    } else {
      // Fallback: navigate to today view
      setCurrentView('today')
    }
  }, [onNavigateToInbox, setCurrentView])

  const handleNavigateToProjects = useCallback(() => {
    if (onNavigateToProjects) {
      onNavigateToProjects()
    }
  }, [onNavigateToProjects])

  // Render the appropriate view
  const renderContent = () => {
    // Home dashboard view
    if (currentView === 'home') {
      return (
        <HomeDashboard
          tasks={tasks}
          events={events}
          routines={routines}
          projects={projects}
          // Daily Brief disabled
          brief={null}
          briefLoading={false}
          briefGenerating={false}
          onScheduleTask={(taskId, date) => {
            if (onUpdateTask) {
              onUpdateTask(taskId, { scheduledFor: date })
            }
          }}
          onDeferTask={(taskId, date) => {
            if (onPushTask) {
              onPushTask(taskId, date)
            }
          }}
          onNavigateToSchedule={handleNavigateToSchedule}
          onNavigateToContext={handleNavigateToContext}
          onNavigateToInbox={handleNavigateToInbox}
          onNavigateToProjects={handleNavigateToProjects}
          autoShowDailyBrief={false}
        />
      )
    }

    if (currentView === 'week') {
      return (
        <WeekView
          tasks={tasks}
          events={events}
          routines={routines}
          dateInstances={dateInstances}
          weekStart={weekStart}
          onWeekChange={setWeekStart}
          onSelectDay={handleSelectDay}
          selectedAssignee={selectedAssigneeForSchedule}
          eventNotesMap={eventNotesMap}
        />
      )
    }

    // River view when 2+ family members selected
    if (showRiverView) {
      return (
        <CascadingRiverView
          tasks={tasks}
          events={events}
          routines={routines}
          dateInstances={dateInstances}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
          onToggleTask={onToggleTask}
          onUpdateTask={onUpdateTask}
          onPushTask={onPushTask}
          onDeleteTask={onDeleteTask}
          viewedDate={viewedDate}
          onDateChange={onDateChange}
          contactsMap={contactsMap}
          projectsMap={projectsMap}
          eventNotesMap={eventNotesMap}
          familyMembers={familyMembers}
          selectedAssignees={selectedAssignees}
          onAssignTask={onAssignTask}
          onAssignEvent={onAssignEvent}
          onAssignRoutine={onAssignRoutine}
          onCompleteRoutine={onCompleteRoutine}
          onSkipRoutine={onSkipRoutine}
          onPushRoutine={onPushRoutine}
          onCompleteEvent={onCompleteEvent}
          onSkipEvent={onSkipEvent}
          onPushEvent={onPushEvent}
        />
      )
    }

    // Today view uses TodaySchedule
    return (
      <TodaySchedule
        tasks={filteredTasks}
        events={events}
        routines={routines}
        dateInstances={dateInstances}
        selectedItemId={selectedItemId}
        onSelectItem={onSelectItem}
        onToggleTask={onToggleTask}
        onUpdateTask={onUpdateTask}
        onPushTask={onPushTask}
        onDeleteTask={onDeleteTask}
        onArchiveTask={onArchiveTask}
        loading={loading}
        viewedDate={viewedDate}
        onDateChange={onDateChange}
        contactsMap={contactsMap}
        projectsMap={projectsMap}
        projects={projects}
        contacts={contacts}
        onSearchContacts={onSearchContacts}
        onAddContact={onAddContact}
        eventNotesMap={eventNotesMap}
        onRefreshInstances={onRefreshInstances}
        recentlyCreatedTaskId={recentlyCreatedTaskId}
        onTriageCardCollapse={onTriageCardCollapse}
        onOpenProject={onOpenProject}
        familyMembers={familyMembers}
        onAssignTask={onAssignTask}
        onAssignTaskAll={onAssignTaskAll}
        onAssignEvent={onAssignEvent}
        onAssignEventAll={onAssignEventAll}
        onAssignRoutine={onAssignRoutine}
        onAssignRoutineAll={onAssignRoutineAll}
        onCompleteRoutine={onCompleteRoutine}
        onSkipRoutine={onSkipRoutine}
        onPushRoutine={onPushRoutine}
        onCompleteEvent={onCompleteEvent}
        onSkipEvent={onSkipEvent}
        onPushEvent={onPushEvent}
        onOpenPlanning={onOpenPlanning}
        onCreateTask={onCreateTask}
        onAddProject={onAddProject}
        selectedAssignee={selectedAssigneeForSchedule}
        onSelectAssignee={(id) => setSelectedAssignees(id ? [id] : [])}
        assigneesWithTasks={familyMembers}
        hasUnassignedTasks={hasUnassignedTasks}
        // Bulk operations
        onBulkComplete={onBulkComplete}
        onBulkUncomplete={onBulkUncomplete}
        onBulkDelete={onBulkDelete}
        onBulkReschedule={onBulkReschedule}
        // Calendar integration
        onAddToCalendar={onAddToCalendar}
        addingToCalendarTaskId={addingToCalendarTaskId}
      />
    )
  }

  // For home view, render without the wrapper chrome
  if (currentView === 'home') {
    return (
      <div className="relative flex flex-col h-full">
        {/* Header controls - floating in upper right on desktop only */}
        {!isMobile && (
          <div className="absolute top-4 right-6 z-20 flex items-center gap-3">
            <HomeViewSwitcher
              currentView={currentView}
              onViewChange={handleViewChange}
              selectedAssignees={selectedAssignees}
              onSelectAssignees={setSelectedAssignees}
              assigneesWithTasks={familyMembers}
              hasUnassignedTasks={hasUnassignedTasks}
            />
          </div>
        )}
        <div className={`flex-1 overflow-y-auto ${isMobile ? '' : 'pt-16'}`}>
          {renderContent()}
        </div>
      </div>
    )
  }

  // Daily Brief disabled
  // const hasBrief = brief && !brief.dismissedAt

  return (
    <div className="relative flex flex-col h-full">
      {/* Header controls - floating row on desktop only */}
      {!isMobile && (
        <div className="absolute top-4 left-6 right-6 z-20 flex items-center justify-between">
          {/* Left side - placeholder for future features */}
          <div className="flex items-center gap-3">
            {/* Morning Brief disabled for now */}
          </div>

          {/* Right side - View switcher with assignee filter */}
          <HomeViewSwitcher
            currentView={currentView}
            onViewChange={handleViewChange}
            selectedAssignees={selectedAssignees}
            onSelectAssignees={setSelectedAssignees}
            assigneesWithTasks={familyMembers}
            hasUnassignedTasks={hasUnassignedTasks}
          />
        </div>
      )}

      {/* Main content area - pt-16 to clear floating header on desktop only */}
      <div className={`flex-1 overflow-y-auto ${isMobile ? '' : 'pt-16'}`}>
        {/* Context filter header - shown when filtering by Work/Family/Personal */}
        {selectedContext && contextInfo && (
          <div className="px-4 pt-2 md:px-6 md:pt-2">
            <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${contextInfo.color}`}>
              <div className="flex items-center gap-3">
                <span className="text-xl">{contextInfo.icon}</span>
                <div>
                  <h2 className="font-semibold">{contextInfo.label} Context</h2>
                  <p className="text-sm opacity-80">
                    Showing {filteredTasks.filter(t => !t.completed).length} tasks
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedContext(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear filter
              </button>
            </div>
          </div>
        )}

        {/* Daily Brief Modal - disabled for now */}

        {renderContent()}
      </div>
    </div>
  )
}
