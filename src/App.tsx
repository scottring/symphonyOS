import { useEffect } from 'react'
import { useLocalTasks } from '@/hooks/useLocalTasks'
import { useAuth } from '@/hooks/useAuth'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { AddTaskForm } from '@/components/AddTaskForm'
import { CalendarConnect } from '@/components/CalendarConnect'
import { Dashboard } from '@/components/Dashboard'
import { AuthForm } from '@/components/AuthForm'

function App() {
  const { tasks, addTask, toggleTask, deleteTask, updateTask } = useLocalTasks()
  const { user, loading, signOut } = useAuth()
  const { isConnected, events, fetchTodayEvents } = useGoogleCalendar()

  // Fetch calendar events when connected
  useEffect(() => {
    if (isConnected) {
      fetchTodayEvents()
    }
  }, [isConnected, fetchTodayEvents])

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <p className="text-neutral-500">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-50 p-8">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary-600">Symphony OS</h1>
          <p className="text-neutral-500 mt-2">Your personal operating system</p>
        </header>
        <AuthForm />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary-600">Symphony OS</h1>
          <p className="text-neutral-500 mt-2">Your personal operating system</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-neutral-500">{user.email}</p>
          <button
            onClick={() => signOut()}
            className="text-sm text-[#3d8b6e] hover:underline"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-md space-y-6">
        <CalendarConnect />
        <AddTaskForm onAdd={addTask} />
        <Dashboard
          tasks={tasks}
          events={events}
          onToggleTask={toggleTask}
          onDeleteTask={deleteTask}
          onUpdateTask={updateTask}
        />
      </main>
    </div>
  )
}

export default App
