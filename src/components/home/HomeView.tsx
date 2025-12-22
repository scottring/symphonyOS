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
import { HomeViewSwitcher } from './HomeViewSwitcher'
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
  onCompleteEvent,
  onSkipEvent,
  onPushEvent,
  onOpenPlanning,
  onCreateTask,
  onAddProject,
}: HomeViewProps) {
  const { currentView, setCurrentView } = useHomeView()
  const isMobile = useMobile()

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

  // Render the appropriate view
  const renderContent = () => {
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
      />
    )
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* Header controls - floating in upper right on desktop only */}
      {!isMobile && (
        <div className="absolute top-4 right-6 z-20 flex items-center gap-3">
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
    </div>
  )
}
