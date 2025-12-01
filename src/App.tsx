import { useEffect } from 'react'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useAuth } from '@/hooks/useAuth'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { AddTaskForm } from '@/components/AddTaskForm'
import { CalendarConnect } from '@/components/CalendarConnect'
import { Dashboard } from '@/components/Dashboard'
import { AuthForm } from '@/components/AuthForm'

function App() {
  const { tasks, loading: tasksLoading, addTask, toggleTask, deleteTask, updateTask } = useSupabaseTasks()
  const { user, loading: authLoading, signOut } = useAuth()
  const { isConnected, events, fetchTodayEvents } = useGoogleCalendar()

  // Fetch calendar events when connected
  useEffect(() => {
    if (isConnected) {
      fetchTodayEvents()
    }
  }, [isConnected, fetchTodayEvents])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center safe-top safe-bottom">
        <p className="text-neutral-500">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg-base safe-top safe-bottom">
        <AuthForm />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-base safe-top safe-bottom">
      {/* Header */}
      <header className="px-5 pt-6 pb-4 md:px-8 md:pt-8 md:pb-6">
        <div className="max-w-lg mx-auto flex items-start justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-primary-600">Symphony OS</h1>
            <p className="text-neutral-500 mt-1 text-sm md:text-base">Your personal operating system</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-neutral-500 truncate max-w-[140px] md:max-w-none">{user.email}</p>
            <button
              onClick={() => signOut()}
              className="text-sm text-primary-600 hover:text-primary-700 hover:underline touch-target"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="px-5 pb-8 md:px-8 md:pb-12">
        <div className="max-w-lg mx-auto space-y-6">
          <CalendarConnect />
          <AddTaskForm onAdd={addTask} />
          <Dashboard
            tasks={tasks}
            events={events}
            onToggleTask={toggleTask}
            onDeleteTask={deleteTask}
            onUpdateTask={updateTask}
            loading={tasksLoading}
          />
        </div>
      </main>
    </div>
  )
}

export default App
