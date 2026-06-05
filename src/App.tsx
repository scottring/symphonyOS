import { useEffect, useState, useMemo, useCallback, Suspense } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { useEventNotes, type EventNote } from '@/hooks/useEventNotes'
import { useContacts } from '@/hooks/useContacts'
import { useProjects } from '@/hooks/useProjects'
import { useRoutines } from '@/hooks/useRoutines'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import type { ListCategory } from '@/types/list'
import type { Note, NoteEntityType } from '@/types/note'
import { GoalsProvider, useGoalsContext } from '@/contexts/GoalsContext'
import type { GoalAction } from '@/types/goal'
import { ListsProvider, useListsContext } from '@/contexts/ListsContext'
import { NotesProvider, useNotesContext } from '@/contexts/NotesContext'
import { GeneratePlanProvider } from '@/contexts/GeneratePlanContext'
import { useSearch, type SearchResult } from '@/hooks/useSearch'
import { useAttachments } from '@/hooks/useAttachments'
import { usePinnedItems } from '@/hooks/usePinnedItems'
import { useUndo } from '@/hooks/useUndo'
import { useToast } from '@/hooks/useToast'
import type { PinnableEntityType } from '@/types/pin'
import { supabase } from '@/lib/supabase'
import { sundayOfWeek } from '@/lib/weekHelpers'
import { detectContextSharingChange } from '@/lib/contextSharingToast'
import { SHOW_PLANNED_MEALS_ON_TIMELINE } from '@/lib/mealsVisibility'
import { convertTaskToProject } from '@/lib/convertTaskToProject'
import { groupTasks, groupItems, removeFromGroup, ungroupTasks, deleteTaskGroup } from '@/lib/today/groupTasks'
import { DomainPageOutline } from '@/components/domain/DomainPageOutline'
import { ViewRouter } from '@/components/layout/ViewRouter'
import { AppShell, type PanelTab } from '@/components/layout/AppShell'
import { AuthGate } from '@/components/auth/AuthGate'
import { useFocusMode } from '@/hooks/useFocusMode'
import { SearchModal } from '@/components/search/SearchModal'
import { LoadingFallback } from '@/components/layout/LoadingFallback'
import { Toast, ConfirmationToast, type ConfirmationToastMessage } from '@/components/toast'
import { UndoToast } from '@/components/undo/UndoToast'
import { InboxUndoToast } from '@/components/schedule/InboxUndoToast'
import { type TimelineCaptureResult } from '@/components/schedule/TimelineQuickInput'
import {
  RecipeViewer,
  FocusMode,
} from '@/components/lazy'
import type { User } from '@supabase/supabase-js'
import { useScheduleActions } from '@/hooks/useScheduleActions'
import { useDomain } from '@/hooks/useDomain'
import { useCalendarDomainMappings } from '@/hooks/useCalendarDomainMappings'
import { useDetailPanelState } from '@/hooks/useDetailPanelState'
import { useScheduleFiltering } from '@/hooks/useScheduleFiltering'
import type { ViewType } from '@/components/layout/Sidebar'
import type { LinkedActivityType, TaskLink, Task, TaskContext, GroupMemberRef } from '@/types/task'
import { useHiddenCalendarEvents } from '@/hooks/useHiddenCalendarEvents'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { CalendarReconnectError, type CalendarEvent } from '@/hooks/useGoogleCalendar'
import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant'
import { useVaultWrite } from '@/hooks/useVaultWrite'
import { useMeetingNotes } from '@/hooks/useMeetingNotes'
import {
  TapContextPanel,
  TapEventPanel,
  TapMealPanel,
  TapRoutinePanel,
} from '@/components/surface'

function App() {
  return (
    <AuthGate>
      {({ user, signOut }) => (
        <GoalsProvider>
          <ListsProvider>
            <NotesProvider>
              <GeneratePlanProvider>
                <AppContent user={user} signOut={signOut} />
              </GeneratePlanProvider>
            </NotesProvider>
          </ListsProvider>
        </GoalsProvider>
      )}
    </AuthGate>
  )
}

function AppContent({ user, signOut }: { user: User; signOut: () => void }) {
  const { tasks, loading: tasksLoading, refetch: refetchTasks, addTask, addSubtask, getLinkedTasks, toggleTask, toggleWaiting, deleteTask, updateTask, pushTask, setBucket } = useSupabaseTasks()
  const { goals, getCurrentQuarter } = useGoalsContext()
  const { isConnected, events, fetchEvents, isFetching: eventsFetching, createEvent, updateEvent, deleteEvent, removeEventLocal, restoreEventLocal, connect: connectCalendar } = useGoogleCalendar()
  const attachments = useAttachments()
  const { fetchAttachments } = attachments
  const pinnedItems = usePinnedItems()
  const undo = useUndo()
  const { toast, showToast, dismissToast } = useToast()
  const { isHidden: isEventHidden, hideEvent } = useHiddenCalendarEvents()
  const assistant = useSymphonyAssistant(refetchTasks)
  const vaultWrite = useVaultWrite()
  const [chatOpen, setChatOpen] = useState(false)
  const [activePanelTab, setActivePanelTab] = useState<PanelTab>('details')
  const [confirmationToast, setConfirmationToast] = useState<ConfirmationToastMessage | null>(null)
  const [tlUndo, setTlUndo] = useState<{ message: string; onUndo: () => void } | null>(null)
  const dismissTlUndo = useCallback(() => setTlUndo(null), [])
  const runTlUndo = useCallback(() => { setTlUndo(prev => { prev?.onUndo(); return null }) }, [])

  const { fetchNote, fetchNotesForEvents, updateNote, updateEventAssignment, updateEventAssignmentAll, updateEventProject, getNote, getEventNotesForProject, updateEventContext, notes: eventNotesMap } = useEventNotes()
  const { contacts, contactsMap, addContact, updateContact, deleteContact, searchContacts } = useContacts()
  const { projects, projectsMap, addProject, updateProject, deleteProject, recalculateProjectStatus } = useProjects()
  const meetingNotes = useMeetingNotes(contacts, tasks)

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

  const { getDomainForCalendar, getCalendarForDomain } = useCalendarDomainMappings()

  // From contexts
  const { lists, listsByCategory, setSelectedListId, addList } = useListsContext()
  const { notes, addNote, deleteNote, appendToNote, updateNote: updateNoteContent, addEntityLink, getNotesForEntity, activeTopics, addTopic } = useNotesContext()

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

  const { currentDomain } = useDomain()

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

  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('symphony-sidebar-collapsed')
    return stored === 'true'
  })
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [viewedDate, setViewedDate] = useState(() => new Date())

  // ── Meal-plan entries synthesized as CalendarEvent objects ────────────
  // Lifted to App.tsx so they flow into BOTH HomeView's timeline rendering
  // AND useDetailPanelState's lookup (which finds events by id).
  const mealWeekStartForEvents = useMemo(() => sundayOfWeek(viewedDate), [viewedDate])
  const { plan: mealPlanForEvents } = useMealPlan(mealWeekStartForEvents)
  const { recipes: mealRecipesForEvents } = useRecipes()
  const mealEvents = useMemo<CalendarEvent[]>(() => {
    // Planned meals paused from the timeline until the planner is set up
    // properly (see mealsVisibility.ts). Flip the flag to resurface them.
    if (!SHOW_PLANNED_MEALS_ON_TIMELINE) return []
    if (!mealPlanForEvents) return []
    const SLOT_TIMES: Record<string, [number, number]> = {
      breakfast: [7, 30], lunch: [12, 30], snack: [15, 30], dinner: [18, 30], prep: [16, 0],
      lunch_iris: [12, 30], lunch_scott: [12, 30], kid_alternate: [18, 30],
    }
    const currentMemberId = getCurrentUserMember()?.id ?? null
    const memberById = new Map(familyMembers.map(m => [m.id, m]))
    const recipeTitleById = new Map(mealRecipesForEvents.map(r => [r.id, r.title]))
    // Iterate all 7 days of the meal plan week so Week / Workweek views see
    // meals on every day, not just viewedDate. weekStart is Sunday-anchored
    // (sundayOfWeek of viewedDate) so dayOfWeek 0..6 maps directly to
    // weekStart + dow days.
    const groups = new Map<string, { dow: number; slot: string; title: string; entryIds: string[] }>()
    for (const e of mealPlanForEvents.entries) {
      if (!SLOT_TIMES[e.slot]) continue
      // Per-user filter: show family-shared (null), self, or kids (members without auth_user_id).
      if (e.familyMemberId != null) {
        const isCurrent = e.familyMemberId === currentMemberId
        const target = memberById.get(e.familyMemberId)
        const isKid = target ? !target.auth_user_id : false
        if (!isCurrent && !isKid) continue
      }
      const title = e.recipeId ? (recipeTitleById.get(e.recipeId) ?? '(unnamed)') : (e.adHocTitle ?? '(unnamed)')
      const key = `${e.dayOfWeek}|${e.slot}|${title}`
      const existing = groups.get(key)
      if (existing) existing.entryIds.push(e.id)
      else groups.set(key, { dow: e.dayOfWeek, slot: e.slot, title, entryIds: [e.id] })
    }
    const out: CalendarEvent[] = []
    for (const [, { dow, slot, title, entryIds }] of groups) {
      const [hh, mm] = SLOT_TIMES[slot]!
      const dayDate = new Date(mealWeekStartForEvents)
      dayDate.setDate(dayDate.getDate() + dow)
      const start = new Date(dayDate); start.setHours(hh, mm, 0, 0)
      const end = new Date(start.getTime() + 45 * 60 * 1000)
      const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1)
      out.push({
        id: `meal:${entryIds[0]}`,
        title: `${slotLabel} · ${title}`,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        all_day: false,
        calendar_name: 'Meals',
        calendar_color: '#0F8A4A',
      })
    }
    return out
  }, [mealPlanForEvents, mealRecipesForEvents, mealWeekStartForEvents, familyMembers, getCurrentUserMember])
  const eventsWithMeals = useMemo(() => [...events, ...mealEvents], [events, mealEvents])

  // Reset to today at midnight
  useEffect(() => {
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const msUntilMidnight = tomorrow.getTime() - now.getTime()

    const timeout = setTimeout(() => {
      setViewedDate(new Date())
    }, msUntilMidnight)

    return () => clearTimeout(timeout)
  }, [viewedDate])

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
  const params = useParams<{ projectId?: string; routineId?: string; contactId?: string; memberId?: string; taskId?: string }>()

  // State for non-URL-routed views
  const [stateView, setStateView] = useState<'agent' | 'today' | 'inbox' | 'lists' | 'history' | 'settings' | 'weekly-planning' | null>(null)

  // Derive view from URL path or state
  const activeView: ViewType = useMemo(() => {
    // State-based views take precedence
    if (stateView) return stateView

    // URL-based views
    const path = location.pathname
    if (path === '/inbox') return 'inbox'
    if (path.startsWith('/goals')) return 'goals'
    if (path.startsWith('/projects')) return 'projects'
    if (path.startsWith('/routines')) return 'routines'
    if (path === '/contacts') return 'contacts'
    if (path.startsWith('/contacts/')) return 'contact-detail'
    if (path.startsWith('/family/')) return 'family-member'
    if (path.startsWith('/meals')) return 'meals'
    if (path.startsWith('/home')) return 'home-app'
    if (path === '/morning') return 'morning'
    if (path === '/bedtime') return 'bedtime'
    return 'today'
  }, [location.pathname, stateView])

  // Get IDs from URL params
  const selectedProjectId = params.projectId || null
  const selectedRoutineId = params.routineId || null
  const selectedContactId = params.contactId || null
  const urlTaskId = params.taskId || null
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

  // Deep-link: /task/:taskId opens the task in the side panel
  useEffect(() => {
    if (urlTaskId) {
      setSelectedItemId(`task-${urlTaskId}`)
    }
  }, [urlTaskId])

  // When the URL changes to a path that maps to a URL-based view, clear
  // any state-based view so in-app <Link> navigation isn't trapped inside
  // a state view (e.g. Inbox → "Fill in →" /home/asset/:id).
  useEffect(() => {
    const path = location.pathname
    const isUrlBased =
      path === '/inbox' ||
      path.startsWith('/goals') ||
      path.startsWith('/projects') ||
      path.startsWith('/routines') ||
      path.startsWith('/contacts') ||
      path.startsWith('/family') ||
      path.startsWith('/meals') ||
      path.startsWith('/home') ||
      path === '/morning' ||
      path === '/bedtime'
    if (isUrlBased && stateView !== null) setStateView(null)
  }, [location.pathname, stateView])

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
      if (e.key === 'Escape' && !searchOpen) {
        if (selectedItemId) setSelectedItemId(null)
        if (chatOpen) setChatOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedItemId, chatOpen, searchOpen])

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
  // AppContent only renders when user is authenticated and onboarding is complete
  useEffect(() => {
    const shouldOpenQuickAdd = sessionStorage.getItem('symphony:quickadd')
    if (shouldOpenQuickAdd === 'true') {
      sessionStorage.removeItem('symphony:quickadd')
      // Small delay to ensure app is fully rendered
      setTimeout(() => setQuickAddOpen(true), 100)
    }
  }, [])

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

  // Fetch calendar events when connected or date changes. Range is wider
  // than a single day so Week / Workweek / Month views see events on every
  // visible day, not just viewedDate. The Google Calendar fetch is cheap
  // enough to cover ±7 days around viewedDate.
  useEffect(() => {
    if (isConnected) {
      const rangeStart = new Date(viewedDate)
      rangeStart.setHours(0, 0, 0, 0)
      rangeStart.setDate(rangeStart.getDate() - 7)
      const rangeEnd = new Date(viewedDate)
      rangeEnd.setHours(23, 59, 59, 999)
      rangeEnd.setDate(rangeEnd.getDate() + 7)
      fetchEvents(rangeStart, rangeEnd)
    }
  }, [isConnected, viewedDate, fetchEvents])

  const { filteredEvents, filteredRoutines, dateInstances, refreshDateInstances } = useScheduleFiltering({
    viewedDate,
    events: eventsWithMeals,
    allRoutines,
    getRoutinesForDate,
    getInstancesForDate,
    isEventHidden,
    tasksLoading,
    routinesLoading,
    getLinkedTasks,
    addTask,
    getCurrentUserMember,
  })

  // Schedule action handlers (assign, complete, skip, push for tasks/events/routines)
  const scheduleActions = useScheduleActions({
    tasks,
    events,
    allRoutines,
    familyMembers,
    viewedDate,
    updateTask,
    updateRoutine,
    deleteRoutine,
    updateEventAssignment,
    updateEventAssignmentAll,
    markDone,
    undoDone,
    skip,
    reschedule,
    refreshDateInstances,
    pushAction: undo.pushAction,
  })

  const {
    selectedItem,
  } = useDetailPanelState({
    selectedItemId,
    tasks,
    events: eventsWithMeals,
    allRoutines,
    viewedDate,
    dateInstances,
    getNote,
    eventNotesMap,
    contactsMap,
    projectsMap,
    getLinkedTasks,
    fetchNote,
    fetchAttachments,
    getAttachments: attachments.getAttachments,
  })

  // Batch fetch event notes for all visible events (for info icon display)
  useEffect(() => {
    if (filteredEvents.length > 0) {
      const eventIds = filteredEvents.map((e) => e.google_event_id || e.id)
      fetchNotesForEvents(eventIds)
    }
  }, [filteredEvents, fetchNotesForEvents])

  // Get project for project view
  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null
    return projectsMap.get(selectedProjectId) ?? null
  }, [selectedProjectId, projectsMap])

  const selectedMember = useMemo(() => {
    const memberId = params.memberId
    if (!memberId) return null
    return familyMembers.find((m) => m.id === memberId) ?? null
  }, [params.memberId, familyMembers])

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
    } else if (view === 'meals') {
      setStateView(null)
      navigate('/meals/plan')
    } else if (view === 'home-app') {
      setStateView(null)
      navigate('/home')
    }
    // Handle state-based views
    else if (view === 'agent' || view === 'inbox' || view === 'lists' || view === 'history' || view === 'settings') {
      setStateView(view)
      navigate('/') // Navigate to home URL but show state view
    } else if (view === 'weekly-planning') {
      setStateView('weekly-planning')
      navigate('/')
    } else {
      setStateView(null)
      navigate('/') // fallback
    }
  }, [navigate])

  // Handle opening a project from detail panel
  const handleOpenProject = useCallback((projectId: string) => {
    setSelectedItemId(null)
    setRecipeUrl(null)
    navigate(`/projects/${projectId}`)
  }, [navigate])

  // Handle opening a contact (from TaskView, DetailPanel, etc.)
  const handleOpenContact = useCallback((contactId: string) => {
    setSelectedItemId(null)
    setRecipeUrl(null)
    navigate(`/contacts/${contactId}`)
  }, [navigate])

  // Open a family member's detail page (self-click → today)
  const handleOpenMember = useCallback((memberId: string) => {
    if (memberId === getCurrentUserMember()?.id) {
      setStateView(null)
      navigate('/')
      return
    }
    setSelectedItemId(null)
    setRecipeUrl(null)
    navigate(`/family/${memberId}`)
  }, [navigate, getCurrentUserMember])

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
      return
    }

    // All item types (tasks, events, routines) use DetailPanel
    setSelectedItemId(itemId)
    setRecipeUrl(null)
    // When selecting an item, switch to details tab
    setActivePanelTab('details')
  }, [])

  // Dismiss panel — called when clicking empty space in main content
  const handleDismissPanel = useCallback(() => {
    setSelectedItemId(null)
    setChatOpen(false)
  }, [])

  // Handle chat open — auto-switch to AI tab
  const handleChatOpenChange = useCallback((open: boolean) => {
    setChatOpen(open)
    if (open) setActivePanelTab('ai')
  }, [])

  // "Save to vault": promote a task's notes into a persisting vault note (durable,
  // via GitHub), linked to the task so it survives the task being completed.
  const saveTaskNoteToVault = useCallback(
    async (task: Task, content: string): Promise<{ ok: boolean; url?: string }> => {
      const title = task.title?.trim() || 'Task note'
      const slug =
        title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '') || 'task-note'
      const path = `notes/${slug}-${task.id.slice(0, 8)}.md`
      const result = await vaultWrite.createVaultNote(
        { title, content, path },
        `Save task note to vault: ${title}`
      )
      if (!result?.success) return { ok: false }
      // First save returns the new note id → link it to the task. Re-saves of the
      // same task update the existing (already-linked) vault file, so a null id is
      // still success — the file was written.
      if (result.noteId) {
        await addEntityLink(result.noteId, { entityType: 'task', entityId: task.id, linkType: 'primary' })
      }
      return { ok: true, url: result.githubUrl }
    },
    [vaultWrite, addEntityLink]
  )

  // Current-quarter incomplete goal actions — surfaced in the weekly planning session
  // so quarterly intentions can be pulled into the week.
  const weeklyGoalActions = useMemo<GoalAction[]>(() => {
    const q = getCurrentQuarter()
    return goals.flatMap(g => g.actions).filter(a => a.quarter === q && !a.completed)
  }, [goals, getCurrentQuarter])

  // Persist a completed weekly planning session as a vault note.
  const saveWeeklyPlanToVault = useCallback(
    async ({ weekId, priorities, concerns }: { weekId: string; priorities: Task[]; concerns: string }): Promise<{ ok: boolean }> => {
      const { formatWeeklyNote } = await import('@/components/planning/weekly/weeklyPlanning')
      const scheduleSummary = priorities
        .filter(t => t.scheduledFor)
        .map(t => `- ${t.title} (${new Date(t.scheduledFor as Date).toLocaleDateString()})`)
        .join('\n')
      const note = formatWeeklyNote({ weekId, priorities, scheduleSummary, concerns })
      const result = await vaultWrite.createVaultNote(
        { title: note.title, content: note.content, path: note.path },
        `Weekly plan: ${weekId}`,
      )
      return { ok: !!result?.success }
    },
    [vaultWrite],
  )

  // Pull a quarterly goal action into the week as a new 'week'-bucket task.
  const handleAddGoalActionToWeek = useCallback(async (action: GoalAction) => {
    const id = await addTask(action.description)
    if (id) await setBucket(id, 'week')
  }, [addTask, setBucket])

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

    const fullTitle = `${sourceTask.title}: ${title}`
    await addTask(
      fullTitle,
      sourceTask.contactId, // Inherit contact
      sourceTask.projectId, // Inherit project
      viewedDate, // Schedule for today
      {
        assignedTo: sourceTask.assignedTo ?? getCurrentUserMember()?.id,
        context: sourceTask.context,
        category: sourceTask.category,
        parentTaskId: sourceTask.id, // Link back to source for context lineage
      }
    )
  }, [tasks, addTask, viewedDate, getCurrentUserMember])

  // Handler for adding linked prep/followup tasks from DetailPanel
  const _handleAddLinkedTask = useCallback(async (
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

  // Handler for linking an existing task as prep/follow-up
  const _handleLinkExistingTask = useCallback(async (
    taskId: string,
    linkedTo: { type: LinkedActivityType; id: string },
    linkType: 'prep' | 'followup',
  ) => {
    await updateTask(taskId, { linkedTo, linkType })
  }, [updateTask])

  // Handler for toggling a linked task's completion
  const _handleToggleLinkedTask = useCallback(async (taskId: string) => {
    await toggleTask(taskId)
  }, [toggleTask])

  // Handler for deleting a linked task
  const _handleDeleteLinkedTask = useCallback(async (taskId: string) => {
    await deleteTask(taskId)
  }, [deleteTask])

  // Convert a task into a project: subtasks become the project's tasks, parent task is deleted, then open the new project
  const handleConvertTaskToProject = useCallback(async (
    taskId: string,
    details: { name: string; notes?: string; context?: TaskContext },
  ) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return null
    const project = await convertTaskToProject(task, details, { addProject, updateTask, deleteTask })
    if (project) handleOpenProject(project.id)
    return project
  }, [tasks, addProject, updateTask, deleteTask, handleOpenProject])

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
    // Show toast when context changes to family (task becomes visible to household members)
    const prevTask = tasks.find(t => t.id === id)
    if (prevTask) {
      const sharingMessage = detectContextSharingChange(prevTask, updates)
      if (sharingMessage) {
        showToast(sharingMessage, 'info', 3000)
      }
    }

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
  }, [tasks, updateTask, showToast, formatDateForToast])

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

  // Delete a calendar event. Orchestrates optimistic UI, undo (single events),
  // and confirmation toast (recurring series). The DetailPanel just signals intent.
  const handleDeleteEvent = useCallback((event: CalendarEvent) => {
    const eventId = event.google_event_id || event.id
    const calendarId = event.calendar_id || event.calendarId
    const recurringParentId = event.recurring_event_id || event.recurringEventId

    const fireDelete = async (deleteSeries: boolean) => {
      try {
        await deleteEvent({ eventId, calendarId, deleteSeries })
      } catch (err) {
        if (err instanceof CalendarReconnectError) {
          showToast('Calendar connection expired. Please reconnect.', 'warning')
        } else {
          console.error('Failed to delete event:', err)
          showToast(err instanceof Error ? err.message : 'Failed to delete event', 'warning')
        }
        // Restore on failure so UI matches reality
        restoreEventLocal(event)
      }
    }

    if (recurringParentId) {
      // Recurring instance — confirm scope before doing anything destructive.
      setConfirmationToast({
        id: Math.random().toString(36).substring(7),
        message: 'This is a recurring event. Delete just this one, or the whole series?',
        actions: [
          {
            label: 'This event only',
            variant: 'secondary',
            onClick: () => {
              removeEventLocal(event.id)
              let cancelled = false
              const timer = setTimeout(() => {
                if (cancelled) return
                fireDelete(false)
              }, 5500)
              undo.pushAction('Event deleted', () => {
                cancelled = true
                clearTimeout(timer)
                restoreEventLocal(event)
              })
            },
          },
          {
            label: 'Entire series',
            variant: 'primary',
            onClick: async () => {
              // Series deletes are not undoable — confirmation toast is the safety.
              removeEventLocal(event.id)
              await fireDelete(true)
              showToast('Recurring event series deleted', 'success', 2500)
            },
          },
        ],
      })
      return
    }

    // Single event — optimistic remove, defer the API call until the undo window expires.
    removeEventLocal(event.id)
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      fireDelete(false)
    }, 5500)
    undo.pushAction('Event deleted', () => {
      cancelled = true
      clearTimeout(timer)
      restoreEventLocal(event)
    })
  }, [deleteEvent, removeEventLocal, restoreEventLocal, undo, showToast])

  const fmtT = useCallback((d: Date | null) => d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'inbox', [])

  // Bundle schedule actions + reference data into context to eliminate prop drilling
  // Defined before early returns to satisfy rules-of-hooks
  // Type annotation removed temporarily; ScheduleActionsValue updated in Task 7
  const scheduleActionsValue = useMemo(() => ({
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
        isAllDay: true,
      })
    },
    onGroupTasks: async (taskIds: string[], groupName: string, date: Date, isAllDay: boolean) => {
      const wrapperId = await groupTasks(
        {
          taskIds,
          groupName,
          date,
          isAllDay,
          assignedTo: getCurrentUserMember()?.id,
          context: currentDomain !== 'universal' ? currentDomain : undefined,
        },
        { addTask, updateTask, refetch: refetchTasks },
      )
      if (!wrapperId) showToast("Couldn't create group", 'warning')
    },
    onGroupItems: async (taskIds: string[], memberRefs: GroupMemberRef[], groupName: string, date: Date, isAllDay: boolean) => {
      const wrapperId = await groupItems(
        {
          taskIds, memberRefs, groupName, date, isAllDay,
          assignedTo: getCurrentUserMember()?.id,
          context: currentDomain !== 'universal' ? currentDomain : undefined,
        },
        { addTask, updateTask, refetch: refetchTasks },
      )
      if (!wrapperId) showToast("Couldn't create group", 'warning')
    },
    onNotify: (message: string) => showToast(message, 'info'),
    onCreateTaskAt: async (r: TimelineCaptureResult) => {
      const when = r.scheduledFor
      const id = await addTask(r.title, r.contactId, r.projectId, when ?? undefined, {
        isAllDay: !when,
        category: r.category,
        context: r.category ? undefined : (currentDomain !== 'universal' ? currentDomain : undefined),
        assignedTo: r.assignedMemberIds?.[0] ?? getCurrentUserMember()?.id,
      })
      if (id) setTlUndo({ message: `Task added · ${fmtT(when)}`, onUndo: () => { void deleteTask(id) } })
      else showToast("Couldn't add task", 'warning')
    },
    onCreateEventAt: async (r: TimelineCaptureResult) => {
      const when = r.scheduledFor
      if (!when) { showToast('Event needs a time', 'warning'); return }
      try {
        const ev = await createEvent({ title: r.title, startTime: when, endTime: new Date(when.getTime() + 30 * 60_000) })
        setTlUndo({ message: `Event added · ${fmtT(when)}`, onUndo: () => { void deleteEvent({ eventId: ev.id }) } })
      } catch { showToast("Couldn't add event", 'warning') }
    },
    onCreateRoutineAt: async (r: TimelineCaptureResult) => {
      const when = r.scheduledFor
      const hhmm = when ? `${String(when.getHours()).padStart(2,'0')}:${String(when.getMinutes()).padStart(2,'0')}` : undefined
      const routine = await addRoutine({ name: r.title, time_of_day: hhmm, recurrence_pattern: { type: 'daily' } })
      if (routine) setTlUndo({ message: `Routine added · ${fmtT(when)}`, onUndo: () => { void deleteRoutine(routine.id) } })
      else showToast("Couldn't add routine", 'warning')
    },
    onCreateNoteAt: async (c: string, a: Date | null) => {
      const note = await addNote({ content: c, type: 'general', timelineAt: a ?? undefined, context: currentDomain !== 'universal' ? currentDomain : undefined })
      if (note) setTlUndo({ message: `Note added · ${fmtT(a)}`, onUndo: () => { void deleteNote(note.id) } })
      else showToast("Couldn't add note", 'warning')
    },
    onAppendNoteAt: appendToNote,
    onLinkNote: () => {}, // Phase 1: no generic note→timeline link helper; append covers the primary use
    timelineNotes: notes
      .filter(n => n.timelineAt)
      .map(n => ({ id: n.id, title: n.title, content: n.content, timelineAt: n.timelineAt })),
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
    onDeleteRoutine: scheduleActions.onDeleteRoutine,

    // Event actions
    onCompleteEvent: scheduleActions.onCompleteEvent,
    onSkipEvent: scheduleActions.onSkipEvent,
    onPushEvent: scheduleActions.onPushEvent,
    onDeleteEvent: handleDeleteEvent,
    onUpdateEventContext: updateEventContext,
    onHideEvent: hideEvent,
    onUpdateEvent: async (eventId: string, { startTime, endTime }: { startTime: Date; endTime: Date }) => {
      await updateEvent({ eventId, startTime, endTime })
    },

    // Reference data
    contactsMap,
    projectsMap,
    projects,
    contacts,
    familyMembers,
    lists,
    listsByCategory,
    eventNotesMap,
    eventContextOverrides,

    // List/contact actions
    onSendToList: handleSendToList,
    onCreateList: handleCreateListInTriage,
    onAddProject: addProject,
    onConvertTaskToProject: handleConvertTaskToProject,
    onSearchContacts: searchContacts,
    onAddContact: (name: string, details?: { phone?: string; category?: import('@/types/contact').ContactCategory }) => addContact({ name, ...details }),
    onOpenProject: handleOpenProject,
    onOpenPlanning: () => setPlanningOpen(true),

    // Calendar domain mapping
    getDomainForCalendar,

    // Navigation
    onRefreshInstances: refreshDateInstances,
    onOpenChat: () => handleChatOpenChange(true),
    onStartMeeting: meetingNotes.startMeeting,
    onUpdateEventProject: updateEventProject,
  }), [
    handleToggleTask, toggleWaiting, handleUpdateTaskWithToast, pushTask, deleteTask, addTask, updateTask, refetchTasks, getCurrentUserMember, currentDomain, handleCreateFollowUp,
    addNote, deleteNote, appendToNote, notes,
    addRoutine, deleteRoutine, createEvent, deleteEvent, handleDeleteEvent,
    fmtT, setTlUndo, showToast,
    scheduleActions, updateRoutine, updateEventContext, hideEvent, updateEvent,
    contactsMap, projectsMap, projects, contacts, familyMembers, lists, listsByCategory,
    eventNotesMap, eventContextOverrides,
    handleSendToList, handleCreateListInTriage, addProject, handleConvertTaskToProject, searchContacts, addContact,
    handleOpenProject, getDomainForCalendar,
    refreshDateInstances, meetingNotes.startMeeting, updateEventProject, handleChatOpenChange,
  ])

  return (
    <AppShell
      sidebarCollapsed={sidebarCollapsed}
      onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      panelOpen={selectedItemId !== null || recipeUrl !== null}
      onDismissPanel={handleDismissPanel}
      focusModeOpen={focusMode.isOpen}
      userEmail={user.email ?? undefined}
      userName={getCurrentUserMember()?.name}
      onSignOut={signOut}
      viewedDate={viewedDate}
      onDateChange={setViewedDate}
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

            // Pick target calendar from the current domain mapping (e.g., Family domain → Family calendar)
            const explicitContext = data.context ?? (currentDomain !== 'universal' ? currentDomain : undefined)
            const targetCalendar = getCalendarForDomain(explicitContext ?? null)

            await createEvent({
              title: data.title,
              startTime,
              endTime,
              // Use browser timezone
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              calendarId: targetCalendar?.calendarId,
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
      chatOpen={chatOpen}
      onChatOpenChange={handleChatOpenChange}
      activePanelTab={activePanelTab}
      onPanelTabChange={setActivePanelTab}
      chatMessages={assistant.messages}
      chatLoading={assistant.loading}
      chatError={assistant.error}
      chatEntityContext={null}
      chatMode={'chat'}
      onChatSend={assistant.sendMessage}
      onChatClear={assistant.resetSession}
      chatToolActivity={assistant.toolActivity}
      chatSessions={[]}
      chatSessionsLoading={false}
      onChatNewChat={assistant.resetSession}
      activeChatSessionId={null}
      panel={
        recipeUrl ? (
          <Suspense fallback={<LoadingFallback />}>
            <RecipeViewer
              url={recipeUrl}
              onClose={() => setRecipeUrl(null)}
            />
          </Suspense>
        ) : selectedItem ? (
          selectedItem.type === 'task' && selectedItem.originalTask ? (
            <TapContextPanel
              task={selectedItem.originalTask}
              contacts={contacts}
              projects={projects}
              events={eventsWithMeals}
              familyMembers={familyMembers}
              siblingTaskCandidates={tasks}
              allTasks={tasks}
              // createdByName not tracked in current data model — TODO Plan 2
              onClose={() => setSelectedItemId(null)}
              onTitleChange={(t) => updateTask(selectedItem.originalTask!.id, { title: t })}
              onNotesChange={(n) => updateTask(selectedItem.originalTask!.id, { notes: n })}
              onSaveNoteToVault={(content) => saveTaskNoteToVault(selectedItem.originalTask!, content)}
              onToggleComplete={() => handleToggleTask(selectedItem.originalTask!.id)}
              onSchedule={(date, isAllDay) =>
                updateTask(selectedItem.originalTask!.id, {
                  bucket: 'timed',
                  scheduledFor: date,
                  isAllDay,
                })
              }
              onClearSchedule={() =>
                updateTask(selectedItem.originalTask!.id, {
                  bucket: 'inbox',
                  scheduledFor: undefined,
                  isAllDay: undefined,
                })
              }
              isPinned={pinnedItems.isPinned('task', selectedItem.originalTask.id)}
              onTogglePin={() => {
                const id = selectedItem.originalTask!.id
                if (pinnedItems.isPinned('task', id)) pinnedItems.unpin('task', id)
                else pinnedItems.pin('task', id)
              }}
              onDelete={() => {
                deleteTask(selectedItem.originalTask!.id)
                setSelectedItemId(null)
              }}
              onOpenContact={(id) => handleOpenContact(id)}
              onOpenMember={(id) => handleOpenMember(id)}
              onOpenProject={(id) => handleOpenProject(id)}
              onOpenEvent={(id) => setSelectedItemId(`event-${id}`)}
              onContextChange={(ctx) => updateTask(selectedItem.originalTask!.id, { context: ctx ?? null })}
              onAssigneesChange={(ids) =>
                updateTask(selectedItem.originalTask!.id, {
                  assignedToAll: ids.length > 0 ? ids : undefined,
                })
              }
              onContactChange={(id) => updateTask(selectedItem.originalTask!.id, { contactId: id })}
              onSearchContacts={searchContacts}
              onAddContact={(name, details) => addContact({ name, ...details })}
              onOpenTask={(id) => setSelectedItemId(`task-${id}`)}
              onOpenRelated={(kind, id) => {
                if (kind === 'task') setSelectedItemId(`task-${id}`)
                // other kinds: no-op in Plan 1; Plan 2 wires them
              }}
              onToggleSubtask={(id) => handleToggleTask(id)}
              onAddSubtask={(title) => addSubtask(selectedItem.originalTask!.id, title)}
              onRemoveSubtask={(id) => { void removeFromGroup(id, { updateTask, refetch: refetchTasks }) }}
              onUngroup={() => {
                const t = selectedItem.originalTask!
                void ungroupTasks(t.id, (t.subtasks ?? []).map((s) => s.id), { updateTask, deleteTask, refetch: refetchTasks })
                setSelectedItemId(null)
              }}
              onDeleteGroup={() => {
                const t = selectedItem.originalTask!
                void deleteTaskGroup(t.id, (t.subtasks ?? []).map((s) => s.id), { deleteTask, refetch: refetchTasks })
                setSelectedItemId(null)
              }}
              onAddLink={(url) => {
                const t = selectedItem.originalTask!
                const next: TaskLink[] = [...(t.links ?? []), { url }]
                updateTask(t.id, { links: next })
              }}
              onUpdateLocation={(location, placeId) =>
                updateTask(selectedItem.originalTask!.id, { location, locationPlaceId: placeId })
              }
              onClearLocation={() =>
                updateTask(selectedItem.originalTask!.id, { location: undefined, locationPlaceId: undefined })
              }
            />
          ) : selectedItem.type === 'event' && selectedItem.originalEvent && (selectedItem.originalEvent.id ?? '').startsWith('meal:') ? (
            <TapMealPanel
              event={selectedItem.originalEvent}
              onClose={() => setSelectedItemId(null)}
            />
          ) : selectedItem.type === 'event' && selectedItem.originalEvent ? (
            <TapEventPanel
              event={selectedItem.originalEvent}
              notes={getNote(selectedItem.originalEvent.google_event_id || selectedItem.originalEvent.id)?.notes ?? undefined}
              allTasks={tasks}
              onClose={() => setSelectedItemId(null)}
              onNotesChange={(html) => updateNote(selectedItem.originalEvent!.google_event_id || selectedItem.originalEvent!.id, html)}
              onAddPrepTask={() => { /* TODO Plan 2.5: integrate addPrepTask */ }}
              onMore={() => {}}
              onAddLink={() => {}}
              onOpenTask={(id) => setSelectedItemId(`task-${id}`)}
              onOpenProject={() => {}}
              onOpenRelated={() => {}}
              onUpdateEventLocation={async (eventId: string, location: string | null, calendarId?: string) => {
                try {
                  await updateEvent({ eventId, location, calendarId })
                  showToast('Location updated successfully')
                } catch (error) {
                  console.error('Failed to update event location:', error)
                  showToast(error instanceof Error ? error.message : 'Failed to update location', 'warning')
                }
              }}
              onReschedule={async (startTime: Date, endTime: Date) => {
                const ev = selectedItem.originalEvent!
                try {
                  await updateEvent({
                    eventId: ev.google_event_id ?? ev.id,
                    startTime,
                    endTime,
                    calendarId: ev.calendar_id ?? ev.calendarId,
                  })
                  showToast('Event rescheduled')
                } catch (error) {
                  console.error('Failed to reschedule event:', error)
                  showToast(error instanceof Error ? error.message : 'Failed to reschedule', 'warning')
                }
              }}
            />
          ) : selectedItem.type === 'routine' && selectedItem.originalRoutine ? (
            <TapRoutinePanel
              routine={selectedItem.originalRoutine}
              familyMembers={familyMembers}
              onClose={() => setSelectedItemId(null)}
              onNotesChange={(n) => updateRoutine(selectedItem.originalRoutine!.id, { description: n })}
              onContextChange={(ctx) => updateRoutine(selectedItem.originalRoutine!.id, { context: ctx ?? null })}
              onVisibilityChange={(v) => updateRoutine(selectedItem.originalRoutine!.id, { visibility: v })}
              onAssignChange={(ids) => updateRoutine(selectedItem.originalRoutine!.id, { assigned_to_all: ids })}
            />
          ) : null
        ) : null
      }
    >
      <DomainPageOutline>
        <ViewRouter
          activeView={activeView}
          onViewChange={handleViewChange}
          tasks={tasks}
          events={eventsWithMeals}
          filteredEvents={filteredEvents}
          filteredRoutines={filteredRoutines}
          activeRoutines={activeRoutines}
          projects={projects}
          dateInstances={dateInstances}
          selectedItemId={selectedItemId}
          onSelectItem={handleSelectItem}
          tasksLoading={tasksLoading}
          eventsFetching={eventsFetching}
          routinesLoading={routinesLoading}
          viewedDate={viewedDate}
          onDateChange={setViewedDate}
          currentUserMemberId={getCurrentUserMember()?.id}
          bothPanelsOpen={(selectedItemId !== null || recipeUrl !== null) && chatOpen}
          isConnected={isConnected}
          scheduleActionsValue={scheduleActionsValue}
          meetingNotes={meetingNotes}
          planningOpen={planningOpen}
          onClosePlanning={() => setPlanningOpen(false)}
          onUpdateTask={updateTask}
          onRescheduleEvent={(eventId, startTime, endTime, calendarId) => updateEvent({ eventId, startTime, endTime, calendarId })}
          pushTask={pushTask}
          familyMembers={familyMembers}
          eventNotesMap={eventNotesMap}
          onToggleTask={handleToggleTask}
          contacts={contacts}
          onAddContact={addContact}
          onAddProject={addProject}
          onCreateNoteTask={(title) => addTask(title, undefined, undefined, undefined, { assignedTo: getCurrentUserMember()?.id })}
          onCreateNoteProject={async (name) => (await addProject({ name }))?.id}
          onCreateNoteContact={async (name) => (await addContact({ name }))?.id}
          onDeleteContact={deleteContact}
          onUpdateContact={updateContact}
          selectedContactForView={selectedContactForView}
          selectedContactId={selectedContactId}
          onSelectTaskFromContact={(taskId) => { setSelectedItemId(`task-${taskId}`) }}
          pinnedItems={pinnedItems}
          selectedContactNotes={selectedContactNotes}
          selectedContactNotesLoading={selectedContactNotesLoading}
          onAddContactNote={handleAddContactNote}
          selectedProjectId={selectedProjectId}
          selectedProject={selectedProject}
          currentDomain={currentDomain}
          contactsMap={contactsMap}
          onUpdateProject={handleUpdateProject}
          onDeleteProject={deleteProject}
          onAddTaskToProject={(title, projectId) => addTask(title, undefined, projectId, undefined, { assignedTo: getCurrentUserMember()?.id })}
          onDeleteTask={deleteTask}
          onToggleTaskForProject={handleToggleTask}
          onUpdateTaskWithToast={handleUpdateTaskWithToast}
          linkedEventsForProject={linkedEventsForProject}
          allRoutines={allRoutines}
          selectedRoutineId={selectedRoutineId}
          selectedRoutine={selectedRoutine}
          creatingRoutine={creatingRoutine}
          onAddRoutine={addRoutine}
          onUpdateRoutine={updateRoutine}
          onDeleteRoutine={deleteRoutine}
          onToggleRoutineVisibility={toggleRoutineVisibility}
          projectsMap={projectsMap}
          refetchFamilyMembers={refetchFamilyMembers}
          onSaveWeeklyPlanToVault={saveWeeklyPlanToVault}
          weeklyGoalActions={weeklyGoalActions}
          onAddGoalActionToWeek={handleAddGoalActionToWeek}
          onOpenWeeklyPlanning={() => handleViewChange('weekly-planning')}
          selectedMember={selectedMember}
          onEditMemberInSettings={() => handleViewChange('settings')}
        />

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
        {tlUndo && (
          <InboxUndoToast
            message={tlUndo.message}
            onUndo={runTlUndo}
            onDismiss={dismissTlUndo}
          />
        )}

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
