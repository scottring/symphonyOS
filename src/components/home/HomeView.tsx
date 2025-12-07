import { useState } from 'react'
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
}: HomeViewProps) {
  const { currentView, setCurrentView } = useHomeView()
  const isMobile = useMobile()

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
        />
      )
    }

    // Today view (also used for today-context)
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
      />
    )
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* View switcher - floating in upper right, hidden on mobile */}
      {!isMobile && (
        <div className="absolute top-4 right-6 z-20">
          <HomeViewSwitcher
            currentView={currentView}
            onViewChange={setCurrentView}
          />
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        {isMobile ? (
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
          />
        ) : (
          renderContent()
        )}
      </div>
    </div>
  )
}
