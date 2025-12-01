import { useEffect, useState, useCallback } from 'react'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useAuth } from '@/hooks/useAuth'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { AddTaskForm } from '@/components/AddTaskForm'
import { CalendarConnect } from '@/components/CalendarConnect'
import { Dashboard } from '@/components/Dashboard'
import { AuthForm } from '@/components/AuthForm'
import { DateNavigator } from '@/components/DateNavigator'

function App() {
  const { tasks, loading: tasksLoading, addTask, toggleTask, deleteTask, updateTask } = useSupabaseTasks()
  const { user, loading: authLoading, signOut } = useAuth()
  const { isConnected, events, fetchEvents } = useGoogleCalendar()

  // Day navigation state
  const [viewedDate, setViewedDate] = useState(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  })

  const goToPrevDay = useCallback(() => {
    setViewedDate((prev) => {
      const newDate = new Date(prev)
      newDate.setDate(newDate.getDate() - 1)
      return newDate
    })
  }, [])

  const goToNextDay = useCallback(() => {
    setViewedDate((prev) => {
      const newDate = new Date(prev)
      newDate.setDate(newDate.getDate() + 1)
      return newDate
    })
  }, [])

  const goToToday = useCallback(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    setViewedDate(today)
  }, [])

  // Fetch calendar events when connected or viewedDate changes
  useEffect(() => {
    if (isConnected) {
      const startOfDay = new Date(viewedDate)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(viewedDate)
      endOfDay.setHours(23, 59, 59, 999)
      fetchEvents(startOfDay, endOfDay)
    }
  }, [isConnected, viewedDate, fetchEvents])

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
          <DateNavigator
            date={viewedDate}
            onPrev={goToPrevDay}
            onNext={goToNextDay}
            onToday={goToToday}
          />
          <Dashboard
            tasks={tasks}
            events={events}
            viewedDate={viewedDate}
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
