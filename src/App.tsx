import { useEffect, useState, useMemo, useCallback } from 'react'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useAuth } from '@/hooks/useAuth'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { useEventNotes } from '@/hooks/useEventNotes'
import { useContacts } from '@/hooks/useContacts'
import { useProjects } from '@/hooks/useProjects'
import { useRoutines } from '@/hooks/useRoutines'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { AppShell } from '@/components/layout/AppShell'
import { TodaySchedule } from '@/components/schedule/TodaySchedule'
import { DetailPanel } from '@/components/detail/DetailPanel'
import { CalendarConnect } from '@/components/CalendarConnect'
import { AuthForm } from '@/components/AuthForm'
import { RecipeViewer } from '@/components/recipe/RecipeViewer'
import { ProjectsList } from '@/components/project/ProjectsList'
import { ProjectView } from '@/components/project/ProjectView'
import { RoutinesList } from '@/components/routine/RoutinesList'
import { RoutineForm } from '@/components/routine/RoutineForm'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'
import type { ViewType } from '@/components/layout/Sidebar'
import type { ActionableInstance } from '@/types/actionable'

function App() {
  const { tasks, loading: tasksLoading, addTask, toggleTask, deleteTask, updateTask } = useSupabaseTasks()
  const { user, loading: authLoading, signOut } = useAuth()
  const { isConnected, events, fetchEvents, isFetching: eventsFetching } = useGoogleCalendar()
  const { fetchNote, fetchNotesForEvents, updateNote, getNote, notes: eventNotesMap } = useEventNotes()
  const { contacts, contactsMap, addContact, updateContact, searchContacts } = useContacts()
  const { projects, projectsMap, addProject, updateProject, searchProjects } = useProjects()
  const {
    routines: allRoutines,
    activeRoutines,
    getRoutinesForDate,
    loading: routinesLoading,
    addRoutine,
    updateRoutine,
    deleteRoutine,
    toggleVisibility: toggleRoutineVisibility,
  } = useRoutines()
  const { getInstancesForDate } = useActionableInstances()

  // Actionable instances for the viewed date (to filter skipped/completed events)
  const [dateInstances, setDateInstances] = useState<ActionableInstance[]>([])

  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('symphony-sidebar-collapsed')
    return stored === 'true'
  })
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [viewedDate, setViewedDate] = useState(() => new Date())
  const [recipeUrl, setRecipeUrl] = useState<string | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [activeView, setActiveView] = useState<ViewType>('home')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null)

  // Toggle quick add modal
  const openQuickAdd = useCallback(() => setQuickAddOpen(true), [])
  const closeQuickAdd = useCallback(() => setQuickAddOpen(false), [])

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('symphony-sidebar-collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K for quick add
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setQuickAddOpen(true)
      }
      // Escape to close panel
      if (e.key === 'Escape' && selectedItemId) {
        setSelectedItemId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedItemId])

  // Fetch calendar events when connected or date changes
  useEffect(() => {
    if (isConnected) {
      const startOfDay = new Date(viewedDate)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(viewedDate)
      endOfDay.setHours(23, 59, 59, 999)
      fetchEvents(startOfDay, endOfDay)
    }
  }, [isConnected, viewedDate, fetchEvents])

  // Fetch actionable instances for the viewed date
  const refreshDateInstances = useCallback(async () => {
    const instances = await getInstancesForDate(viewedDate)
    setDateInstances(instances)
  }, [viewedDate, getInstancesForDate])

  useEffect(() => {
    refreshDateInstances()
  }, [refreshDateInstances])

  // Filter events to exclude skipped/completed items
  const filteredEvents = useMemo(() => {
    // Build a map of entity_id -> status for quick lookup
    const statusMap = new Map<string, string>()
    for (const instance of dateInstances) {
      if (instance.entity_type === 'calendar_event') {
        statusMap.set(instance.entity_id, instance.status)
      }
    }

    // Filter out events that are skipped (completed events still show but marked done)
    return events.filter((event) => {
      const eventId = event.google_event_id || event.id
      const status = statusMap.get(eventId)
      // Remove if skipped or deferred
      return status !== 'skipped' && status !== 'deferred'
    })
  }, [events, dateInstances])

  // Get routines for the viewed date and filter out skipped/deferred
  const filteredRoutines = useMemo(() => {
    const routinesForDate = getRoutinesForDate(viewedDate)

    // Build a map of routine_id -> instance for quick lookup
    const instanceMap = new Map<string, ActionableInstance>()
    for (const instance of dateInstances) {
      if (instance.entity_type === 'routine') {
        instanceMap.set(instance.entity_id, instance)
      }
    }

    // Filter out skipped/deferred routines
    return routinesForDate.filter((routine) => {
      const instance = instanceMap.get(routine.id)
      if (!instance) return true // No instance = pending
      return instance.status !== 'skipped' && instance.status !== 'deferred'
    })
  }, [getRoutinesForDate, viewedDate, dateInstances])

  // Fetch event notes when an event is selected
  useEffect(() => {
    if (selectedItemId?.startsWith('event-')) {
      const eventId = selectedItemId.replace('event-', '')
      fetchNote(eventId)
    }
  }, [selectedItemId, fetchNote])

  // Batch fetch event notes for all visible events (for info icon display)
  useEffect(() => {
    if (filteredEvents.length > 0) {
      const eventIds = filteredEvents.map((e) => e.google_event_id || e.id)
      fetchNotesForEvents(eventIds)
    }
  }, [filteredEvents, fetchNotesForEvents])

  // Find selected item from tasks, events, or routines
  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null

    // Check if it's a task
    if (selectedItemId.startsWith('task-')) {
      const taskId = selectedItemId.replace('task-', '')
      const task = tasks.find((t) => t.id === taskId)
      return task ? taskToTimelineItem(task) : null
    }

    // Check if it's an event
    if (selectedItemId.startsWith('event-')) {
      const eventId = selectedItemId.replace('event-', '')
      const event = events.find((e) => (e.google_event_id || e.id) === eventId)
      if (!event) return null

      const timelineItem = eventToTimelineItem(event)
      // Add user's Symphony notes from event_notes table
      const eventNote = getNote(eventId)
      if (eventNote?.notes) {
        timelineItem.notes = eventNote.notes
      }
      return timelineItem
    }

    // Check if it's a routine
    if (selectedItemId.startsWith('routine-')) {
      const routineId = selectedItemId.replace('routine-', '')
      const routine = activeRoutines.find((r) => r.id === routineId)
      if (!routine) return null

      // Create timeline item with the viewed date for time context
      const timelineItem = routineToTimelineItem(routine, viewedDate)

      // Check if there's an instance to update completion status
      const instance = dateInstances.find(
        (i) => i.entity_type === 'routine' && i.entity_id === routineId
      )
      if (instance?.status === 'completed') {
        timelineItem.completed = true
      }

      return timelineItem
    }

    return null
  }, [selectedItemId, tasks, events, activeRoutines, viewedDate, dateInstances, getNote])

  // Get contact for selected item (must be before early returns to follow Rules of Hooks)
  const selectedContact = useMemo(() => {
    if (!selectedItem?.contactId) return null
    return contactsMap.get(selectedItem.contactId) ?? null
  }, [selectedItem, contactsMap])

  // Get project for selected item
  const selectedItemProject = useMemo(() => {
    if (!selectedItem?.projectId) return null
    return projectsMap.get(selectedItem.projectId) ?? null
  }, [selectedItem, projectsMap])

  // Get project for project view
  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null
    return projectsMap.get(selectedProjectId) ?? null
  }, [selectedProjectId, projectsMap])

  // Get routine for routine view
  const selectedRoutine = useMemo(() => {
    if (!selectedRoutineId) return null
    return allRoutines.find(r => r.id === selectedRoutineId) ?? null
  }, [selectedRoutineId, allRoutines])

  // Handle view change - clear selections when switching views
  const handleViewChange = useCallback((view: ViewType) => {
    setActiveView(view)
    setSelectedItemId(null)
    setSelectedProjectId(null)
    setSelectedRoutineId(null)
    setRecipeUrl(null)
  }, [])

  // Handle opening a project from detail panel
  const handleOpenProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId)
    setActiveView('projects')
    setSelectedItemId(null)
    setRecipeUrl(null)
  }, [])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <p className="text-neutral-500">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg-base">
        <AuthForm />
      </div>
    )
  }

  return (
    <AppShell
      sidebarCollapsed={sidebarCollapsed}
      onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      panelOpen={selectedItemId !== null || recipeUrl !== null}
      onPanelClose={() => {
        if (recipeUrl) setRecipeUrl(null)
        else setSelectedItemId(null)
      }}
      userEmail={user.email ?? undefined}
      onSignOut={signOut}
      onQuickAdd={addTask}
      onAddRoutine={addRoutine}
      quickAddOpen={quickAddOpen}
      onOpenQuickAdd={openQuickAdd}
      onCloseQuickAdd={closeQuickAdd}
      contacts={contacts}
      onAddContact={addContact}
      projects={projects}
      onAddProject={addProject}
      activeView={activeView}
      onViewChange={handleViewChange}
      panel={
        recipeUrl ? (
          <RecipeViewer
            url={recipeUrl}
            onClose={() => setRecipeUrl(null)}
          />
        ) : (
          <DetailPanel
            item={selectedItem}
            onClose={() => setSelectedItemId(null)}
            onUpdate={updateTask}
            onDelete={deleteTask}
            onToggleComplete={toggleTask}
            onUpdateEventNote={updateNote}
            onOpenRecipe={setRecipeUrl}
            contact={selectedContact}
            contacts={contacts}
            onSearchContacts={searchContacts}
            onUpdateContact={updateContact}
            project={selectedItemProject}
            projects={projects}
            onSearchProjects={searchProjects}
            onUpdateProject={updateProject}
            onOpenProject={handleOpenProject}
            onActionComplete={refreshDateInstances}
          />
        )
      }
    >
      {activeView === 'home' && (
        <div className="h-full overflow-auto">
          {/* Calendar connect banner if needed */}
          {!isConnected && (
            <div className="p-4 border-b border-neutral-100">
              <CalendarConnect />
            </div>
          )}

          {/* Today's schedule */}
          <TodaySchedule
            tasks={tasks}
            events={filteredEvents}
            routines={filteredRoutines}
            dateInstances={dateInstances}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
            onToggleTask={toggleTask}
            loading={tasksLoading || eventsFetching || routinesLoading}
            viewedDate={viewedDate}
            onDateChange={setViewedDate}
            contactsMap={contactsMap}
            projectsMap={projectsMap}
            eventNotesMap={eventNotesMap}
            onRefreshInstances={refreshDateInstances}
          />
        </div>
      )}

      {activeView === 'projects' && !selectedProjectId && (
        <ProjectsList
          projects={projects}
          onSelectProject={setSelectedProjectId}
          onAddProject={addProject}
        />
      )}

      {activeView === 'projects' && selectedProject && (
        <ProjectView
          project={selectedProject}
          tasks={tasks}
          contactsMap={contactsMap}
          onBack={() => setSelectedProjectId(null)}
          onUpdateProject={updateProject}
          onSelectTask={setSelectedItemId}
          onToggleTask={toggleTask}
          selectedTaskId={selectedItemId}
        />
      )}

      {activeView === 'routines' && !selectedRoutineId && (
        <RoutinesList
          routines={allRoutines}
          onSelectRoutine={(routine) => setSelectedRoutineId(routine.id)}
          onCreateRoutine={() => {
            // Open quick add in routine mode
            openQuickAdd()
          }}
        />
      )}

      {activeView === 'routines' && selectedRoutine && (
        <RoutineForm
          routine={selectedRoutine}
          onBack={() => setSelectedRoutineId(null)}
          onUpdate={updateRoutine}
          onDelete={deleteRoutine}
          onToggleVisibility={toggleRoutineVisibility}
        />
      )}
    </AppShell>
  )
}

export default App
