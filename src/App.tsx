import { useEffect, useState, useMemo } from 'react'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useAuth } from '@/hooks/useAuth'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { useEventNotes } from '@/hooks/useEventNotes'
import { AppShell } from '@/components/layout/AppShell'
import { TodaySchedule } from '@/components/schedule/TodaySchedule'
import { DetailPanel } from '@/components/detail/DetailPanel'
import { AddTaskForm } from '@/components/AddTaskForm'
import { CalendarConnect } from '@/components/CalendarConnect'
import { AuthForm } from '@/components/AuthForm'
import { RecipeViewer } from '@/components/recipe/RecipeViewer'
import { taskToTimelineItem, eventToTimelineItem } from '@/types/timeline'

function App() {
  const { tasks, loading: tasksLoading, addTask, toggleTask, deleteTask, updateTask } = useSupabaseTasks()
  const { user, loading: authLoading, signOut } = useAuth()
  const { isConnected, events, fetchEvents } = useGoogleCalendar()
  const { fetchNote, updateNote, getNote } = useEventNotes()

  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('symphony-sidebar-collapsed')
    return stored === 'true'
  })
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [viewedDate, setViewedDate] = useState(() => new Date())
  const [recipeUrl, setRecipeUrl] = useState<string | null>(null)

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('symphony-sidebar-collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

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

  // Fetch event notes when an event is selected
  useEffect(() => {
    if (selectedItemId?.startsWith('event-')) {
      const eventId = selectedItemId.replace('event-', '')
      fetchNote(eventId)
    }
  }, [selectedItemId, fetchNote])

  // Find selected item from tasks or events
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

    return null
  }, [selectedItemId, tasks, events, getNote])

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
      userEmail={user.email ?? undefined}
      onSignOut={signOut}
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
          />
        )
      }
    >
      <div className="h-full overflow-auto">
        {/* Calendar connect banner if needed */}
        {!isConnected && (
          <div className="p-4 border-b border-neutral-100">
            <CalendarConnect />
          </div>
        )}

        {/* Add task form */}
        <div className="p-4 border-b border-neutral-100">
          <div className="max-w-xl">
            <AddTaskForm onAdd={addTask} />
          </div>
        </div>

        {/* Today's schedule */}
        <TodaySchedule
          tasks={tasks}
          events={events}
          selectedItemId={selectedItemId}
          onSelectItem={setSelectedItemId}
          onToggleTask={toggleTask}
          loading={tasksLoading}
          viewedDate={viewedDate}
          onDateChange={setViewedDate}
        />
      </div>
    </AppShell>
  )
}

export default App
