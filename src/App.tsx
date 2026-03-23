import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
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
import type { ListCategory } from '@/types/list'
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
import { DomainPageOutline } from '@/components/domain/DomainPageOutline'
import { AppShell } from '@/components/layout/AppShell'
import { HomeView } from '@/components/home'
import { useFocusMode } from '@/hooks/useFocusMode'
import { SearchModal } from '@/components/search/SearchModal'
import { LoadingFallback } from '@/components/layout/LoadingFallback'
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary'
import { Toast, ConfirmationToast, type ConfirmationToastMessage } from '@/components/toast'
import { UndoToast } from '@/components/undo/UndoToast'
import {
  ProjectsList,
  ProjectView,
  RoutinesList,
  RoutineForm,
  RoutineInput,
  TaskView,
  ContactView,
  ContactsList,
  RecipeViewer,
  CalendarConnect,
  OnboardingWizard,
  SettingsPage,
  AuthForm,
  GoalsList,
  GoalView,
  GoalPlanningChat,
  PlanningWorkspace,
  CoachingHub,
  QuickAssessment,
  DomainDetail,
  DeepAssessmentChat,
  RulesView,
  BlockEditor,
  WeeklyPlannerGrid,
  FocusMode,
  PlanningSession,
  DetailPanelRedesign as DetailPanel,
  ListsList,
  ListView,
  NotesPage,
  CompletedTasksView,
} from '@/components/lazy'
import { useGoals } from '@/hooks/useGoals'
import { useGoalMilestones } from '@/hooks/useGoalMilestones'
import { useGoalPlanning } from '@/hooks/useGoalPlanning'
import { usePlaybook } from '@/hooks/usePlaybook'
import { useIntelligenceLayers } from '@/hooks/useIntelligenceLayers'
import { useFamilyRules } from '@/hooks/useFamilyRules'
import { useResponsibilities } from '@/hooks/useResponsibilities'
import { usePlanningResources } from '@/hooks/usePlanningResources'
import { useResearchWorkspaces } from '@/hooks/useResearchWorkspaces'
import { useWeeklyFeedback } from '@/hooks/useWeeklyFeedback'
import { useAIPlaybookSuggestions } from '@/hooks/useAIPlaybookSuggestions'
import { useScheduleActions } from '@/hooks/useScheduleActions'
import { useDomainAssessments } from '@/hooks/useDomainAssessments'
import { useDomain } from '@/hooks/useDomain'
import { useCalendarDomainMappings } from '@/hooks/useCalendarDomainMappings'
import { getLayerConfig } from '@/config/layers'
import { useDeepAssessment } from '@/hooks/useDeepAssessment'
import { useEveningReflections } from '@/hooks/useEveningReflections'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'
import type { ViewType } from '@/components/layout/Sidebar'
import type { ActionableInstance, Routine } from '@/types/actionable'
import type { LinkedActivityType } from '@/types/task'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import { useHiddenCalendarEvents } from '@/hooks/useHiddenCalendarEvents'

function App() {
  const { tasks, loading: tasksLoading, addTask, addSubtask, addPrepTask, getLinkedTasks, toggleTask, toggleWaiting, deleteTask, updateTask, pushTask } = useSupabaseTasks()
  const { user, loading: authLoading, signOut } = useAuth()
  const { isConnected, events, fetchEvents, isFetching: eventsFetching, createEvent, updateEvent, connect: connectCalendar } = useGoogleCalendar()
  const attachments = useAttachments()
  const { fetchAttachments } = attachments
  const pinnedItems = usePinnedItems()
  const undo = useUndo({ duration: 5000 })
  const { toast, showToast, dismissToast } = useToast()
  const { isHidden: isEventHidden, hideEvent } = useHiddenCalendarEvents()
  const [confirmationToast, setConfirmationToast] = useState<ConfirmationToastMessage | null>(null)

  // Onboarding state
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null)
  const [onboardingLoading, setOnboardingLoading] = useState(true)
  const { fetchNote, fetchNotesForEvents, updateNote, updateEventAssignment, updateEventAssignmentAll, updateRecipeUrl, updateEventProject, getNote, getEventNotesForProject, updateEventContext, notes: eventNotesMap } = useEventNotes()
  const { contacts, contactsMap, addContact, updateContact, deleteContact, searchContacts } = useContacts()
  const { projects, projectsMap, addProject, updateProject, deleteProject, searchProjects, recalculateProjectStatus } = useProjects()
  const {
    areas: goalAreas,
    goals,
    addArea: addGoalArea,
    deleteArea: deleteGoalArea,
    addGoal,
    updateGoal,
    deleteGoal,
    addAction: addGoalAction,
    updateAction: updateGoalAction,
    toggleAction: toggleGoalAction,
    deleteAction: deleteGoalAction,
    getGoalById,
    getCurrentQuarter,
    addMilestoneLocal,
    updateMilestoneLocal,
    removeMilestoneLocal,
  } = useGoals()
  const { addMilestone: addGoalMilestone, updateMilestone: updateGoalMilestone, updateProgress: updateMilestoneProgress, deleteMilestone: deleteGoalMilestone } = useGoalMilestones({
    addMilestoneLocal,
    updateMilestoneLocal,
    removeMilestoneLocal,
  })
  const goalPlanning = useGoalPlanning()
  const [planningGoalId, setPlanningGoalId] = useState<string | null>(null)
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
  const focusMode = useFocusMode()

  // Intelligence Layers + Playbook
  const { layersWithAssessments: layersList } = useIntelligenceLayers()
  const playbook = usePlaybook()
  const { getDomainForCalendar } = useCalendarDomainMappings()

  // Evening Reflections
  const eveningReflections = useEveningReflections()

  // Event context overrides: extract from event notes map
  const eventContextOverrides = useMemo(() => {
    const overrides = new Map<string, import('@/types/task').TaskContext>()
    for (const [eventId, note] of eventNotesMap) {
      if (note.context) {
        overrides.set(eventId, note.context)
      }
    }
    return overrides
  }, [eventNotesMap])

  // Weekly Review — track which week is being reviewed
  const [reviewWeekOf, setReviewWeekOf] = useState(() => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday
    const monday = new Date(now)
    monday.setDate(diff)
    return monday.toISOString().split('T')[0]
  })
  const weeklyFeedback = useWeeklyFeedback(reviewWeekOf)
  const aiSuggestions = useAIPlaybookSuggestions()

  // Family Rules
  const familyRules = useFamilyRules()
  const responsibilities = useResponsibilities()

  // Deep Assessment (AI chat per domain)
  const deepAssessment = useDeepAssessment()

  // Planning Resources + Research Workspaces
  const planningResources = usePlanningResources()
  const researchWorkspaces = useResearchWorkspaces()

  // Coaching state
  const [activeLayerSlug, setActiveLayerSlug] = useState<string | null>(null)
  const [coachingNavStack, setCoachingNavStack] = useState<('hub' | 'rules' | 'assessment' | 'domain' | 'deep-assessment' | 'research' | 'review' | 'playbook')[]>(['hub'])
  const coachingSubView = coachingNavStack[coachingNavStack.length - 1]
  const [activeDomainSlug, setActiveDomainSlug] = useState<string | null>(null)

  // Block editing from timeline
  const [timelineEditingBlock, setTimelineEditingBlock] = useState<import('@/types/playbook').PlaybookBlock | null>(null)

  // Get the DB ID for the active layer (needed for assessment/deep-assessment sub-views)
  const activeLayerDbId = useMemo(() => {
    if (!activeLayerSlug) return null
    const match = layersList.find(l => l.layer.slug === activeLayerSlug)
    return match?.layer.id ?? null
  }, [activeLayerSlug, layersList])

  const activeLayerConfig = useMemo(() => {
    if (!activeLayerSlug) return null
    return getLayerConfig(activeLayerSlug)
  }, [activeLayerSlug])

  // Coaching navigation helpers (stack-based for proper back behavior)
  const pushCoachingView = useCallback((view: typeof coachingSubView) => {
    setCoachingNavStack(prev => [...prev, view])
  }, [])

  const popCoachingView = useCallback(() => {
    setCoachingNavStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev)
  }, [])

  // Fetch ALL assessments across all layers for the coaching hub
  const domainAssessments = useDomainAssessments()
  const { currentDomain } = useDomain()

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
  // URL-based navigation
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<{ projectId?: string; routineId?: string; contactId?: string; goalId?: string }>()

  // State for non-URL-routed views
  const [stateView, setStateView] = useState<'today' | 'lists' | 'notes' | 'history' | 'rules' | 'coaching' | 'settings' | 'task-detail' | null>(null)

  // Derive view from URL path or state
  const activeView: ViewType = useMemo(() => {
    // State-based views take precedence
    if (stateView) return stateView

    // URL-based views
    const path = location.pathname
    if (path.startsWith('/goals')) return 'goals'
    if (path.startsWith('/projects')) return 'projects'
    if (path.startsWith('/routines')) return 'routines'
    if (path === '/contacts') return 'contacts'
    if (path.startsWith('/contacts/')) return 'contact-detail'
    return 'today'
  }, [location.pathname, stateView])

  // Get IDs from URL params
  const selectedProjectId = params.projectId || null
  const selectedRoutineId = params.routineId || null
  const selectedContactId = params.contactId || null
  const selectedGoalId = params.goalId || null
  const creatingRoutine = location.pathname === '/routines/new'
  const [, setRecentlyCreatedTaskId] = useState<string | null>(null)
  const [planningOpen, setPlanningOpen] = useState(false)

  // Toggle quick add modal
  const openQuickAdd = useCallback(() => setQuickAddOpen(true), [])
  const closeQuickAdd = useCallback(() => setQuickAddOpen(false), [])

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('symphony-sidebar-collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  // Check onboarding status — only on initial load, not on auth token refreshes.
  // This prevents the wizard from unmounting mid-conversation when Supabase
  // refreshes the auth token and a transient error would flip onboardingComplete.
  const onboardingChecked = useRef(false)
  useEffect(() => {
    if (onboardingChecked.current) return // Only check once
    async function checkOnboarding() {
      if (!user) {
        setOnboardingLoading(false)
        return
      }

      onboardingChecked.current = true

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
      // Cmd+/ for search (Cmd+J conflicts with Chrome Downloads)
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
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

  // Auto-open QuickCapture from URL parameter (for Action Button shortcut)
  // Store intent in sessionStorage to preserve through auth flow
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('quickadd') === 'true') {
      sessionStorage.setItem('symphony:quickadd', 'true')
      // Clean URL immediately
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Open QuickCapture when app is ready (after auth/onboarding)
  useEffect(() => {
    if (user && onboardingComplete === true) {
      const shouldOpenQuickAdd = sessionStorage.getItem('symphony:quickadd')
      if (shouldOpenQuickAdd === 'true') {
        sessionStorage.removeItem('symphony:quickadd')
        // Small delay to ensure app is fully rendered
        setTimeout(() => setQuickAddOpen(true), 100)
      }
    }
  }, [user, onboardingComplete])

  // Redirect to join page if user just authenticated and has a pending join token
  useEffect(() => {
    if (user) {
      const joinToken = sessionStorage.getItem('symphony-join-token')
      if (joinToken) {
        sessionStorage.removeItem('symphony-join-token')
        navigate(`/join/${joinToken}`)
      }
    }
  }, [user, navigate])

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

  // Schedule action handlers (assign, complete, skip, push for tasks/events/routines)
  const scheduleActions = useScheduleActions({
    tasks,
    events,
    allRoutines,
    familyMembers,
    viewedDate,
    updateTask,
    updateRoutine,
    updateEventAssignment,
    updateEventAssignmentAll,
    markDone,
    undoDone,
    skip,
    reschedule,
    refreshDateInstances,
    pushAction: undo.pushAction,
  })

  // Open weekly review from Sunday nudge banner
  const handleOpenWeeklyReview = useCallback(() => {
    setStateView('coaching')
    setCoachingNavStack(['hub', 'review'])
    navigate('/')
  }, [navigate])

  // Day type override state (localStorage-persisted, keyed by date)
  const [dayTypeOverrides, setDayTypeOverrides] = useState<Record<string, import('@/types/playbook').DayType>>(() => {
    try {
      const stored = localStorage.getItem('symphony-daytype-overrides')
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  })

  // Compute effective day type for the viewed date
  const effectiveDayType = useMemo((): import('@/types/playbook').DayType => {
    const dateStr = viewedDate.toISOString().split('T')[0]
    if (dayTypeOverrides[dateStr]) return dayTypeOverrides[dateStr]
    const dayOfWeek = viewedDate.getDay()
    return (dayOfWeek === 0 || dayOfWeek === 6) ? 'weekend' : 'school-day'
  }, [viewedDate, dayTypeOverrides])

  const handleDayTypeChange = useCallback((newDayType: import('@/types/playbook').DayType) => {
    const dateStr = viewedDate.toISOString().split('T')[0]
    setDayTypeOverrides((prev) => {
      const updated = { ...prev, [dateStr]: newDayType }
      localStorage.setItem('symphony-daytype-overrides', JSON.stringify(updated))
      return updated
    })
    // Re-instantiate playbook with new day type
    playbook.instantiateDay(dateStr, newDayType)
  }, [viewedDate, playbook])

  // Fetch playbook instances when viewed date changes + instantiate day
  useEffect(() => {
    if (playbook.loading) return
    const dateStr = viewedDate.toISOString().split('T')[0]
    playbook.fetchInstancesForDate(dateStr).then(() => {
      playbook.instantiateDay(dateStr, effectiveDayType)
    })
  }, [viewedDate, playbook.loading, playbook.blocks.length, effectiveDayType])

  // Filter events to exclude skipped/completed items
  const filteredEvents = useMemo(() => {
    // Build a map of entity_id -> status for quick lookup
    const statusMap = new Map<string, string>()
    for (const instance of dateInstances) {
      if (instance.entity_type === 'calendar_event') {
        statusMap.set(instance.entity_id, instance.status)
      }
    }

    // Filter out events that are skipped, deferred, or permanently hidden
    return events.filter((event) => {
      const eventId = event.google_event_id || event.id
      // Remove permanently hidden recurring events
      if (isEventHidden(eventId)) return false
      const status = statusMap.get(eventId)
      // Remove if skipped or deferred
      return status !== 'skipped' && status !== 'deferred'
    })
  }, [events, dateInstances, isEventHidden])

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

    // Find routines that were deferred TO this date (any status — includes completed/skipped)
    const deferredToThisDate = new Set<string>()
    const viewedDateStr = viewedDate.toISOString().split('T')[0]
    for (const instance of dateInstances) {
      if (
        instance.entity_type === 'routine' &&
        instance.deferred_to &&
        (instance.date as string) !== viewedDateStr // Only cross-day deferrals
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
      // Add user's notes from event_notes table
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

  // Get routine for routine view
  const selectedRoutine = useMemo(() => {
    if (!selectedRoutineId) return null
    return allRoutines.find(r => r.id === selectedRoutineId) ?? null
  }, [selectedRoutineId, allRoutines])

  // Handle view change - clear selections when switching views
  const handleViewChange = useCallback((view: ViewType) => {
    setSelectedItemId(null)
    setSelectedTaskId(null)
    setSelectedListId(null)
    setRecipeUrl(null)

    // Handle URL-based views
    if (view === 'home' || view === 'today') {
      setStateView('today')
      navigate('/')
    } else if (view === 'goals') {
      setStateView(null)
      navigate('/goals')
    } else if (view === 'projects') {
      setStateView(null)
      navigate('/projects')
    } else if (view === 'routines') {
      setStateView(null)
      navigate('/routines')
    } else if (view === 'contacts' || view === 'contact-detail') {
      setStateView(null)
      navigate('/contacts')
    }
    // Handle state-based views
    else if (view === 'lists' || view === 'notes' || view === 'history' || view === 'rules' || view === 'coaching' || view === 'settings' || view === 'task-detail') {
      if (view === 'coaching') setCoachingNavStack(['hub'])
      setStateView(view)
      navigate('/') // Navigate to home URL but show state view
    } else {
      setStateView(null)
      navigate('/') // fallback
    }
  }, [navigate])

  // Handle opening a project from detail panel
  const handleOpenProject = useCallback((projectId: string) => {
    setSelectedItemId(null)
    setSelectedTaskId(null)
    setRecipeUrl(null)
    navigate(`/projects/${projectId}`)
  }, [navigate])

  // Handle opening a contact (from TaskView, DetailPanel, etc.)
  const handleOpenContact = useCallback((contactId: string) => {
    setSelectedItemId(null)
    setSelectedTaskId(null)
    setRecipeUrl(null)
    navigate(`/contacts/${contactId}`)
  }, [navigate])

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
        navigate(`/routines/${result.id}`)
        break
      case 'list':
        setSelectedListId(result.id)
        setStateView('lists')
        break
      case 'note':
        setStateView('notes')
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

  // Handler for creating a follow-up task after completing a task
  const handleCreateFollowUp = useCallback(async (title: string, sourceTaskId: string) => {
    const sourceTask = tasks.find(t => t.id === sourceTaskId)
    if (!sourceTask) return

    await addTask(
      title,
      sourceTask.contactId, // Inherit contact
      sourceTask.projectId, // Inherit project
      viewedDate, // Schedule for today
      {
        assignedTo: sourceTask.assignedTo ?? getCurrentUserMember()?.id,
        context: sourceTask.context,
        category: sourceTask.category,
      }
    )
  }, [tasks, addTask, viewedDate, getCurrentUserMember])

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

  // Handler for sending inbox task to list
  const handleSendToList = useCallback(async (taskId: string, listId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    const list = lists.find(l => l.id === listId)
    if (!list) return

    // We need to use the hook for the specific list
    // For now, directly call the Supabase API since we can't use hooks conditionally
    const { error } = await supabase
      .from('list_items')
      .insert({
        user_id: user?.id,
        list_id: listId,
        text: task.title,
        note: task.notes || null,
        sort_order: 0, // Add to top
      })

    if (error) {
      console.error('Failed to create list item:', error)
      showToast('Failed to send to list', 'warning')
      return
    }

    // Delete original task
    await deleteTask(taskId)

    // Show success toast
    showToast(`Sent to ${list.title}`, 'success')
  }, [tasks, lists, deleteTask, showToast, user])

  // Handler for creating new list during triage
  const handleCreateListInTriage = useCallback(async (
    title: string,
    category: ListCategory
  ): Promise<string | null> => {
    // Use addList hook which handles optimistic updates
    const newList = await addList({
      title,
      category,
      visibility: 'self',
    })

    if (!newList) {
      showToast('Failed to create list', 'warning')
      return null
    }

    showToast(`Created "${title}"`, 'success')
    return newList.id
  }, [addList, showToast])

  // Helper to format date for toast message
  const formatDateForToast = useCallback((date: Date): string => {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) return 'today'
    if (date.toDateString() === tomorrow.toDateString()) return 'tomorrow'

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }, [])

  // Wrapper for updateTask that shows toast when scheduling to future date or confirmation for past date
  const handleUpdateTaskWithToast = useCallback(async (
    id: string,
    updates: Parameters<typeof updateTask>[1]
  ) => {
    // Check if scheduling to a past date
    if (updates.scheduledFor) {
      const scheduleDate = updates.scheduledFor
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const scheduleDateStart = new Date(scheduleDate)
      scheduleDateStart.setHours(0, 0, 0, 0)

      // Past date - show confirmation
      if (scheduleDateStart < today) {
        setConfirmationToast({
          id: Math.random().toString(36).substring(7),
          message: `Schedule to ${formatDateForToast(scheduleDate)}? This is in the past.`,
          actions: [
            {
              label: 'Confirm',
              variant: 'secondary',
              onClick: async () => {
                await updateTask(id, updates)
                showToast(`Scheduled for ${formatDateForToast(scheduleDate)}`, 'info', 2500)
              },
            },
            {
              label: 'Schedule & Complete',
              variant: 'primary',
              onClick: async () => {
                await updateTask(id, { ...updates, completed: true })
                showToast(`Completed and scheduled for ${formatDateForToast(scheduleDate)}`, 'success', 2500)
              },
            },
          ],
        })
        return
      }

      // Future date or today - proceed normally
      await updateTask(id, updates)

      if (scheduleDateStart > today) {
        showToast(`Scheduled for ${formatDateForToast(scheduleDate)}`, 'info', 2500)
      }
    } else {
      // No date change, proceed normally
      await updateTask(id, updates)
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
        navigate(`/routines/${entityId}`)
        break
      case 'list':
        setSelectedListId(entityId)
        setStateView('lists')
        break
    }
  }, [handleSelectItem, handleOpenProject, handleOpenContact, navigate])

  // Entity data for PinnedSection
  const pinnedEntities = useMemo(() => ({
    tasks,
    projects,
    contacts,
    routines: allRoutines,
    lists: lists.map(l => ({ id: l.id, name: l.title })),
  }), [tasks, projects, contacts, allRoutines, lists])

  // Bundle schedule actions + reference data into context to eliminate prop drilling
  // Defined before early returns to satisfy rules-of-hooks
  const scheduleActionsValue: ScheduleActionsValue = useMemo(() => ({
    // Task actions
    onToggleTask: handleToggleTask,
    onToggleWaiting: toggleWaiting,
    onUpdateTask: handleUpdateTaskWithToast,
    onPushTask: pushTask,
    onDeleteTask: deleteTask,
    onCreateTask: async (title: string) => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      await addTask(title, undefined, undefined, today, {
        assignedTo: getCurrentUserMember()?.id,
        context: currentDomain !== 'universal' ? currentDomain : undefined,
      })
    },
    onCreateFollowUp: handleCreateFollowUp,

    // Assignment actions
    onAssignTask: scheduleActions.onAssignTask,
    onAssignTaskAll: scheduleActions.onAssignTaskAll,
    onAssignEvent: scheduleActions.onAssignEvent,
    onAssignEventAll: scheduleActions.onAssignEventAll,
    onAssignRoutine: scheduleActions.onAssignRoutine,
    onAssignRoutineAll: scheduleActions.onAssignRoutineAll,

    // Routine actions
    onCompleteRoutine: scheduleActions.onCompleteRoutine,
    onSkipRoutine: scheduleActions.onSkipRoutine,
    onPushRoutine: scheduleActions.onPushRoutine,
    onUpdateRoutine: updateRoutine,

    // Event actions
    onCompleteEvent: scheduleActions.onCompleteEvent,
    onSkipEvent: scheduleActions.onSkipEvent,
    onPushEvent: scheduleActions.onPushEvent,
    onUpdateEventContext: updateEventContext,
    onHideEvent: hideEvent,

    // Playbook
    playbookInstances: playbook.instances,
    onPlaybookToggleItem: playbook.toggleItem,
    onPlaybookMarkDone: playbook.markBlockDone,
    onPlaybookReact: playbook.reactToBlock,
    onPlaybookTag: playbook.tagBlock,
    onPlaybookNote: playbook.noteBlock,
    onPlaybookEdit: (block: import('@/types/playbook').PlaybookBlock | undefined) => block && setTimelineEditingBlock(block),
    onPlaybookDelete: playbook.deleteBlock,
    onPlaybookSuppress: playbook.suppressBlock,

    // Reference data
    contactsMap,
    projectsMap,
    projects,
    contacts,
    familyMembers,
    lists,
    listsByCategory,
    eventNotesMap,
    activeRules: familyRules.rules.filter(r => r.status === 'active'),
    eventContextOverrides,

    // List/contact actions
    onSendToList: handleSendToList,
    onCreateList: handleCreateListInTriage,
    onAddProject: addProject,
    onSearchContacts: searchContacts,
    onAddContact: (name: string, details?: { phone?: string; category?: import('@/types/contact').ContactCategory }) => addContact({ name, ...details }),
    onOpenProject: handleOpenProject,
    onOpenPlanning: () => setPlanningOpen(true),

    // Calendar domain mapping
    getDomainForCalendar,

    // Day type
    dayType: effectiveDayType,
    onDayTypeChange: handleDayTypeChange,

    // Evening reflections
    onSaveReflection: eveningReflections.saveReflection,
    todayReflection: eveningReflections.todayReflection,

    // Navigation
    onOpenWeeklyReview: handleOpenWeeklyReview,
    onRefreshInstances: refreshDateInstances,
  }), [
    handleToggleTask, toggleWaiting, handleUpdateTaskWithToast, pushTask, deleteTask, addTask, getCurrentUserMember, currentDomain, handleCreateFollowUp,
    scheduleActions, updateRoutine, updateEventContext, hideEvent,
    playbook.instances, playbook.toggleItem, playbook.markBlockDone, playbook.reactToBlock,
    playbook.tagBlock, playbook.noteBlock, playbook.deleteBlock, playbook.suppressBlock,
    contactsMap, projectsMap, projects, contacts, familyMembers, lists, listsByCategory,
    eventNotesMap, familyRules.rules, eventContextOverrides,
    handleSendToList, handleCreateListInTriage, addProject, searchContacts, addContact,
    handleOpenProject, getDomainForCalendar, effectiveDayType, handleDayTypeChange,
    eveningReflections.saveReflection, eveningReflections.todayReflection,
    handleOpenWeeklyReview, refreshDateInstances,
  ])

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
      focusModeOpen={focusMode.isOpen}
      userEmail={user.email ?? undefined}
      userName={getCurrentUserMember()?.name}
      onSignOut={signOut}
      onQuickAdd={async (title) => {
        const taskId = await addTask(title, undefined, undefined, undefined, {
          assignedTo: getCurrentUserMember()?.id,
          context: currentDomain !== 'universal' ? currentDomain : undefined,
        })
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

        // If it's an event and we have a date, create in Google Calendar only
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
            return // Don't create local task - event is in Google Calendar
          } catch (err) {
            console.error('Failed to sync event to Google Calendar:', err)
            showToast('Event created locally (Calendar sync failed)', 'warning')
            // Fall through to create local task as fallback
          }
        }

        // Create task/event locally for non-events or when calendar not connected
        // Use explicit assignment from -name syntax, or default to current user
        const explicitAssignment = data.assignedMemberIds?.length
          ? data.assignedMemberIds[0]
          : getCurrentUserMember()?.id
        const taskId = await addTask(
          data.title,
          data.contactId,
          data.projectId,
          data.scheduledFor,
          {
            assignedTo: explicitAssignment,
            assignedToAll: data.assignedMemberIds?.length && data.assignedMemberIds.length > 1
              ? data.assignedMemberIds
              : undefined,
            category: data.category,
            context: data.context,
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
      quickAddFamilyMembers={familyMembers.map(m => ({ id: m.id, name: m.name }))}
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
          <Suspense fallback={<LoadingFallback variant="card" />}>
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
              onHideEvent={hideEvent}
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
              activeRules={familyRules.rules.filter(r => r.status === 'active')}
              blocks={playbook.blocks}
              onAddBlock={async (input) => {
                const block = await playbook.addBlock(input)
                if (block) {
                  const dateStr = new Date().toISOString().split('T')[0]
                  await playbook.instantiateDay(dateStr, effectiveDayType)
                  // Ensure coaching is visible on the timeline
                  localStorage.setItem('symphony-hide-coaching', 'false')
                  window.dispatchEvent(new CustomEvent('symphony-show-coaching'))
                  showToast('Coaching block added to timeline')
                } else {
                  showToast('Failed to create coaching block — check console', 'warning')
                }
                return block
              }}
              onUpdateBlock={async (id, updates) => {
                await playbook.updateBlock(id, updates)
                const dateStr = new Date().toISOString().split('T')[0]
                // Refresh instances + create any missing ones
                await playbook.fetchInstancesForDate(dateStr)
                await playbook.instantiateDay(dateStr, effectiveDayType)
                // Ensure coaching is visible on the timeline
                localStorage.setItem('symphony-hide-coaching', 'false')
                window.dispatchEvent(new CustomEvent('symphony-show-coaching'))
              }}
              onOpenBlockEditor={(prefill) => setTimelineEditingBlock(prefill as import('@/types/playbook').PlaybookBlock)}
            />
          </Suspense>
        )
      }
    >
      <DomainPageOutline>
        <SectionErrorBoundary sectionName="Content" onReset={() => handleViewChange('today')}>
          {activeView === 'today' && (
            <div className="h-full flex flex-col overflow-hidden">
              {/* Calendar connect banner if needed */}
              {!isConnected && (
                <div className="p-4 border-b border-neutral-100 shrink-0">
                  <Suspense fallback={<LoadingFallback />}>
                    <CalendarConnect />
                  </Suspense>
                </div>
              )}

              {/* Zone 3: Today's schedule */}
              <ScheduleActionsProvider value={scheduleActionsValue}>
                <HomeView
                  tasks={tasks}
                  events={filteredEvents}
                  routines={filteredRoutines}
                  projects={projects}
                  dateInstances={dateInstances}
                  selectedItemId={selectedItemId}
                  onSelectItem={handleSelectItem}
                  loading={tasksLoading || eventsFetching || routinesLoading}
                  viewedDate={viewedDate}
                  onDateChange={setViewedDate}
                  currentUserMemberId={getCurrentUserMember()?.id}
                />
              </ScheduleActionsProvider>
            </div>
          )}

          {/* Block Editor modal (from timeline overflow menu) */}
          {timelineEditingBlock && (
            <Suspense fallback={<LoadingFallback />}>
              <BlockEditor
                block={timelineEditingBlock}
                onSave={async (input) => {
                  if ('id' in input) {
                    await playbook.updateBlock(input.id, input.updates)
                  }
                  setTimelineEditingBlock(null)
                }}
                onDelete={async (id) => {
                  await playbook.deleteBlock(id)
                  setTimelineEditingBlock(null)
                }}
                onClose={() => setTimelineEditingBlock(null)}
              />
            </Suspense>
          )}

          {/* Planning Session - fullscreen overlay */}
          {planningOpen && (
            <Suspense fallback={<LoadingFallback />}>
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
            </Suspense>
          )}

          {activeView === 'task-detail' && selectedTask && (
            <Suspense fallback={<LoadingFallback />}>
              <TaskView
                task={selectedTask}
                onBack={() => {
                  setSelectedTaskId(null)
                  setStateView(null)
                }}
                onUpdate={updateTask}
                onDelete={(id) => {
                  deleteTask(id)
                  setSelectedTaskId(null)
                  setStateView(null)
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

          {activeView === 'contacts' && (
            <Suspense fallback={<LoadingFallback />}>
              <ContactsList
                contacts={contacts}
                onSelectContact={(contactId) => navigate(`/contacts/${contactId}`)}
                onBack={() => navigate('/')}
                onAddContact={addContact}
                onDeleteContact={deleteContact}
              />
            </Suspense>
          )}

          {activeView === 'contact-detail' && selectedContactForView && (
            <Suspense fallback={<LoadingFallback />}>
              <ContactView
                contact={selectedContactForView}
                onBack={() => {
                  navigate('/contacts')
                }}
                onUpdate={updateContact}
                onDelete={async (id) => {
                  await deleteContact(id)
                  navigate('/contacts')
                }}
                tasks={tasks}
                onSelectTask={(taskId) => {
                  setSelectedTaskId(taskId)
                  setStateView('task-detail')
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
                projects={currentDomain === 'universal' ? projects : projects.filter(p => p.context === currentDomain)}
                tasks={tasks}
                onSelectProject={(id) => navigate(`/projects/${id}`)}
                onAddProject={(project) => addProject({ ...project, context: currentDomain !== 'universal' ? currentDomain : undefined })}
              />
            </Suspense>
          )}

          {activeView === 'projects' && selectedProject && (
            <Suspense fallback={<LoadingFallback />}>
              <ProjectView
                project={selectedProject}
                tasks={tasks}
                contactsMap={contactsMap}
                onBack={() => navigate('/projects')}
                onUpdateProject={handleUpdateProject}
                onDeleteProject={deleteProject}
                onAddTask={(title, projectId) => addTask(title, undefined, projectId, undefined, { assignedTo: getCurrentUserMember()?.id })}
                onDeleteTask={deleteTask}
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
              />
            </Suspense>
          )}

          {activeView === 'goals' && !selectedGoalId && (
            <Suspense fallback={<LoadingFallback />}>
              <GoalsList
                areas={goalAreas}
                goals={currentDomain === 'universal' ? goals : goals.filter(g => g.context === currentDomain)}
                currentQuarter={getCurrentQuarter()}
                year={new Date().getFullYear()}
                onSelectGoal={(id) => navigate(`/goals/${id}`)}
                onAddArea={addGoalArea}
                onAddGoal={(areaId, name) => addGoal(areaId, name, currentDomain !== 'universal' ? currentDomain : undefined)}
                onToggleAction={toggleGoalAction}
                onDeleteArea={deleteGoalArea}
              />
            </Suspense>
          )}

          {activeView === 'goals' && selectedGoalId && getGoalById(selectedGoalId) && !planningGoalId && (
            <Suspense fallback={<LoadingFallback />}>
              <GoalView
                goal={getGoalById(selectedGoalId)!}
                area={goalAreas.find(a => a.id === getGoalById(selectedGoalId)!.areaId)}
                currentQuarter={getCurrentQuarter()}
                onBack={() => navigate('/goals')}
                onUpdateGoal={updateGoal}
                onDeleteGoal={deleteGoal}
                onAddAction={addGoalAction}
                onUpdateAction={updateGoalAction}
                onToggleAction={toggleGoalAction}
                onDeleteAction={deleteGoalAction}
                onStartPlanning={() => {
                  setPlanningGoalId(selectedGoalId)
                  const g = getGoalById(selectedGoalId)
                  if (g) {
                    const areaName = goalAreas.find(a => a.id === g.areaId)?.name
                    goalPlanning.startPlanning(g.id, g.name, g.notes, areaName)
                  }
                }}
                onAddMilestone={addGoalMilestone}
                onUpdateMilestone={updateGoalMilestone}
                onUpdateMilestoneProgress={updateMilestoneProgress}
                onDeleteMilestone={deleteGoalMilestone}
              />
            </Suspense>
          )}

          {activeView === 'goals' && planningGoalId && (
            <Suspense fallback={<LoadingFallback />}>
              <GoalPlanningChat
                goalName={getGoalById(planningGoalId)?.name ?? 'Goal'}
                messages={goalPlanning.messages}
                loading={goalPlanning.loading}
                readyToFinish={goalPlanning.readyToFinish}
                planningResult={goalPlanning.planningResult}
                error={goalPlanning.error}
                onStart={() => {
                  const g = getGoalById(planningGoalId)
                  if (g) {
                    const areaName = goalAreas.find(a => a.id === g.areaId)?.name
                    goalPlanning.startPlanning(g.id, g.name, g.notes, areaName)
                  }
                }}
                onSend={goalPlanning.sendMessage}
                onFinish={goalPlanning.finishPlanning}
                onBack={() => {
                  setPlanningGoalId(null)
                  goalPlanning.reset()
                }}
                onAcceptBlock={async (block) => {
                  await playbook.addBlock({
                    label: block.label,
                    blockType: block.blockType as 'solo' | 'routine' | 'connection' | 'together',
                    timeSlot: block.timeSlot,
                    narrative: block.narrative,
                    coachingNote: block.coachingNote ?? null,
                    items: (block.items ?? []).map(item => ({
                      who: item.who,
                      action: item.action,
                      context: item.context,
                      coaching: item.coaching,
                    })),
                    dayTypes: block.dayTypes as ('school-day' | 'weekend' | 'holiday' | 'half-day')[],
                    goalId: planningGoalId,
                  })
                }}
                onDone={() => {
                  setPlanningGoalId(null)
                  goalPlanning.reset()
                }}
              />
            </Suspense>
          )}

          {activeView === 'routines' && !selectedRoutineId && !creatingRoutine && (
            <Suspense fallback={<LoadingFallback />}>
              <RoutinesList
                routines={currentDomain === 'universal' ? allRoutines : allRoutines.filter(r => r.context === currentDomain)}
                contacts={contacts}
                familyMembers={familyMembers}
                onSelectRoutine={(routine) => navigate(`/routines/${routine.id}`)}
                onCreateRoutine={() => navigate('/routines/new')}
                onUpdateRoutine={updateRoutine}
              />
            </Suspense>
          )}

          {activeView === 'routines' && creatingRoutine && (
            <div className="h-full overflow-auto">
              <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-3 p-6 pb-0">
                  <button
                    onClick={() => navigate('/routines')}
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
                      await addRoutine({ ...input, context: currentDomain !== 'universal' ? currentDomain : undefined })
                      navigate('/routines')
                    }}
                    onCancel={() => navigate('/routines')}
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
                onBack={() => navigate('/routines')}
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
            <Suspense fallback={<LoadingFallback />}>
              <ListsList
                lists={lists}
                listsByCategory={listsByCategory}
                onSelectList={setSelectedListId}
                onAddList={addList}
              />
            </Suspense>
          )}

          {activeView === 'lists' && selectedList && (
            <Suspense fallback={<LoadingFallback />}>
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
            </Suspense>
          )}

          {activeView === 'history' && (
            <Suspense fallback={<LoadingFallback />}>
              <CompletedTasksView
                tasks={tasks}
                contactsMap={contactsMap}
                projectsMap={projectsMap}
                onSelectTask={(taskId) => handleSelectItem(`task-${taskId}`)}
                onBack={() => handleViewChange('today')}
              />
            </Suspense>
          )}

          {activeView === 'notes' && (
            <Suspense fallback={<LoadingFallback />}>
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
                onNavigateToTask={(taskId) => handleSelectItem(`task-${taskId}`)}
              />
            </Suspense>
          )}

          {activeView === 'rules' && (
            <Suspense fallback={<LoadingFallback />}>
              <RulesView
                rules={familyRules.rules}
                responsibilities={responsibilities.responsibilities}
                onAddRule={familyRules.addRule}
                onUpdateRule={familyRules.updateRule}
                onDeleteRule={familyRules.deleteRule}
                onAddResponsibility={responsibilities.addResponsibility}
                getResponsibilitiesForRule={responsibilities.getForRule}
                loading={familyRules.loading}
                onBack={() => handleViewChange('settings')}
              />
            </Suspense>
          )}

          {activeView === 'coaching' && (
            <SectionErrorBoundary sectionName="Coaching" onReset={() => setCoachingNavStack(['hub'])}>
              <Suspense fallback={<LoadingFallback />}>
                {coachingSubView === 'hub' && (
                  <CoachingHub
                    assessments={domainAssessments.assessments}
                    assessmentsLoading={domainAssessments.loading}
                    rules={familyRules.rules.filter(r => r.status === 'active')}
                    workspaces={researchWorkspaces.workspaces}
                    blocks={playbook.blocks}
                    onOpenRules={() => pushCoachingView('rules')}
                    onOpenResearch={() => pushCoachingView('research')}
                    onOpenWeeklyReview={() => pushCoachingView('review')}
                    onOpenPlaybook={() => pushCoachingView('playbook')}
                    onOpenAssessment={(layerSlug) => {
                      setActiveLayerSlug(layerSlug)
                      pushCoachingView('assessment')
                    }}
                    onOpenDomain={(layerSlug, domainSlug) => {
                      setActiveLayerSlug(layerSlug)
                      setActiveDomainSlug(domainSlug)
                      pushCoachingView('domain')
                    }}
                  />
                )}

                {coachingSubView === 'assessment' && activeLayerConfig && (
                  <QuickAssessment
                    config={activeLayerConfig}
                    existingAssessments={domainAssessments.assessments}
                    onSave={(ratings) => domainAssessments.saveQuickAssessment(ratings, activeLayerDbId || undefined)}
                    onBack={popCoachingView}
                  />
                )}

                {coachingSubView === 'domain' && activeDomainSlug && activeLayerConfig && (() => {
                  const domainConfig = activeLayerConfig.domains.find(d => d.slug === activeDomainSlug)
                  const assessment = domainAssessments.getAssessment(activeDomainSlug)
                  if (!domainConfig || !assessment) {
                    return (
                      <QuickAssessment
                        config={activeLayerConfig}
                        existingAssessments={domainAssessments.assessments}
                        onSave={(ratings) => domainAssessments.saveQuickAssessment(ratings, activeLayerDbId || undefined)}
                        onBack={popCoachingView}
                      />
                    )
                  }
                  return (
                    <DomainDetail
                      domain={domainConfig}
                      assessment={assessment}
                      accentColor={activeLayerConfig.accentColor}
                      onBack={popCoachingView}
                      onReassess={() => pushCoachingView('assessment')}
                      onGoDeeper={() => {
                        pushCoachingView('deep-assessment')
                      }}
                    />
                  )
                })()}

                {coachingSubView === 'deep-assessment' && activeDomainSlug && activeLayerConfig && (() => {
                  const domainConfig = activeLayerConfig.domains.find(d => d.slug === activeDomainSlug)
                  const quickAssessment = domainAssessments.getAssessment(activeDomainSlug)
                  if (!domainConfig) return null
                  return (
                    <DeepAssessmentChat
                      config={activeLayerConfig}
                      domain={domainConfig}
                      quickAssessment={quickAssessment ?? undefined}
                      messages={deepAssessment.messages}
                      loading={deepAssessment.loading}
                      readyToFinish={deepAssessment.readyToFinish}
                      result={deepAssessment.result}
                      error={deepAssessment.error}
                      onStart={() => {
                        deepAssessment.start({
                          layerId: activeLayerDbId || '',
                          layerName: activeLayerConfig.name,
                          domainSlug: activeDomainSlug,
                          domainName: domainConfig.name,
                          domainSubtitle: domainConfig.subtitle,
                          quickAssessment: quickAssessment ?? undefined,
                        })
                      }}
                      onSend={deepAssessment.respond}
                      onFinish={deepAssessment.finish}
                      onBack={() => {
                        deepAssessment.reset()
                        popCoachingView()
                      }}
                      onDone={() => {
                        domainAssessments.refetch()
                        deepAssessment.reset()
                        popCoachingView()
                      }}
                    />
                  )
                })()}

                {coachingSubView === 'rules' && (
                  <RulesView
                    rules={familyRules.rules}
                    responsibilities={responsibilities.responsibilities}
                    onAddRule={familyRules.addRule}
                    onUpdateRule={familyRules.updateRule}
                    onDeleteRule={familyRules.deleteRule}
                    onAddResponsibility={responsibilities.addResponsibility}
                    getResponsibilitiesForRule={responsibilities.getForRule}
                    loading={familyRules.loading}
                    onBack={popCoachingView}
                    title="Rules"
                    description="Coaching guidance across all domains"
                    crossLayerMode
                  />
                )}

                {coachingSubView === 'research' && (
                  <Suspense fallback={<LoadingFallback />}>
                    <PlanningWorkspace
                      resources={planningResources.resources}
                      loading={planningResources.loading}
                      onAddResource={planningResources.addResource}
                      onUpdateResource={planningResources.updateResource}
                      onDeleteResource={planningResources.deleteResource}
                      onUploadFile={planningResources.uploadFile}
                      onGetSignedUrl={planningResources.getSignedUrl}
                      workspaces={researchWorkspaces.workspaces}
                      workspacesLoading={researchWorkspaces.loading}
                      onCreateWorkspace={researchWorkspaces.addWorkspace}
                      onUpdateWorkspace={researchWorkspaces.updateWorkspace}
                      onDeleteWorkspace={researchWorkspaces.deleteWorkspace}
                      onMarkWorkspaceSynthesized={researchWorkspaces.markSynthesized}
                      rules={familyRules.rules}
                      onAddRule={familyRules.addRule}
                      onUpdateRule={familyRules.updateRule}
                      onDeleteRule={familyRules.deleteRule}
                      onViewPublishedRules={() => pushCoachingView('rules')}
                      weeklyReview={{
                        blockSummaries: weeklyFeedback.blockSummaries,
                        overallStats: weeklyFeedback.overallStats,
                        flaggedBlocks: weeklyFeedback.flaggedBlocks,
                        feedbackLoading: weeklyFeedback.loading,
                        weekOf: reviewWeekOf,
                        onWeekChange: setReviewWeekOf,
                        blocks: playbook.blocks,
                        onAddBlock: playbook.addBlock,
                        onUpdateBlock: playbook.updateBlock,
                        onDeleteBlock: playbook.deleteBlock,
                        onReorderBlocks: playbook.reorderBlocks,
                        aiResult: aiSuggestions.result,
                        aiLoading: aiSuggestions.loading,
                        aiError: aiSuggestions.error,
                        onGenerateAI: aiSuggestions.generateSuggestions,
                        onAcceptSuggestion: aiSuggestions.acceptSuggestion,
                        onRejectSuggestion: aiSuggestions.rejectSuggestion,
                      }}
                      onBack={popCoachingView}
                      initialTab="research"
                    />
                  </Suspense>
                )}

                {coachingSubView === 'review' && (
                  <Suspense fallback={<LoadingFallback />}>
                    <PlanningWorkspace
                      resources={planningResources.resources}
                      loading={planningResources.loading}
                      onAddResource={planningResources.addResource}
                      onUpdateResource={planningResources.updateResource}
                      onDeleteResource={planningResources.deleteResource}
                      onUploadFile={planningResources.uploadFile}
                      onGetSignedUrl={planningResources.getSignedUrl}
                      workspaces={researchWorkspaces.workspaces}
                      workspacesLoading={researchWorkspaces.loading}
                      onCreateWorkspace={researchWorkspaces.addWorkspace}
                      onUpdateWorkspace={researchWorkspaces.updateWorkspace}
                      onDeleteWorkspace={researchWorkspaces.deleteWorkspace}
                      onMarkWorkspaceSynthesized={researchWorkspaces.markSynthesized}
                      rules={familyRules.rules}
                      onAddRule={familyRules.addRule}
                      onUpdateRule={familyRules.updateRule}
                      onDeleteRule={familyRules.deleteRule}
                      onViewPublishedRules={() => pushCoachingView('rules')}
                      weeklyReview={{
                        blockSummaries: weeklyFeedback.blockSummaries,
                        overallStats: weeklyFeedback.overallStats,
                        flaggedBlocks: weeklyFeedback.flaggedBlocks,
                        feedbackLoading: weeklyFeedback.loading,
                        weekOf: reviewWeekOf,
                        onWeekChange: setReviewWeekOf,
                        blocks: playbook.blocks,
                        onAddBlock: playbook.addBlock,
                        onUpdateBlock: playbook.updateBlock,
                        onDeleteBlock: playbook.deleteBlock,
                        onReorderBlocks: playbook.reorderBlocks,
                        aiResult: aiSuggestions.result,
                        aiLoading: aiSuggestions.loading,
                        aiError: aiSuggestions.error,
                        onGenerateAI: aiSuggestions.generateSuggestions,
                        onAcceptSuggestion: aiSuggestions.acceptSuggestion,
                        onRejectSuggestion: aiSuggestions.rejectSuggestion,
                      }}
                      onBack={popCoachingView}
                      initialTab="weekly-review"
                    />
                  </Suspense>
                )}

                {coachingSubView === 'playbook' && (
                  <WeeklyPlannerGrid
                    blocks={playbook.blocks}
                    onAddBlock={playbook.addBlock}
                    onUpdateBlock={playbook.updateBlock}
                    onDeleteBlock={playbook.deleteBlock}
                    onBack={popCoachingView}
                  />
                )}
              </Suspense>
            </SectionErrorBoundary>
          )}

          {activeView === 'settings' && (
            <Suspense fallback={<LoadingFallback />}>
              <SettingsPage
                onBack={() => {
                  refetchFamilyMembers() // Refresh family members in case they were edited
                  handleViewChange('today')
                }}
                onFamilyMembersChanged={refetchFamilyMembers}
                onImportBlocks={async (blocks) => {
                  for (const block of blocks) {
                    await playbook.addBlock(block)
                  }
                }}
              />
            </Suspense>
          )}
        </SectionErrorBoundary>

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
        <ConfirmationToast
          toast={confirmationToast}
          onDismiss={() => setConfirmationToast(null)}
        />
        <UndoToast
          action={undo.currentAction}
          onUndo={undo.executeUndo}
          onDismiss={undo.dismiss}
        />

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
      </DomainPageOutline>

      {/* Focus Mode - scratch pad */}
      <Suspense fallback={null}>
        <FocusMode
          isOpen={focusMode.isOpen}
          onClose={focusMode.close}
          onAddNote={addNote}
          onUpdateNote={updateNoteContent}
          notes={notes.filter((n): n is Note => !n.sourceTaskId)}
        />
      </Suspense>

    </AppShell>
  )
}

export default App
