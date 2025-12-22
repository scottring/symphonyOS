import { useEffect, useState, useMemo, useCallback, Suspense } from 'react'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useAuth } from '@/hooks/useAuth'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { useEventNotes, type EventNote } from '@/hooks/useEventNotes'
import { useContacts } from '@/hooks/useContacts'
import { useProjects } from '@/hooks/useProjects'
import { useRoutines } from '@/hooks/useRoutines'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useLists } from '@/hooks/useLists'
import { useListItems } from '@/hooks/useListItems'
import { useNotes } from '@/hooks/useNotes'
import { useNoteTopics } from '@/hooks/useNoteTopics'
import type { Note, NoteEntityType } from '@/types/note'
import { useSearch, type SearchResult } from '@/hooks/useSearch'
import { useAttachments } from '@/hooks/useAttachments'
import { usePinnedItems } from '@/hooks/usePinnedItems'
import { useUndo } from '@/hooks/useUndo'
import { useToast } from '@/hooks/useToast'
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
import { CompletedTasksView } from '@/components/history/CompletedTasksView'
import { Toast } from '@/components/toast'
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
  const { isConnected, events, fetchEvents, isFetching: eventsFetching, createEvent, updateEvent, connect: connectCalendar } = useGoogleCalendar()
  const attachments = useAttachments()
  const { fetchAttachments } = attachments
  const pinnedItems = usePinnedItems()
  const undo = useUndo({ duration: 5000 })
  const { toast, showToast, dismissToast } = useToast()

  // Onboarding state
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null)
  const [onboardingLoading, setOnboardingLoading] = useState(true)
  const { fetchNote, fetchNotesForEvents, updateNote, updateEventAssignment, updateEventAssignmentAll, updateRecipeUrl, updateEventProject, getNote, getEventNotesForProject, notes: eventNotesMap } = useEventNotes()
  const { contacts, contactsMap, addContact, updateContact, deleteContact, searchContacts } = useContacts()
  const { projects, projectsMap, addProject, updateProject, deleteProject, searchProjects, recalculateProjectStatus } = useProjects()
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
  const { members: familyMembers, getCurrentUserMember, refetch: refetchFamilyMembers } = useFamilyMembers()
  const isOnline = useOnlineStatus()

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
    addEntityLink,
    removeEntityLink,
    getNotesForEntity,
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
    notes,
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

  // Calendar reconnect prompt state
  const [pendingEventData, setPendingEventData] = useState<{
    title: string
    contactId?: string
    projectId?: string
    scheduledFor?: Date
    category?: 'task' | 'chore' | 'errand' | 'event' | 'activity'
  } | null>(null)
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
          .maybeSingle()

        if (error) {
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
  }, [filteredRoutines, viewedDate, tasksLoading, routinesLoading, getLinkedTasks, addTask, getCurrentUserMember])

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
      fetchAttachments('task', taskId)
    } else if (selectedItemId?.startsWith('event-')) {
      const eventId = selectedItemId.replace('event-', '')
      fetchAttachments('event_note', eventId)
    }
  }, [selectedItemId, fetchAttachments])

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

  // Get assigned family members for selected event
  const selectedEventAssignedToAll = useMemo(() => {
    if (!selectedItem?.originalEvent) return []
    const eventId = selectedItem.originalEvent.google_event_id || selectedItem.originalEvent.id
    const eventNote = eventNotesMap.get(eventId)
    return eventNote?.assignedToAll ?? []
  }, [selectedItem, eventNotesMap])

  // Get linked project for selected event
  const selectedEventProjectId = useMemo(() => {
    if (!selectedItem?.originalEvent) return null
    const eventId = selectedItem.originalEvent.google_event_id || selectedItem.originalEvent.id
    const eventNote = eventNotesMap.get(eventId)
    return eventNote?.projectId ?? null
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

  // Linked event notes for selected project (stored with event metadata)
  const [linkedEventsForProject, setLinkedEventsForProject] = useState<EventNote[]>([])

  // Fetch linked event notes when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setLinkedEventsForProject([])
      return
    }

    // Get event notes linked to this project - they contain event title and start time
    getEventNotesForProject(selectedProjectId).then((eventNotes) => {
      setLinkedEventsForProject(eventNotes)
    })
  }, [selectedProjectId, getEventNotesForProject])

  // Get notes linked to selected project (ProjectView)
  const [selectedProjectNotes, setSelectedProjectNotes] = useState<Note[]>([])
  const [selectedProjectNotesLoading, setSelectedProjectNotesLoading] = useState(false)

  useEffect(() => {
    if (!selectedProject) {
      setSelectedProjectNotes([])
      return
    }
    setSelectedProjectNotesLoading(true)
    getNotesForEntity('project', selectedProject.id)
      .then(setSelectedProjectNotes)
      .finally(() => setSelectedProjectNotesLoading(false))
  }, [selectedProject?.id, getNotesForEntity])

  const handleAddProjectNote = useCallback(
    async (content: string, entityType: NoteEntityType, entityId: string) => {
      const note = await addNote({ content })
      if (note) {
        await addEntityLink(note.id, { entityType, entityId })
        // Refresh the project notes
        const updatedNotes = await getNotesForEntity('project', entityId)
        setSelectedProjectNotes(updatedNotes)
      }
    },
    [addNote, addEntityLink, getNotesForEntity]
  )

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

  // Get notes linked to selected contact (ContactView)
  const [selectedContactNotes, setSelectedContactNotes] = useState<Note[]>([])
  const [selectedContactNotesLoading, setSelectedContactNotesLoading] = useState(false)

  useEffect(() => {
    if (!selectedContactForView) {
      setSelectedContactNotes([])
      return
    }
    setSelectedContactNotesLoading(true)
    getNotesForEntity('contact', selectedContactForView.id)
      .then(setSelectedContactNotes)
      .finally(() => setSelectedContactNotesLoading(false))
  }, [selectedContactForView?.id, getNotesForEntity])

  const handleAddContactNote = useCallback(
    async (content: string, entityType: NoteEntityType, entityId: string) => {
      const note = await addNote({ content })
      if (note) {
        await addEntityLink(note.id, { entityType, entityId })
        // Refresh the contact notes
        const updatedNotes = await getNotesForEntity('contact', entityId)
        setSelectedContactNotes(updatedNotes)
      }
    },
    [addNote, addEntityLink, getNotesForEntity]
  )

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

  // Get notes linked to selected task (TaskView)
  const [selectedTaskNotes, setSelectedTaskNotes] = useState<Note[]>([])
  const [selectedTaskNotesLoading, setSelectedTaskNotesLoading] = useState(false)

  useEffect(() => {
    if (!selectedTask) {
      setSelectedTaskNotes([])
      return
    }
    setSelectedTaskNotesLoading(true)
    getNotesForEntity('task', selectedTask.id)
      .then(setSelectedTaskNotes)
      .finally(() => setSelectedTaskNotesLoading(false))
  }, [selectedTask?.id, getNotesForEntity])

  const handleAddTaskNote = useCallback(
    async (content: string, entityType: NoteEntityType, entityId: string) => {
      const note = await addNote({ content })
      if (note) {
        await addEntityLink(note.id, { entityType, entityId })
        // Refresh the task notes
        const updatedNotes = await getNotesForEntity('task', entityId)
        setSelectedTaskNotes(updatedNotes)
      }
    },
    [addNote, addEntityLink, getNotesForEntity]
  )

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
      case 'note':
        setActiveView('notes')
        break
    }
  }, [clearSearch, handleSelectItem, handleOpenProject, handleOpenContact])

  // Close search modal
  const handleSearchClose = useCallback(() => {
    setSearchOpen(false)
    clearSearch()
  }, [clearSearch])

  // Wrapper for toggleTask that auto-unpins completed tasks and recalculates project status
  const handleToggleTask = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    const wasCompleted = task?.completed ?? false
    const taskTitle = task?.title || 'Task'
    const projectId = task?.projectId

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

    // Recalculate project status if task belongs to a project
    if (projectId) {
      // Get updated tasks for this project (with the toggle applied)
      const projectTasks = tasks
        .filter(t => t.projectId === projectId)
        .map(t => t.id === taskId ? { ...t, completed: !wasCompleted } : t)
      await recalculateProjectStatus(projectId, projectTasks)
    }
  }, [tasks, toggleTask, pinnedItems, undo, recalculateProjectStatus])

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

  // Helper to format date for toast message
  const formatDateForToast = useCallback((date: Date): string => {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) return 'today'
    if (date.toDateString() === tomorrow.toDateString()) return 'tomorrow'

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }, [])

  // Wrapper for updateTask that shows toast when scheduling to future date
  const handleUpdateTaskWithToast = useCallback(async (
    id: string,
    updates: Parameters<typeof updateTask>[1]
  ) => {
    await updateTask(id, updates)

    // Show toast if scheduling to a future date (not today)
    if (updates.scheduledFor) {
      const scheduleDate = updates.scheduledFor
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const scheduleDateStart = new Date(scheduleDate)
      scheduleDateStart.setHours(0, 0, 0, 0)

      if (scheduleDateStart > today) {
        showToast(`Scheduled for ${formatDateForToast(scheduleDate)}`, 'info', 2500)
      }
    }
  }, [updateTask, showToast, formatDateForToast])

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
      userName={getCurrentUserMember()?.name}
      onSignOut={signOut}
      onQuickAdd={async (title) => {
        const taskId = await addTask(title, undefined, undefined, undefined, { assignedTo: getCurrentUserMember()?.id })
        if (taskId) {
          setRecentlyCreatedTaskId(taskId)
        }
      }}
      onQuickAddRich={async (data) => {
        // If it's an event and calendar is not connected, show reconnect prompt
        if (data.category === 'event' && data.scheduledFor && !isConnected) {
          setPendingEventData(data)
          return // Wait for user to decide in the prompt
        }

        // If it's an event and we have a date, also create in Google Calendar
        if (data.category === 'event' && data.scheduledFor && isConnected) {
          try {
            // Default to 1 hour event
            const startTime = new Date(data.scheduledFor)
            const endTime = new Date(startTime)
            endTime.setHours(endTime.getHours() + 1)

            await createEvent({
              title: data.title,
              startTime,
              endTime,
              // Use browser timezone
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            })

            // Refresh calendar events to show the new event
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const weekLater = new Date(today)
            weekLater.setDate(weekLater.getDate() + 7)
            await fetchEvents(today, weekLater)

            showToast('Event added to Google Calendar', 'success')
          } catch (err) {
            console.error('Failed to sync event to Google Calendar:', err)
            showToast('Event created locally (Calendar sync failed)', 'warning')
          }
        }

        // Always create the task/event locally in Symphony
        const taskId = await addTask(
          data.title,
          data.contactId,
          data.projectId,
          data.scheduledFor,
          {
            assignedTo: getCurrentUserMember()?.id,
            category: data.category,
          }
        )
        if (taskId) {
          setRecentlyCreatedTaskId(taskId)
        }
      }}
      onQuickAddNote={async (data) => {
        // Find topic by name if specified
        let topicId: string | undefined
        if (data.topicName) {
          const topic = activeTopics.find(t =>
            t.name.toLowerCase() === data.topicName?.toLowerCase()
          )
          topicId = topic?.id

          // If topic doesn't exist, create it
          if (!topicId) {
            const newTopic = await addTopic({ name: data.topicName })
            topicId = newTopic?.id
          }
        }

        // Create the note
        await addNote({ content: data.content, topicId })
        showToast('Note saved', 'success')
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
            onUpdateEventLocation={async (eventId: string, location: string | null, calendarId?: string) => {
              try {
                await updateEvent({ eventId, location, calendarId })
                showToast('Location updated successfully')
              } catch (error) {
                console.error('Failed to update event location:', error)
                showToast(error instanceof Error ? error.message : 'Failed to update location', 'warning')
              }
            }}
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
            familyMembers={familyMembers}
            eventAssignedToAll={selectedEventAssignedToAll}
            onUpdateEventAssignment={updateEventAssignmentAll}
            eventProjectId={selectedEventProjectId}
            onUpdateEventProject={updateEventProject}
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
            onUpdateTask={handleUpdateTaskWithToast}
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
              const task = tasks.find(t => t.id === taskId)
              const prevAssignedTo = task?.assignedTo
              const taskTitle = task?.title || 'Task'
              updateTask(taskId, { assignedTo: memberId ?? undefined })

              const memberName = memberId ? familyMembers.find(m => m.id === memberId)?.name : null
              const message = memberName ? `Assigned "${taskTitle}" to ${memberName}` : `Unassigned "${taskTitle}"`
              undo.pushAction(message, () => {
                updateTask(taskId, { assignedTo: prevAssignedTo ?? undefined })
              })
            }}
            onAssignTaskAll={(taskId, memberIds) => {
              const task = tasks.find(t => t.id === taskId)
              const prevAssignedToAll = task?.assignedToAll || []
              const prevAssignedTo = task?.assignedTo
              const taskTitle = task?.title || 'Task'
              updateTask(taskId, { assignedToAll: memberIds, assignedTo: memberIds[0] ?? undefined })

              const memberNames = memberIds.map(id => familyMembers.find(m => m.id === id)?.name).filter(Boolean)
              const message = memberIds.length > 0
                ? `Assigned "${taskTitle}" to ${memberNames.join(', ')}`
                : `Unassigned "${taskTitle}"`
              undo.pushAction(message, () => {
                updateTask(taskId, { assignedToAll: prevAssignedToAll, assignedTo: prevAssignedTo ?? undefined })
              })
            }}
            onAssignEvent={(eventId, memberId) => {
              updateEventAssignment(eventId, memberId)
            }}
            onAssignEventAll={(eventId, memberIds) => {
              updateEventAssignmentAll(eventId, memberIds)
            }}
            onAssignRoutine={(routineId, memberId) => {
              updateRoutine(routineId, { assigned_to: memberId })
            }}
            onAssignRoutineAll={(routineId, memberIds) => {
              updateRoutine(routineId, { assigned_to_all: memberIds, assigned_to: memberIds[0] ?? null })
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
            entityNotes={selectedTaskNotes}
            entityNotesLoading={selectedTaskNotesLoading}
            onAddEntityNote={handleAddTaskNote}
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
            entityNotes={selectedContactNotes}
            entityNotesLoading={selectedContactNotesLoading}
            onAddEntityNote={handleAddContactNote}
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
            onUpdateTask={handleUpdateTaskWithToast}
            familyMembers={familyMembers}
            selectedTaskId={selectedItemId}
            linkedEvents={linkedEventsForProject}
            isPinned={pinnedItems.isPinned('project', selectedProject.id)}
            canPin={pinnedItems.canPin()}
            onPin={() => pinnedItems.pin('project', selectedProject.id)}
            onUnpin={() => pinnedItems.unpin('project', selectedProject.id)}
            entityNotes={selectedProjectNotes}
            entityNotesLoading={selectedProjectNotesLoading}
            onAddEntityNote={handleAddProjectNote}
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

      {activeView === 'history' && (
        <CompletedTasksView
          tasks={tasks}
          contactsMap={contactsMap}
          projectsMap={projectsMap}
          onSelectTask={(taskId) => handleSelectItem(`task-${taskId}`)}
          onBack={() => handleViewChange('home')}
        />
      )}

      {activeView === 'notes' && (
        <NotesPage
          notes={notes}
          notesByDate={notesByDate}
          topics={activeTopics}
          topicsMap={topicsMap}
          loading={notesLoading}
          tasks={tasks}
          projects={projects}
          contacts={contacts}
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
          onAddEntityLink={async (noteId, entityType, entityId) => {
            await addEntityLink(noteId, { entityType, entityId })
          }}
          onRemoveEntityLink={removeEntityLink}
        />
      )}

      {activeView === 'settings' && (
        <Suspense fallback={<LoadingFallback />}>
          <SettingsPage
            onBack={() => {
              refetchFamilyMembers() // Refresh family members in case they were edited
              handleViewChange('home')
            }}
            onFamilyMembersChanged={refetchFamilyMembers}
          />
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

      {/* Toast notifications */}
      <Toast toast={toast} onDismiss={dismissToast} />

      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 shadow-md">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
          You're offline. Check your connection.
        </div>
      )}

      {/* Calendar reconnect prompt */}
      {pendingEventData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-scale-up">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-neutral-800 text-center mb-2">
              Calendar Not Connected
            </h3>
            <p className="text-sm text-neutral-500 text-center mb-6">
              Your Google Calendar is disconnected. This event will only be saved locally in Symphony and won't appear in your Google Calendar.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={async () => {
                  // Store the pending data before redirect
                  sessionStorage.setItem('pendingEventData', JSON.stringify({
                    ...pendingEventData,
                    scheduledFor: pendingEventData.scheduledFor?.toISOString(),
                  }))
                  await connectCalendar()
                }}
                className="w-full px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
              >
                Connect Google Calendar
              </button>
              <button
                onClick={async () => {
                  // Create event locally only
                  const data = pendingEventData
                  setPendingEventData(null)

                  const taskId = await addTask(
                    data.title,
                    data.contactId,
                    data.projectId,
                    data.scheduledFor,
                    {
                      assignedTo: getCurrentUserMember()?.id,
                      category: data.category,
                    }
                  )
                  if (taskId) {
                    setRecentlyCreatedTaskId(taskId)
                    showToast('Event saved locally (not in Google Calendar)', 'info')
                  }
                }}
                className="w-full px-4 py-3 border border-neutral-200 text-neutral-600 rounded-lg font-medium hover:bg-neutral-50 transition-colors"
              >
                Create Local Only
              </button>
              <button
                onClick={() => setPendingEventData(null)}
                className="w-full px-4 py-2 text-neutral-400 hover:text-neutral-600 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

export default App
