import { useEffect, useState, useMemo, useCallback, Suspense } from 'react'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useAuth } from '@/hooks/useAuth'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { useEventNotes } from '@/hooks/useEventNotes'
import { useContacts } from '@/hooks/useContacts'
import { useProjects } from '@/hooks/useProjects'
import { useRoutines } from '@/hooks/useRoutines'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useMobile } from '@/hooks/useMobile'
import { supabase } from '@/lib/supabase'
import { AppShell } from '@/components/layout/AppShell'
import { TodaySchedule } from '@/components/schedule/TodaySchedule'
import { DetailPanel } from '@/components/detail/DetailPanel'
import { LoadingFallback } from '@/components/layout/LoadingFallback'
import {
  ProjectsList,
  ProjectView,
  RoutinesList,
  RoutineForm,
  RoutineInput,
  TaskView,
  ContactView,
  RecipeViewer,
  AuthForm,
  CalendarConnect,
  OnboardingWizard,
} from '@/components/lazy'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'
import type { ViewType } from '@/components/layout/Sidebar'
import type { ActionableInstance } from '@/types/actionable'

function App() {
  const { tasks, loading: tasksLoading, addTask, addSubtask, toggleTask, deleteTask, updateTask, pushTask } = useSupabaseTasks()
  const { user, loading: authLoading, signOut } = useAuth()
  const { isConnected, events, fetchEvents, isFetching: eventsFetching } = useGoogleCalendar()

  // Onboarding state
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null)
  const [onboardingLoading, setOnboardingLoading] = useState(true)
  const { fetchNote, fetchNotesForEvents, updateNote, updateEventAssignment, getNote, notes: eventNotesMap } = useEventNotes()
  const { contacts, contactsMap, addContact, updateContact, deleteContact, searchContacts } = useContacts()
  const { projects, projectsMap, addProject, updateProject, deleteProject, searchProjects } = useProjects()
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
  const { getInstancesForDate, markDone, undoDone, skip } = useActionableInstances()
  const { members: familyMembers } = useFamilyMembers()
  const isMobile = useMobile()

  // Actionable instances for the viewed date (to filter skipped/completed events)
  const [dateInstances, setDateInstances] = useState<ActionableInstance[]>([])

  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('symphony-sidebar-collapsed')
    return stored === 'true'
  })
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [viewedDate, setViewedDate] = useState(() => new Date())
  const [recipeUrl, setRecipeUrl] = useState<string | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [activeView, setActiveView] = useState<ViewType>('home')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [creatingRoutine, setCreatingRoutine] = useState(false)
  const [recentlyCreatedTaskId, setRecentlyCreatedTaskId] = useState<string | null>(null)

  // Toggle quick add modal
  const openQuickAdd = useCallback(() => setQuickAddOpen(true), [])
  const closeQuickAdd = useCallback(() => setQuickAddOpen(false), [])

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('symphony-sidebar-collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  // Check onboarding status
  useEffect(() => {
    async function checkOnboarding() {
      if (!user) {
        setOnboardingLoading(false)
        return
      }

      try {
        const { data: profile, error } = await supabase
          .from('user_profiles')
          .select('onboarding_completed_at')
          .eq('user_id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('Error checking onboarding:', error)
          // Assume complete on error to not block the app
          setOnboardingComplete(true)
        } else if (profile?.onboarding_completed_at) {
          setOnboardingComplete(true)
        } else {
          setOnboardingComplete(false)
        }
      } catch (err) {
        console.error('Error in checkOnboarding:', err)
        setOnboardingComplete(true) // Fail open
      } finally {
        setOnboardingLoading(false)
      }
    }

    if (!authLoading) {
      checkOnboarding()
    }
  }, [user, authLoading])

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch is valid
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
    setSelectedTaskId(null)
    setSelectedProjectId(null)
    setSelectedRoutineId(null)
    setSelectedContactId(null)
    setCreatingRoutine(false)
    setRecipeUrl(null)
  }, [])

  // Handle opening a project from detail panel
  const handleOpenProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId)
    setActiveView('projects')
    setSelectedItemId(null)
    setSelectedTaskId(null)
    setSelectedContactId(null)
    setRecipeUrl(null)
  }, [])

  // Handle opening a contact (from TaskView, DetailPanel, etc.)
  const handleOpenContact = useCallback((contactId: string) => {
    setSelectedContactId(contactId)
    setActiveView('contact-detail')
    setSelectedItemId(null)
    setSelectedTaskId(null)
    setSelectedProjectId(null)
    setRecipeUrl(null)
  }, [])

  // Get contact for contact view
  const selectedContactForView = useMemo(() => {
    if (!selectedContactId) return null
    return contactsMap.get(selectedContactId) ?? null
  }, [selectedContactId, contactsMap])

  // Handle selecting an item - routes tasks differently on desktop vs mobile
  const handleSelectItem = useCallback((itemId: string | null) => {
    if (!itemId) {
      setSelectedItemId(null)
      setSelectedTaskId(null)
      return
    }

    // Check if it's a task
    if (itemId.startsWith('task-')) {
      const taskId = itemId.replace('task-', '')
      if (isMobile) {
        // Mobile: open DetailPanel as bottom sheet
        setSelectedItemId(itemId)
        setSelectedTaskId(null)
      } else {
        // Desktop: navigate to TaskView page
        setSelectedTaskId(taskId)
        setActiveView('task-detail')
        setSelectedItemId(null)
      }
    } else {
      // Events and routines: always use DetailPanel
      setSelectedItemId(itemId)
      setSelectedTaskId(null)
    }
    setRecipeUrl(null)
  }, [isMobile])

  // Get selected task for TaskView (desktop)
  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null
    return tasks.find(t => t.id === selectedTaskId) ?? null
  }, [selectedTaskId, tasks])

  // Get contact for selected task (TaskView)
  const selectedTaskContact = useMemo(() => {
    if (!selectedTask?.contactId) return null
    return contactsMap.get(selectedTask.contactId) ?? null
  }, [selectedTask, contactsMap])

  // Get project for selected task (TaskView)
  const selectedTaskProject = useMemo(() => {
    if (!selectedTask?.projectId) return null
    return projectsMap.get(selectedTask.projectId) ?? null
  }, [selectedTask, projectsMap])

  if (authLoading || onboardingLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <p className="text-neutral-500">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg-base">
        <Suspense fallback={<LoadingFallback />}>
          <AuthForm />
        </Suspense>
      </div>
    )
  }

  // Show onboarding for new users
  if (onboardingComplete === false) {
    return (
      <div className="min-h-screen bg-bg-base">
        <Suspense fallback={<LoadingFallback />}>
          <OnboardingWizard onComplete={() => setOnboardingComplete(true)} />
        </Suspense>
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
      onQuickAdd={async (title) => {
        const taskId = await addTask(title)
        if (taskId) {
          setRecentlyCreatedTaskId(taskId)
        }
      }}
      quickAddOpen={quickAddOpen}
      onOpenQuickAdd={openQuickAdd}
      onCloseQuickAdd={closeQuickAdd}
      activeView={activeView}
      onViewChange={handleViewChange}
      panel={
        recipeUrl ? (
          <Suspense fallback={<LoadingFallback />}>
            <RecipeViewer
              url={recipeUrl}
              onClose={() => setRecipeUrl(null)}
            />
          </Suspense>
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
            onOpenContact={handleOpenContact}
            project={selectedItemProject}
            projects={projects}
            onSearchProjects={searchProjects}
            onUpdateProject={updateProject}
            onOpenProject={handleOpenProject}
            onAddProject={addProject}
            onAddSubtask={addSubtask}
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
              <Suspense fallback={<LoadingFallback />}>
                <CalendarConnect />
              </Suspense>
            </div>
          )}

          {/* Today's schedule */}
          <TodaySchedule
            tasks={tasks}
            events={filteredEvents}
            routines={filteredRoutines}
            dateInstances={dateInstances}
            selectedItemId={selectedItemId}
            onSelectItem={handleSelectItem}
            onToggleTask={toggleTask}
            onUpdateTask={updateTask}
            onPushTask={pushTask}
            onDeleteTask={deleteTask}
            loading={tasksLoading || eventsFetching || routinesLoading}
            viewedDate={viewedDate}
            onDateChange={setViewedDate}
            contactsMap={contactsMap}
            projectsMap={projectsMap}
            projects={projects}
            contacts={contacts}
            onSearchContacts={searchContacts}
            onAddContact={(name) => addContact({ name })}
            eventNotesMap={eventNotesMap}
            onRefreshInstances={refreshDateInstances}
            recentlyCreatedTaskId={recentlyCreatedTaskId}
            onTriageCardCollapse={() => setRecentlyCreatedTaskId(null)}
            onOpenProject={handleOpenProject}
            familyMembers={familyMembers}
            onAssignTask={(taskId, memberId) => {
              updateTask(taskId, { assignedTo: memberId ?? undefined })
            }}
            onAssignEvent={(eventId, memberId) => {
              updateEventAssignment(eventId, memberId)
            }}
            onAssignRoutine={(routineId, memberId) => {
              updateRoutine(routineId, { assigned_to: memberId })
            }}
            onCompleteRoutine={async (routineId, completed) => {
              if (completed) {
                await markDone('routine', routineId, viewedDate)
              } else {
                await undoDone('routine', routineId, viewedDate)
              }
              refreshDateInstances()
            }}
            onSkipRoutine={async (routineId) => {
              await skip('routine', routineId, viewedDate)
              refreshDateInstances()
            }}
            onCompleteEvent={async (eventId, completed) => {
              if (completed) {
                await markDone('calendar_event', eventId, viewedDate)
              } else {
                await undoDone('calendar_event', eventId, viewedDate)
              }
              refreshDateInstances()
            }}
            onSkipEvent={async (eventId) => {
              await skip('calendar_event', eventId, viewedDate)
              refreshDateInstances()
            }}
          />
        </div>
      )}

      {activeView === 'task-detail' && selectedTask && (
        <Suspense fallback={<LoadingFallback />}>
          <TaskView
            task={selectedTask}
            onBack={() => {
              setSelectedTaskId(null)
              setActiveView('home')
            }}
            onUpdate={updateTask}
            onDelete={(id) => {
              deleteTask(id)
              setSelectedTaskId(null)
              setActiveView('home')
            }}
            onToggleComplete={toggleTask}
            onPush={pushTask}
            contact={selectedTaskContact}
            contacts={contacts}
            onSearchContacts={searchContacts}
            onAddContact={addContact}
            onOpenContact={handleOpenContact}
            project={selectedTaskProject}
            projects={projects}
            onSearchProjects={searchProjects}
            onOpenProject={handleOpenProject}
            onAddProject={addProject}
            onAddSubtask={addSubtask}
          />
        </Suspense>
      )}

      {activeView === 'contact-detail' && selectedContactForView && (
        <Suspense fallback={<LoadingFallback />}>
          <ContactView
            contact={selectedContactForView}
            onBack={() => {
              setSelectedContactId(null)
              setActiveView('home')
            }}
            onUpdate={updateContact}
            onDelete={async (id) => {
              await deleteContact(id)
              setSelectedContactId(null)
              setActiveView('home')
            }}
            tasks={tasks}
            onSelectTask={(taskId) => {
              setSelectedTaskId(taskId)
              setActiveView('task-detail')
              setSelectedContactId(null)
            }}
          />
        </Suspense>
      )}

      {activeView === 'projects' && !selectedProjectId && (
        <Suspense fallback={<LoadingFallback />}>
          <ProjectsList
            projects={projects}
            onSelectProject={setSelectedProjectId}
            onAddProject={addProject}
          />
        </Suspense>
      )}

      {activeView === 'projects' && selectedProject && (
        <Suspense fallback={<LoadingFallback />}>
          <ProjectView
            project={selectedProject}
            tasks={tasks}
            contactsMap={contactsMap}
            onBack={() => setSelectedProjectId(null)}
            onUpdateProject={updateProject}
            onDeleteProject={deleteProject}
            onAddTask={(title, projectId) => addTask(title, undefined, projectId)}
            onSelectTask={handleSelectItem}
            onToggleTask={toggleTask}
            selectedTaskId={selectedItemId}
          />
        </Suspense>
      )}

      {activeView === 'routines' && !selectedRoutineId && !creatingRoutine && (
        <Suspense fallback={<LoadingFallback />}>
          <RoutinesList
            routines={allRoutines}
            contacts={contacts}
            familyMembers={familyMembers}
            onSelectRoutine={(routine) => setSelectedRoutineId(routine.id)}
            onCreateRoutine={() => setCreatingRoutine(true)}
          />
        </Suspense>
      )}

      {activeView === 'routines' && creatingRoutine && (
        <div className="h-full overflow-auto">
          <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 p-6 pb-0">
              <button
                onClick={() => setCreatingRoutine(false)}
                className="p-2 -ml-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
              </button>
              <h1 className="text-xl font-semibold text-neutral-800">New Routine</h1>
            </div>
            <Suspense fallback={<LoadingFallback />}>
              <RoutineInput
                contacts={contacts}
                onSave={async (input) => {
                  await addRoutine(input)
                  setCreatingRoutine(false)
                }}
                onCancel={() => setCreatingRoutine(false)}
              />
            </Suspense>
          </div>
        </div>
      )}

      {activeView === 'routines' && selectedRoutine && (
        <Suspense fallback={<LoadingFallback />}>
          <RoutineForm
            key={selectedRoutine.id}
            routine={selectedRoutine}
            contacts={contacts}
            familyMembers={familyMembers}
            onBack={() => setSelectedRoutineId(null)}
            onUpdate={updateRoutine}
            onDelete={deleteRoutine}
            onToggleVisibility={toggleRoutineVisibility}
          />
        </Suspense>
      )}
    </AppShell>
  )
}

export default App
