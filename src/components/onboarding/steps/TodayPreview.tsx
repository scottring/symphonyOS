import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useRoutines } from '@/hooks/useRoutines'

interface TodayPreviewProps {
  onContinue: () => void
}


export function TodayPreview({ onContinue }: TodayPreviewProps) {
  const { tasks } = useSupabaseTasks()
  const { getRoutinesForDate } = useRoutines()

  const today = new Date()
  const todaysRoutines = getRoutinesForDate(today)

  // Filter tasks for today
  const todaysTasks = tasks.filter(task => {
    if (!task.scheduledFor) return false
    const taskDate = new Date(task.scheduledFor)
    return taskDate.toDateString() === today.toDateString()
  })

  // Get inbox tasks
  const inboxTasks = tasks.filter(task => !task.scheduledFor && !task.completed)

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 pt-24">
      <div className="w-full max-w-lg">
        {/* Header */}
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-neutral-800 text-center mb-4">
          Your Today view
        </h1>
        <p className="text-lg text-neutral-500 text-center mb-8">
          Everything you need to do, right here.
          <br />
          Nothing hidden, nothing forgotten.
        </p>

        {/* Preview card */}
        <div className="bg-white rounded-xl border border-neutral-100 shadow-lg overflow-hidden mb-8">
          {/* Date header */}
          <div className="p-4 border-b border-neutral-100">
            <div className="text-sm text-neutral-400 uppercase tracking-wide">
              {today.toLocaleDateString([], { weekday: 'long' })}
            </div>
            <div className="font-display text-2xl font-semibold text-neutral-800">
              {today.toLocaleDateString([], { month: 'long', day: 'numeric' })}
            </div>
          </div>

          {/* Content */}
          <div className="divide-y divide-neutral-50">
            {/* Routines section */}
            {todaysRoutines.length > 0 && (
              <div className="p-4">
                <div className="text-xs text-neutral-400 uppercase tracking-wide mb-2">
                  Routines
                </div>
                {todaysRoutines.slice(0, 3).map((routine) => (
                  <div key={routine.id} className="flex items-center gap-3 py-2">
                    <span className="w-5 h-5 rounded-full border-2 border-neutral-300" />
                    <span className="text-neutral-700">{routine.name}</span>
                    {routine.time_of_day && (
                      <span className="text-sm text-neutral-400 ml-auto">
                        {routine.time_of_day.substring(0, 5)}
                      </span>
                    )}
                  </div>
                ))}
                {todaysRoutines.length > 3 && (
                  <div className="text-sm text-neutral-400 mt-1">
                    +{todaysRoutines.length - 3} more
                  </div>
                )}
              </div>
            )}

            {/* Scheduled tasks section */}
            {todaysTasks.length > 0 && (
              <div className="p-4">
                <div className="text-xs text-neutral-400 uppercase tracking-wide mb-2">
                  Tasks
                </div>
                {todaysTasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="flex items-center gap-3 py-2">
                    <span className="w-5 h-5 rounded-full border-2 border-neutral-300" />
                    <span className="text-neutral-700">{task.title}</span>
                  </div>
                ))}
                {todaysTasks.length > 3 && (
                  <div className="text-sm text-neutral-400 mt-1">
                    +{todaysTasks.length - 3} more
                  </div>
                )}
              </div>
            )}

            {/* Inbox section */}
            {inboxTasks.length > 0 && (
              <div className="p-4 bg-neutral-50">
                <div className="text-xs text-neutral-400 uppercase tracking-wide mb-2">
                  Inbox
                </div>
                {inboxTasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="flex items-center gap-3 py-2">
                    <span className="w-5 h-5 rounded-full border-2 border-neutral-300" />
                    <span className="text-neutral-600">{task.title}</span>
                  </div>
                ))}
                {inboxTasks.length > 3 && (
                  <div className="text-sm text-neutral-400 mt-1">
                    +{inboxTasks.length - 3} more
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {todaysRoutines.length === 0 && todaysTasks.length === 0 && inboxTasks.length === 0 && (
              <div className="p-8 text-center text-neutral-400">
                Your schedule will appear here
              </div>
            )}
          </div>
        </div>

        {/* Tip */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
          <p className="text-sm text-amber-800">
            💡 <span className="font-medium">Tip:</span> Check this each morning.
            Triage your inbox each evening. That's the habit that makes this work.
          </p>
        </div>

        {/* CTA */}
        <div className="flex justify-center">
          <button
            onClick={onContinue}
            className="btn-primary px-8 py-3 text-lg font-medium"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
