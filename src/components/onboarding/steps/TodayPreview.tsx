import { useState, useCallback, useEffect, useMemo } from 'react'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useRoutines } from '@/hooks/useRoutines'
import { useProjects } from '@/hooks/useProjects'
import { useContacts } from '@/hooks/useContacts'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { TodaySchedule } from '@/components/schedule/TodaySchedule'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'

interface TodayPreviewProps {
  onContinue: () => void
}

export function TodayPreview({ onContinue }: TodayPreviewProps) {
  const { tasks, loading: tasksLoading, toggleTask, updateTask, pushTask, deleteTask } = useSupabaseTasks()
  const { getRoutinesForDate, updateRoutine, loading: routinesLoading } = useRoutines()
  const { projects, projectsMap } = useProjects()
  const { contacts, contactsMap, searchContacts, addContact } = useContacts()
  const { getInstancesForDate, markDone, undoDone, skip } = useActionableInstances()
  const { members: familyMembers } = useFamilyMembers()

  const [viewedDate] = useState(() => new Date())
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [dateInstances, setDateInstances] = useState<Awaited<ReturnType<typeof getInstancesForDate>>>([])

  // Get routines for today
  const todaysRoutines = getRoutinesForDate(viewedDate)

  // Fetch actionable instances
  const refreshDateInstances = useCallback(async () => {
    const instances = await getInstancesForDate(viewedDate)
    setDateInstances(instances)
  }, [viewedDate, getInstancesForDate])

  useEffect(() => {
    refreshDateInstances()
  }, [refreshDateInstances])

  // Handlers
  const handleToggleTask = useCallback(async (taskId: string) => {
    await toggleTask(taskId)
  }, [toggleTask])

  const handleCompleteRoutine = useCallback(async (routineId: string, completed: boolean) => {
    if (completed) {
      await markDone('routine', routineId, viewedDate)
    } else {
      await undoDone('routine', routineId, viewedDate)
    }
    refreshDateInstances()
  }, [markDone, undoDone, viewedDate, refreshDateInstances])

  const handleSkipRoutine = useCallback(async (routineId: string) => {
    await skip('routine', routineId, viewedDate)
    refreshDateInstances()
  }, [skip, viewedDate, refreshDateInstances])

  const handleAssignTask = useCallback((taskId: string, memberId: string | null) => {
    updateTask(taskId, { assignedTo: memberId ?? undefined })
  }, [updateTask])

  const handleAssignRoutine = useCallback((routineId: string, memberId: string | null) => {
    updateRoutine(routineId, { assigned_to: memberId })
  }, [updateRoutine])

  const loading = tasksLoading || routinesLoading

  const contextValue: ScheduleActionsValue = useMemo(() => ({
    onToggleTask: handleToggleTask,
    onUpdateTask: updateTask,
    onPushTask: pushTask,
    onDeleteTask: deleteTask,
    contactsMap,
    projectsMap,
    projects,
    contacts,
    familyMembers,
    lists: [],
    onSearchContacts: searchContacts,
    onAddContact: (name: string) => addContact({ name }),
    onRefreshInstances: refreshDateInstances,
    onAssignTask: handleAssignTask,
    onAssignRoutine: handleAssignRoutine,
    onCompleteRoutine: handleCompleteRoutine,
    onSkipRoutine: handleSkipRoutine,
  }), [
    handleToggleTask, updateTask, pushTask, deleteTask,
    contactsMap, projectsMap, projects, contacts, familyMembers,
    searchContacts, addContact, refreshDateInstances,
    handleAssignTask, handleAssignRoutine, handleCompleteRoutine, handleSkipRoutine,
  ])

  return (
    <div className="min-h-screen flex flex-col bg-bg-base">
      {/* Header */}
      <div className="px-6 pt-8 pb-4 text-center">
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-neutral-800 mb-2">
          This is your Today view
        </h1>
        <p className="text-neutral-500">
          Everything you need to do, all in one place. Try checking something off!
        </p>
      </div>

      {/* Actual TodaySchedule */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <ScheduleActionsProvider value={contextValue}>
          <TodaySchedule
            tasks={tasks}
            events={[]}
            routines={todaysRoutines}
            dateInstances={dateInstances}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
            onToggleTask={handleToggleTask}
            onCompleteRoutine={handleCompleteRoutine}
            loading={loading}
            viewedDate={viewedDate}
            onDateChange={() => {}}
          />
          </ScheduleActionsProvider>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="shrink-0 p-6 bg-gradient-to-t from-bg-base via-bg-base to-transparent">
        <div className="max-w-lg mx-auto">
          {/* Tip */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-amber-800">
              💡 <span className="font-medium">Daily habit:</span> Check this each morning.
              Triage your inbox each evening. That's the rhythm that makes this work.
            </p>
          </div>

          <button
            onClick={onContinue}
            className="w-full btn-primary py-3 text-lg font-medium"
          >
            Looks great — let's finish up
          </button>
        </div>
      </div>
    </div>
  )
}
