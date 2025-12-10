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
import { useLists } from '@/hooks/useLists'
import { useListItems } from '@/hooks/useListItems'
import { useNotes } from '@/hooks/useNotes'
import { useNoteTopics } from '@/hooks/useNoteTopics'
import { useSearch, type SearchResult } from '@/hooks/useSearch'
import { useAttachments } from '@/hooks/useAttachments'
import { usePinnedItems } from '@/hooks/usePinnedItems'
import { useUndo } from '@/hooks/useUndo'
import type { PinnableEntityType } from '@/types/pin'
import { supabase } from '@/lib/supabase'
import { AppShell } from '@/components/layout/AppShell'
import { HomeView } from '@/components/home'
import { PlanningSession } from '@/components/planning'
import { DetailPanelRedesign as DetailPanel } from '@/components/detail/DetailPanelRedesign'
import { SearchModal } from '@/components/search/SearchModal'
import { LoadingFallback } from '@/components/layout/LoadingFallback'
import { ListsList, ListView } from '@/components/list'
import { NotesPage } from '@/components/notes'
// UndoToast available if needed: import { UndoToast } from '@/components/undo'
import {
  ProjectsList,
  ProjectView,
  RoutinesList,
  RoutineForm,
  RoutineInput,
  TaskView,
  ContactView,
  RecipeViewer,
  CalendarConnect,
  OnboardingWizard,
  SettingsPage,
  AuthForm,
} from '@/components/lazy'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'
import type { ViewType } from '@/components/layout/Sidebar'
import type { ActionableInstance, Routine } from '@/types/actionable'
import type { LinkedActivityType } from '@/types/task'

function App() {
  const { tasks, loading: tasksLoading, addTask, addSubtask, addPrepTask, getLinkedTasks, toggleTask, deleteTask, updateTask, pushTask } = useSupabaseTasks()
  const { user, loading: authLoading, signOut } = useAuth()
  const { isConnected, events, fetchEvents, isFetching: eventsFetching } = useGoogleCalendar()
  const attachments = useAttachments()
  const pinnedItems = usePinnedItems()
  const undo = useUndo({ duration: 5000 })

  // Onboarding state
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null)
  const [onboardingLoading, setOnboardingLoading] = useState(true)
  const { fetchNote, fetchNotesForEvents, updateNote, updateEventAssignment, updateRecipeUrl, getNote, notes: eventNotesMap } = useEventNotes()
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
  const { getInstancesForDate, markDone, undoDone, skip, reschedule } = useActionableInstances()
  const { members: familyMembers, getCurrentUserMember } = useFamilyMembers()

  // Lists state
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const {
    lists,
    listsByCategory,
    addList,
    updateList,
    deleteList,
    getListById,
  } = useLists()
  const {
    items: listItems,
    addItem: addListItem,
    updateItem: updateListItem,
    deleteItem: deleteListItem,
    reorderItems: reorderListItems,
  } = useListItems(selectedListId)

  // Notes state
  const {
    notes,
    notesByDate,
    loading: notesLoading,
    addNote,
    updateNote: updateNoteContent,
    deleteNote,
    getEntityLinks,
  } = useNotes()
  const {
    topicsMap,
    activeTopics,
    addTopic,
  } = useNoteTopics()

  // Get selected list for ListView
  const selectedList = useMemo(() => {
    if (!selectedListId) return null
    return getListById(selectedListId) ?? null
  }, [selectedListId, getListById])

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    results: searchResults,
    totalResults: searchTotalResults,
    isSearching,
    clearSearch,
  } = useSearch({
    tasks,
    projects,
    contacts,
    routines: allRoutines,
    lists,
  })

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
  const [planningOpen, setPlanningOpen] = useState(false)

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
      // Cmd+K for quick capture
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setQuickAddOpen(true)
      }
      // Cmd+J for search
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        setSearchOpen(true)
      }
      // Escape to close panel (search modal handles its own escape)
      if (e.key === 'Escape' && selectedItemId && !searchOpen) {
        setSelectedItemId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedItemId, searchOpen])

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

  // Get routines for the viewed date:
  // 1. Routines that normally occur on this date (by recurrence pattern)
  // 2. Routines that were deferred TO this date (even if not normally scheduled)
  // 3. Filter out routines that are skipped or deferred away from this date
  const filteredRoutines = useMemo(() => {
    const routinesForDate = getRoutinesForDate(viewedDate)

    // Build a map of routine_id -> instance for quick lookup
    const instanceMap = new Map<string, ActionableInstance>()
    for (const instance of dateInstances) {
      if (instance.entity_type === 'routine') {
        instanceMap.set(instance.entity_id, instance)
      }
    }

    // Find routines that were deferred TO this date
    // These are instances with status='deferred' and deferred_to on this date
    const deferredToThisDate = new Set<string>()
    const viewedDateStr = viewedDate.toISOString().split('T')[0]
    for (const instance of dateInstances) {
      if (
        instance.entity_type === 'routine' &&
        instance.status === 'deferred' &&
        instance.deferred_to
      ) {
        const deferredToDateStr = new Date(instance.deferred_to).toISOString().split('T')[0]
        if (deferredToDateStr === viewedDateStr) {
          deferredToThisDate.add(instance.entity_id)
        }
      }
    }

    // Get additional routines that were deferred to this date but don't normally occur today
    const additionalRoutines: Routine[] = []
    for (const routineId of deferredToThisDate) {
      // If this routine isn't already in routinesForDate, add it
      if (!routinesForDate.some(r => r.id === routineId)) {
        const routine = allRoutines.find(r => r.id === routineId)
        if (routine) {
          additionalRoutines.push(routine)
        }
      }
    }

    // Filter out skipped routines and routines deferred AWAY (but not TO this date)
    const filteredNormalRoutines = routinesForDate.filter((routine) => {
      const instance = instanceMap.get(routine.id)
      if (!instance) return true // No instance = pending
      if (instance.status === 'skipped') return false
      // If deferred, only hide if NOT deferred to this specific date
      if (instance.status === 'deferred') {
        return deferredToThisDate.has(routine.id)
      }
      return true
    })

    // Combine normal routines with deferred-to routines
    return [...filteredNormalRoutines, ...additionalRoutines]
  }, [getRoutinesForDate, viewedDate, dateInstances, allRoutines])

  // Generate prep tasks from routine templates when routines surface for the day
  // This runs once when filteredRoutines changes for a given date
  useEffect(() => {
    if (tasksLoading || routinesLoading) return
    if (filteredRoutines.length === 0) return

    // Format date string for instance ID
    const dateStr = viewedDate.toISOString().split('T')[0]

    const generateTemplatedTasks = async () => {
      for (const routine of filteredRoutines) {
        // Skip if no prep templates
        if (!routine.prep_task_templates || routine.prep_task_templates.length === 0) {
          continue
        }

        const instanceId = `${routine.id}_${dateStr}`
        const existingLinked = getLinkedTasks('routine_instance' as LinkedActivityType, instanceId)

        for (const template of routine.prep_task_templates) {
          // Check if a task with this title already exists for this instance
          const exists = existingLinked.prep.some(t => t.title === template.title)
          if (!exists) {
            // Create prep task scheduled for today
            await addTask(
              template.title,
              undefined, // contactId
              undefined, // projectId
              viewedDate, // scheduledFor - same day as routine
              {
                linkedTo: { type: 'routine_instance' as LinkedActivityType, id: instanceId },
                linkType: 'prep',
                assignedTo: getCurrentUserMember()?.id,
              }
            )
          }
        }
      }
    }

    generateTemplatedTasks()
  }, [filteredRoutines, viewedDate, tasksLoading, routinesLoading, getLinkedTasks, addTask])

  // Fetch event notes when an event is selected
  useEffect(() => {
    if (selectedItemId?.startsWith('event-')) {
      const eventId = selectedItemId.replace('event-', '')
      fetchNote(eventId)
    }
  }, [selectedItemId, fetchNote])

  // Fetch attachments when an item is selected
  useEffect(() => {
    if (selectedItemId?.startsWith('task-')) {
      const taskId = selectedItemId.replace('task-', '')
      attachments.fetchAttachments('task', taskId)
    } else if (selectedItemId?.startsWith('event-')) {
      const eventId = selectedItemId.replace('event-', '')
      attachments.fetchAttachments('event_note', eventId)
    }
  }, [selectedItemId, attachments.fetchAttachments])

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

  // Get recipe URL for selected event
  const selectedEventRecipeUrl = useMemo(() => {
    if (!selectedItem?.originalEvent) return null
    const eventId = selectedItem.originalEvent.google_event_id || selectedItem.originalEvent.id
    const eventNote = eventNotesMap.get(eventId)
    return eventNote?.recipeUrl ?? null
  }, [selectedItem, eventNotesMap])

  // Get attachments for selected item
  const selectedItemAttachments = useMemo(() => {
    if (!selectedItemId) return []
    if (selectedItemId.startsWith('task-')) {
      const taskId = selectedItemId.replace('task-', '')
      return attachments.getAttachments('task', taskId)
    }
    if (selectedItemId.startsWith('event-')) {
      const eventId = selectedItemId.replace('event-', '')
      return attachments.getAttachments('event_note', eventId)
    }
    return []
  }, [selectedItemId, attachments])

  // Get linked tasks (prep/followup) for selected item
  const selectedItemLinkedTasks = useMemo(() => {
    if (!selectedItemId) return { prep: [], followup: [] }

    const dateStr = viewedDate.toISOString().split('T')[0]

    if (selectedItemId.startsWith('task-')) {
      const taskId = selectedItemId.replace('task-', '')
      return getLinkedTasks('task' as LinkedActivityType, taskId)
    }
    if (selectedItemId.startsWith('routine-')) {
      const routineId = selectedItemId.replace('routine-', '')
      const instanceId = `${routineId}_${dateStr}`
      return getLinkedTasks('routine_instance' as LinkedActivityType, instanceId)
    }
    if (selectedItemId.startsWith('event-')) {
      const eventId = selectedItemId.replace('event-', '')
      return getLinkedTasks('calendar_event' as LinkedActivityType, eventId)
    }
    return { prep: [], followup: [] }
  }, [selectedItemId, viewedDate, getLinkedTasks])

  // Get routine for selected routine item (for templates)
  const selectedItemRoutine = useMemo((): Routine | null => {
    if (!selectedItemId?.startsWith('routine-')) return null
    const routineId = selectedItemId.replace('routine-', '')
    return allRoutines.find(r => r.id === routineId) ?? null
  }, [selectedItemId, allRoutines])

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
    setSelectedListId(null)
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

  // Handle selecting an item - all types open DetailPanel (unified UX)
  const handleSelectItem = useCallback((itemId: string | null) => {
    if (!itemId) {
      setSelectedItemId(null)
      setSelectedTaskId(null)
      return
    }

    // All item types (tasks, events, routines) use DetailPanel
    setSelectedItemId(itemId)
    setSelectedTaskId(null)
    setRecipeUrl(null)
  }, [])

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

  // Handle search result selection
  const handleSearchSelect = useCallback((result: SearchResult) => {
    setSearchOpen(false)
    clearSearch()

    switch (result.type) {
      case 'task':
        handleSelectItem(`task-${result.id}`)
        break
      case 'project':
        handleOpenProject(result.id)
        break
      case 'contact':
        handleOpenContact(result.id)
        break
      case 'routine':
        setSelectedRoutineId(result.id)
        setActiveView('routines')
        break
      case 'list':
        setSelectedListId(result.id)
        setActiveView('lists')
        break
    }
  }, [clearSearch, handleSelectItem, handleOpenProject, handleOpenContact])

  // Close search modal
  const handleSearchClose = useCallback(() => {
    setSearchOpen(false)
    clearSearch()
  }, [clearSearch])

  // Wrapper for toggleTask that auto-unpins completed tasks
  const handleToggleTask = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    const wasCompleted = task?.completed ?? false
    const taskTitle = task?.title || 'Task'

    await toggleTask(taskId)

    // If task is being completed (was not completed), auto-unpin it
    if (!wasCompleted) {
      // Silent unpin - won't error if not pinned
      await pinnedItems.unpin('task', taskId)
      
      // Add undo action
      undo.pushAction(`Completed "${taskTitle}"`, async () => {
        await toggleTask(taskId)
      })
    }
  }, [tasks, toggleTask, pinnedItems, undo])

  // Handler for adding linked prep/followup tasks from DetailPanel
  const handleAddLinkedTask = useCallback(async (
    title: string,
    linkedTo: { type: LinkedActivityType; id: string },
    linkType: 'prep' | 'followup',
    scheduledFor?: Date
  ) => {
    await addTask(
      title,
      undefined, // contactId
      undefined, // projectId
      scheduledFor ?? viewedDate, // Default to viewed date
      { linkedTo, linkType, assignedTo: getCurrentUserMember()?.id }
    )
  }, [addTask, viewedDate, getCurrentUserMember])

  // Handler for toggling a linked task's completion
  const handleToggleLinkedTask = useCallback(async (taskId: string) => {
    await toggleTask(taskId)
  }, [toggleTask])

  // Handler for deleting a linked task
  const handleDeleteLinkedTask = useCallback(async (taskId: string) => {
    await deleteTask(taskId)
  }, [deleteTask])

  // Wrapper for updateProject that auto-unpins when marked complete
  const handleUpdateProject = useCallback(async (id: string, updates: Partial<typeof projects[0]>) => {
    await updateProject(id, updates)

    // If project is being marked as completed, auto-unpin it
    if (updates.status === 'completed') {
      // Silent unpin - won't error if not pinned
      await pinnedItems.unpin('project', id)
    }
  }, [updateProject, pinnedItems])

  // Handle pin navigation
  const handlePinNavigate = useCallback((entityType: PinnableEntityType, entityId: string) => {
    switch (entityType) {
      case 'task':
        handleSelectItem(`task-${entityId}`)
        break
      case 'project':
        handleOpenProject(entityId)
        break
      case 'contact':
        handleOpenContact(entityId)
        break
      case 'routine':
        setSelectedRoutineId(entityId)
        setActiveView('routines')
        break
      case 'list':
        setSelectedListId(entityId)
        setActiveView('lists')
        break
    }
  }, [handleSelectItem, handleOpenProject, handleOpenContact])

  // Entity data for PinnedSection
  const pinnedEntities = useMemo(() => ({
    tasks,
    projects,
    contacts,
    routines: allRoutines,
    lists: lists.map(l => ({ id: l.id, name: l.title })),
  }), [tasks, projects, contacts, allRoutines, lists])

  if (authLoading || onboardingLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <p className="text-neutral-500">Loading...</p>
      </div>
    )
  }

  if (!user) {
    // Show login form for unauthenticated users
    return (
      <Suspense fallback={<LoadingFallback />}>
        <AuthForm />
      </Suspense>
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
        const taskId = await addTask(title, undefined, undefined, undefined, { assignedTo: getCurrentUserMember()?.id })
        if (taskId) {
          setRecentlyCreatedTaskId(taskId)
        }
      }}
      onQuickAddRich={async (data) => {
        const taskId = await addTask(
          data.title,
          data.contactId,
          data.projectId,
          data.scheduledFor,
          { assignedTo: getCurrentUserMember()?.id }
        )
        if (taskId) {
          setRecentlyCreatedTaskId(taskId)
        }
      }}
      quickAddProjects={projects.map(p => ({ id: p.id, name: p.name }))}
      quickAddContacts={contacts.map(c => ({ id: c.id, name: c.name }))}
      quickAddOpen={quickAddOpen}
      onOpenQuickAdd={openQuickAdd}
      onCloseQuickAdd={closeQuickAdd}
      activeView={activeView}
      onViewChange={handleViewChange}
      onOpenSearch={() => setSearchOpen(true)}
      pins={pinnedItems.pins}
      entities={pinnedEntities}
      onPinNavigate={handlePinNavigate}
      onPinMarkAccessed={pinnedItems.markAccessed}
      onPinRefreshStale={pinnedItems.refreshStale}
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
            onToggleComplete={handleToggleTask}
            onUpdateEventNote={updateNote}
            eventRecipeUrl={selectedEventRecipeUrl}
            onUpdateRecipeUrl={updateRecipeUrl}
            onOpenRecipe={setRecipeUrl}
            contact={selectedContact}
            contacts={contacts}
            onSearchContacts={searchContacts}
            onUpdateContact={updateContact}
            onOpenContact={handleOpenContact}
            onAddContact={addContact}
            project={selectedItemProject}
            projects={projects}
            onSearchProjects={searchProjects}
            onUpdateProject={handleUpdateProject}
            onOpenProject={handleOpenProject}
            onAddProject={addProject}
            onAddSubtask={addSubtask}
            onActionComplete={refreshDateInstances}
            prepTasks={tasks}
            onAddPrepTask={addPrepTask}
            onTogglePrepTask={handleToggleTask}
            attachments={selectedItemAttachments}
            onUploadAttachment={attachments.uploadAttachment}
            onDeleteAttachment={attachments.deleteAttachment}
            onOpenAttachment={async (attachment) => {
              const url = await attachments.getSignedUrl(attachment.storagePath)
              if (url) window.open(url, '_blank')
            }}
            isUploadingAttachment={attachments.isLoading}
            attachmentError={attachments.error}
            isPinned={selectedItem?.originalTask ? pinnedItems.isPinned('task', selectedItem.originalTask.id) : false}
            canPin={pinnedItems.canPin()}
            onPin={pinnedItems.pin}
            onUnpin={pinnedItems.unpin}
            linkedTasks={selectedItemLinkedTasks}
            onAddLinkedTask={handleAddLinkedTask}
            onToggleLinkedTask={handleToggleLinkedTask}
            onDeleteLinkedTask={handleDeleteLinkedTask}
            routine={selectedItemRoutine}
            onUpdateRoutine={updateRoutine}
          />
        )
      }
    >
      {activeView === 'home' && (
        <div className="h-full flex flex-col overflow-hidden">
          {/* Calendar connect banner if needed */}
          {!isConnected && (
            <div className="p-4 border-b border-neutral-100 shrink-0">
              <Suspense fallback={<LoadingFallback />}>
                <CalendarConnect />
              </Suspense>
            </div>
          )}

          {/* Home view with Today/Today+Context/Week */}
          <HomeView
            tasks={tasks}
            events={filteredEvents}
            routines={filteredRoutines}
            dateInstances={dateInstances}
            selectedItemId={selectedItemId}
            onSelectItem={handleSelectItem}
            onToggleTask={handleToggleTask}
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
              const routine = allRoutines.find(r => r.id === routineId)
              const routineName = routine?.name || 'Routine'

              if (completed) {
                await markDone('routine', routineId, viewedDate)
                undo.pushAction(`Completed "${routineName}"`, async () => {
                  await undoDone('routine', routineId, viewedDate)
                  refreshDateInstances()
                })
              } else {
                await undoDone('routine', routineId, viewedDate)
              }
              refreshDateInstances()
            }}
            onSkipRoutine={async (routineId) => {
              const routine = allRoutines.find(r => r.id === routineId)
              const routineName = routine?.name || 'Routine'

              await skip('routine', routineId, viewedDate)
              undo.pushAction(`Skipped "${routineName}"`, async () => {
                await undoDone('routine', routineId, viewedDate)
                refreshDateInstances()
              })
              refreshDateInstances()
            }}
            onPushRoutine={async (routineId, date) => {
              const routine = allRoutines.find(r => r.id === routineId)
              const routineName = routine?.name || 'Routine'

              await reschedule('routine', routineId, viewedDate, date)
              undo.pushAction(`Rescheduled "${routineName}"`, async () => {
                await undoDone('routine', routineId, viewedDate)
                refreshDateInstances()
              })
              refreshDateInstances()
            }}
            onCompleteEvent={async (eventId, completed) => {
              const event = events.find(e => (e.google_event_id || e.id) === eventId)
              const eventName = event?.title || 'Event'
              
              if (completed) {
                await markDone('calendar_event', eventId, viewedDate)
                undo.pushAction(`Completed "${eventName}"`, async () => {
                  await undoDone('calendar_event', eventId, viewedDate)
                  refreshDateInstances()
                })
              } else {
                await undoDone('calendar_event', eventId, viewedDate)
              }
              refreshDateInstances()
            }}
            onSkipEvent={async (eventId) => {
              const event = events.find(e => (e.google_event_id || e.id) === eventId)
              const eventName = event?.title || 'Event'

              await skip('calendar_event', eventId, viewedDate)
              undo.pushAction(`Skipped "${eventName}"`, async () => {
                await undoDone('calendar_event', eventId, viewedDate)
                refreshDateInstances()
              })
              refreshDateInstances()
            }}
            onPushEvent={async (eventId, date) => {
              const event = events.find(e => (e.google_event_id || e.id) === eventId)
              const eventName = event?.title || 'Event'

              await reschedule('calendar_event', eventId, viewedDate, date)
              undo.pushAction(`Rescheduled "${eventName}"`, async () => {
                await undoDone('calendar_event', eventId, viewedDate)
                refreshDateInstances()
              })
              refreshDateInstances()
            }}
            onOpenPlanning={() => setPlanningOpen(true)}
            onAddProject={addProject}
          />
        </div>
      )}

      {/* Planning Session - fullscreen overlay */}
      {planningOpen && (
        <PlanningSession
          tasks={tasks}
          events={events}
          routines={filteredRoutines}
          initialDate={viewedDate}
          onClose={() => setPlanningOpen(false)}
          onUpdateTask={updateTask}
          onPushTask={pushTask}
          familyMembers={familyMembers}
          eventNotesMap={eventNotesMap}
        />
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
            onToggleComplete={handleToggleTask}
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
            isPinned={pinnedItems.isPinned('contact', selectedContactForView.id)}
            canPin={pinnedItems.canPin()}
            onPin={() => pinnedItems.pin('contact', selectedContactForView.id)}
            onUnpin={() => pinnedItems.unpin('contact', selectedContactForView.id)}
          />
        </Suspense>
      )}

      {activeView === 'projects' && !selectedProjectId && (
        <Suspense fallback={<LoadingFallback />}>
          <ProjectsList
            projects={projects}
            tasks={tasks}
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
            onUpdateProject={handleUpdateProject}
            onDeleteProject={deleteProject}
            onAddTask={(title, projectId) => addTask(title, undefined, projectId, undefined, { assignedTo: getCurrentUserMember()?.id })}
            onSelectTask={handleSelectItem}
            onToggleTask={handleToggleTask}
            selectedTaskId={selectedItemId}
            isPinned={pinnedItems.isPinned('project', selectedProject.id)}
            canPin={pinnedItems.canPin()}
            onPin={() => pinnedItems.pin('project', selectedProject.id)}
            onUnpin={() => pinnedItems.unpin('project', selectedProject.id)}
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
            isPinned={pinnedItems.isPinned('routine', selectedRoutine.id)}
            canPin={pinnedItems.canPin()}
            onPin={() => pinnedItems.pin('routine', selectedRoutine.id)}
            onUnpin={() => pinnedItems.unpin('routine', selectedRoutine.id)}
          />
        </Suspense>
      )}

      {activeView === 'lists' && !selectedListId && (
        <ListsList
          lists={lists}
          listsByCategory={listsByCategory}
          onSelectList={setSelectedListId}
          onAddList={addList}
        />
      )}

      {activeView === 'lists' && selectedList && (
        <ListView
          list={selectedList}
          items={listItems}
          onBack={() => setSelectedListId(null)}
          onUpdateList={updateList}
          onDeleteList={deleteList}
          onAddItem={addListItem}
          onUpdateItem={updateListItem}
          onDeleteItem={deleteListItem}
          onReorderItems={reorderListItems}
          isPinned={pinnedItems.isPinned('list', selectedList.id)}
          canPin={pinnedItems.canPin()}
          onPin={() => pinnedItems.pin('list', selectedList.id)}
          onUnpin={() => pinnedItems.unpin('list', selectedList.id)}
        />
      )}

      {activeView === 'notes' && (
        <NotesPage
          notes={notes}
          notesByDate={notesByDate}
          topics={activeTopics}
          topicsMap={topicsMap}
          loading={notesLoading}
          onAddNote={async (content, topicId) => {
            return addNote({ content, topicId })
          }}
          onUpdateNote={async (id, updates) => {
            await updateNoteContent(id, updates)
          }}
          onDeleteNote={deleteNote}
          onAddTopic={async (name) => {
            return addTopic({ name })
          }}
          getEntityLinks={getEntityLinks}
        />
      )}

      {activeView === 'settings' && (
        <Suspense fallback={<LoadingFallback />}>
          <SettingsPage onBack={() => handleViewChange('home')} />
        </Suspense>
      )}

      {/* Search Modal */}
      <SearchModal
        isOpen={searchOpen}
        onClose={handleSearchClose}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        results={searchResults}
        totalResults={searchTotalResults}
        isSearching={isSearching}
        onSelectResult={handleSearchSelect}
      />
    </AppShell>
  )
}

export default App
