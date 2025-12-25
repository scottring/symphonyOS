import { useState, useMemo, useCallback } from 'react'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { EventNote } from '@/hooks/useEventNotes'
import { useHomeView } from '@/hooks/useHomeView'
import { useMobile } from '@/hooks/useMobile'
import { useUndo } from '@/hooks/useUndo'
import { useDomain } from '@/hooks/useDomain'
import { HomeViewSwitcher } from './HomeViewSwitcher'
import { WeekView } from './WeekView'
import { CascadingRiverView } from './CascadingRiverView'
import { TodaySchedule } from '@/components/schedule/TodaySchedule'
import { UndoToast } from '@/components/undo/UndoToast'
import { DomainSwitcher } from '@/components/domain/DomainSwitcher'

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
  onUpdateRoutine?: (id: string, updates: Partial<Routine>) => void
  onCompleteEvent?: (eventId: string, completed: boolean) => void
  onSkipEvent?: (eventId: string) => void
  onPushEvent?: (eventId: string, date: Date) => void
  onOpenPlanning?: () => void
  onCreateTask?: (title: string) => void
  onAddProject?: (project: { name: string }) => Promise<Project | null>
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
  onUpdateRoutine,
  onCompleteEvent,
  onSkipEvent,
  onPushEvent,
  onOpenPlanning,
  onCreateTask,
  onAddProject,
}: HomeViewProps) {
  const { currentView, setCurrentView } = useHomeView()
  const isMobile = useMobile()
  const { currentAction, pushAction, executeUndo, dismiss } = useUndo({ duration: 5000 })
  const { currentDomain } = useDomain()

  // Filter tasks, routines, and projects by current domain
  const filteredTasks = useMemo(() => {
    if (currentDomain === 'universal') return tasks
    // Show items with matching context OR null context (for backwards compatibility)
    return tasks.filter(task => task.context === currentDomain || task.context === null)
  }, [tasks, currentDomain])

  const filteredRoutines = useMemo(() => {
    if (currentDomain === 'universal') return routines
    // Show routines with matching context OR null context (for backwards compatibility)
    return routines.filter(routine => routine.context === currentDomain || routine.context === null)
  }, [routines, currentDomain])

  const filteredProjects = useMemo(() => {
    if (currentDomain === 'universal') return projects
    // Show projects with matching context OR null context (for backwards compatibility)
    return projects.filter(project => project.context === currentDomain || project.context === null)
  }, [projects, currentDomain])

  // Assignee filter state - now supports multi-select
  // Empty array = "All", single id = single filter, multiple ids = river view
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])

  // Check if we should show river view (2+ real members selected, not counting 'unassigned')
  const showRiverView = useMemo(() => {
    const realMemberCount = selectedAssignees.filter(id => id !== 'unassigned').length
    return realMemberCount >= 2
  }, [selectedAssignees])

  // Reset filter when view changes
  const handleViewChange = useCallback((view: typeof currentView) => {
    setSelectedAssignees([])
    setCurrentView(view)
  }, [setCurrentView])

  // Convert multi-select to single-select format for TodaySchedule compatibility
  // When single member selected or 'unassigned', pass that. Otherwise null for 'all'.
  const selectedAssigneeForSchedule = useMemo(() => {
    if (selectedAssignees.length === 0) return null // All
    if (selectedAssignees.length === 1) return selectedAssignees[0] // Single
    return null // Multi-select uses river view, schedule shows all
  }, [selectedAssignees])

  // Check if there are any unassigned tasks/events/routines for the filter dropdown
  const hasUnassignedTasks = useMemo(() => {
    // Check tasks (use filtered tasks)
    for (const task of filteredTasks) {
      if (!task.completed && !task.assignedTo && (!task.assignedToAll || task.assignedToAll.length === 0)) {
        return true
      }
    }

    // Check events (already filtered by domain via useGoogleCalendar)
    for (const event of events) {
      const eventId = event.google_event_id || event.id
      const eventNote = eventNotesMap?.get(eventId)
      if (!eventNote?.assignedTo && (!eventNote?.assignedToAll || eventNote.assignedToAll.length === 0)) {
        return true
      }
    }

    // Check routines (use filtered routines)
    for (const routine of filteredRoutines) {
      if (!routine.assigned_to && (!routine.assigned_to_all || routine.assigned_to_all.length === 0)) {
        return true
      }
    }

    return false
  }, [filteredTasks, events, filteredRoutines, eventNotesMap])

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

  // Wrap callbacks with undo functionality
  const handleToggleTaskWithUndo = useCallback((taskId: string) => {
    const task = filteredTasks.find(t => t.id === taskId)
    if (!task) return

    const wasCompleted = task.completed
    onToggleTask(taskId)

    pushAction(
      wasCompleted ? 'Task marked incomplete' : 'Task completed',
      () => onToggleTask(taskId)
    )
  }, [filteredTasks, onToggleTask, pushAction])

  const handleDeleteTaskWithUndo = useCallback((taskId: string) => {
    if (!onDeleteTask) return

    const task = filteredTasks.find(t => t.id === taskId)
    if (!task) return

    onDeleteTask(taskId)
    pushAction(
      `Deleted "${task.title}"`,
      () => {
        // Note: This would require an onRestoreTask callback
        // For now, just show the message
      }
    )
  }, [tasks, onDeleteTask, pushAction])

  const handleCompleteRoutineWithUndo = useCallback((routineId: string, completed: boolean) => {
    if (!onCompleteRoutine) return

    onCompleteRoutine(routineId, completed)
    pushAction(
      completed ? 'Routine completed' : 'Routine marked incomplete',
      () => onCompleteRoutine(routineId, !completed)
    )
  }, [onCompleteRoutine, pushAction])

  const handleCompleteEventWithUndo = useCallback((eventId: string, completed: boolean) => {
    if (!onCompleteEvent) return

    onCompleteEvent(eventId, completed)
    pushAction(
      completed ? 'Event completed' : 'Event marked incomplete',
      () => onCompleteEvent(eventId, !completed)
    )
  }, [onCompleteEvent, pushAction])

  // Render the appropriate view
  const renderContent = () => {
    if (currentView === 'week') {
      return (
        <WeekView
          tasks={filteredTasks}
          events={events}
          routines={filteredRoutines}
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
          tasks={filteredTasks}
          events={events}
          routines={filteredRoutines}
          dateInstances={dateInstances}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
          onToggleTask={handleToggleTaskWithUndo}
          onUpdateTask={onUpdateTask}
          onPushTask={onPushTask}
          onDeleteTask={handleDeleteTaskWithUndo}
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
          onCompleteRoutine={handleCompleteRoutineWithUndo}
          onSkipRoutine={onSkipRoutine}
          onPushRoutine={onPushRoutine}
          onCompleteEvent={handleCompleteEventWithUndo}
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
        routines={filteredRoutines}
        dateInstances={dateInstances}
        selectedItemId={selectedItemId}
        onSelectItem={onSelectItem}
        onToggleTask={handleToggleTaskWithUndo}
        onUpdateTask={onUpdateTask}
        onPushTask={onPushTask}
        onDeleteTask={handleDeleteTaskWithUndo}
        loading={loading}
        viewedDate={viewedDate}
        onDateChange={onDateChange}
        contactsMap={contactsMap}
        projectsMap={projectsMap}
        projects={filteredProjects}
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
        onCompleteRoutine={handleCompleteRoutineWithUndo}
        onSkipRoutine={onSkipRoutine}
        onPushRoutine={onPushRoutine}
        onUpdateRoutine={onUpdateRoutine}
        onCompleteEvent={handleCompleteEventWithUndo}
        onSkipEvent={onSkipEvent}
        onPushEvent={onPushEvent}
        onOpenPlanning={onOpenPlanning}
        onCreateTask={onCreateTask}
        onAddProject={onAddProject}
        selectedAssignee={selectedAssigneeForSchedule}
        onSelectAssignee={(id) => setSelectedAssignees(id ? [id] : [])}
        assigneesWithTasks={familyMembers}
        hasUnassignedTasks={hasUnassignedTasks}
      />
    )
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* Header controls - floating in upper right on desktop only */}
      {!isMobile && (
        <div className="absolute top-4 right-6 z-20 flex items-center gap-3">
          {/* Domain switcher */}
          <DomainSwitcher />

          {/* View switcher (Day/Week) */}
          <HomeViewSwitcher
            currentView={currentView}
            onViewChange={handleViewChange}
          />
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        {renderContent()}
      </div>

      {/* Undo toast */}
      <UndoToast
        action={currentAction}
        onUndo={executeUndo}
        onDismiss={dismiss}
      />
    </div>
  )
}
