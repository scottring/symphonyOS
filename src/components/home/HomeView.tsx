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
import { useReviewData } from '@/hooks/useReviewData'
import { useBadgeVisibility } from '@/hooks/useBadgeVisibility'
import { HomeViewSwitcher } from './HomeViewSwitcher'
import { WeekView } from './WeekView'
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
  onAssignEvent?: (eventId: string, memberId: string | null) => void
  onAssignRoutine?: (routineId: string, memberId: string | null) => void
  onCompleteRoutine?: (routineId: string, completed: boolean) => void
  onSkipRoutine?: (routineId: string) => void
  onCompleteEvent?: (eventId: string, completed: boolean) => void
  onSkipEvent?: (eventId: string) => void
  onOpenPlanning?: () => void
  onCreateTask?: (title: string) => void
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
  onAssignEvent,
  onAssignRoutine,
  onCompleteRoutine,
  onSkipRoutine,
  onCompleteEvent,
  onSkipEvent,
  onOpenPlanning,
  onCreateTask,
}: HomeViewProps) {
  const { currentView, setCurrentView } = useHomeView()
  const isMobile = useMobile()
  const { showInboxBadge, showReviewBadge } = useBadgeVisibility()

  // Assignee filter state - reset when switching views
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null)

  // Reset filter when view changes
  const handleViewChange = useCallback((view: typeof currentView) => {
    setSelectedAssignee(null)
    setCurrentView(view)
  }, [setCurrentView])

  // Review data - pass selectedAssignee for filtering
  const reviewData = useReviewData(tasks, viewedDate, selectedAssignee)

  // Derive mode from currentView for TodaySchedule compatibility
  const viewMode = currentView === 'review' ? 'review' : 'today'

  // Compute assignees with tasks in current view for the filter dropdown
  const { assigneesWithTasks, hasUnassignedTasks } = useMemo(() => {
    // Get all assignedTo values from tasks, events, and routines in the current view
    const assigneeIds = new Set<string>()
    let hasUnassigned = false

    // Check tasks
    tasks.forEach(task => {
      if (!task.completed) {
        if (task.assignedTo) {
          assigneeIds.add(task.assignedTo)
        } else {
          hasUnassigned = true
        }
      }
    })

    // Check events
    events.forEach(event => {
      const eventId = event.google_event_id || event.id
      const eventNote = eventNotesMap?.get(eventId)
      if (eventNote?.assignedTo) {
        assigneeIds.add(eventNote.assignedTo)
      } else {
        hasUnassigned = true
      }
    })

    // Check routines
    routines.forEach(routine => {
      if (routine.assigned_to) {
        assigneeIds.add(routine.assigned_to)
      } else {
        hasUnassigned = true
      }
    })

    // Filter family members to only those with tasks
    const membersWithTasks = familyMembers.filter(m => assigneeIds.has(m.id))

    return {
      assigneesWithTasks: membersWithTasks,
      hasUnassignedTasks: hasUnassigned,
    }
  }, [tasks, events, routines, familyMembers, eventNotesMap])

  // Inbox count for Today badge
  const inboxCount = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return tasks.filter(task => {
      if (task.completed) return false
      if (!task.scheduledFor) {
        if (task.deferredUntil) {
          const deferredDate = new Date(task.deferredUntil)
          deferredDate.setHours(0, 0, 0, 0)
          return deferredDate <= today
        }
        return true
      }
      return false
    }).length
  }, [tasks])

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
          selectedAssignee={selectedAssignee}
          eventNotesMap={eventNotesMap}
        />
      )
    }

    // Today view and Review view both use TodaySchedule with different mode
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
        onAssignEvent={onAssignEvent}
        onAssignRoutine={onAssignRoutine}
        onCompleteRoutine={onCompleteRoutine}
        onSkipRoutine={onSkipRoutine}
        onCompleteEvent={onCompleteEvent}
        onSkipEvent={onSkipEvent}
        onOpenPlanning={onOpenPlanning}
        mode={viewMode}
        reviewData={reviewData}
        onCreateTask={onCreateTask}
        selectedAssignee={selectedAssignee}
      />
    )
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* Header controls - floating in upper right, hidden on mobile */}
      {!isMobile && (
        <div className="absolute top-4 right-6 z-20 flex items-center gap-3">
          {/* Unified view switcher (Today/Week/Review) with assignee filter */}
          <HomeViewSwitcher
            currentView={currentView}
            onViewChange={handleViewChange}
            inboxCount={showInboxBadge ? inboxCount : 0}
            reviewCount={showReviewBadge ? reviewData.reviewCount : 0}
            selectedAssignee={selectedAssignee}
            onSelectAssignee={setSelectedAssignee}
            assigneesWithTasks={assigneesWithTasks}
            hasUnassignedTasks={hasUnassignedTasks}
          />
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        {renderContent()}
      </div>

      {/* Mobile view toggle - fixed at bottom on mobile */}
      {isMobile && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30">
          <HomeViewSwitcher
            currentView={currentView}
            onViewChange={handleViewChange}
            inboxCount={showInboxBadge ? inboxCount : 0}
            reviewCount={showReviewBadge ? reviewData.reviewCount : 0}
            selectedAssignee={selectedAssignee}
            onSelectAssignee={setSelectedAssignee}
            assigneesWithTasks={assigneesWithTasks}
            hasUnassignedTasks={hasUnassignedTasks}
          />
        </div>
      )}
    </div>
  )
}
