/**
 * CopilotChat - AI Chat with Generative UI
 * Uses CopilotKit for rich, interactive responses
 */

import { useCopilotAction, useCopilotReadable } from '@copilotkit/react-core'
import { CopilotChat as CopilotChatUI } from '@copilotkit/react-ui'
import '@copilotkit/react-ui/styles.css'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useProjects } from '@/hooks/useProjects'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import {
  TaskItem,
  EventItem,
  RoutineItem,
  ScheduleList,
  ActionConfirmation,
} from './RenderComponents'

interface CopilotChatProps {
  onNavigateToTask?: (taskId: string) => void
}

export function CopilotChat({ onNavigateToTask }: CopilotChatProps) {
  const { tasks, toggleTask, updateTask } = useSupabaseTasks()
  const { projects } = useProjects()
  useFamilyMembers() // Preload family members for future use

  // Provide task context to the AI
  useCopilotReadable({
    description: 'The current user tasks',
    value: JSON.stringify(
      tasks.slice(0, 50).map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
        scheduledFor: t.scheduledFor,
        context: t.context,
        projectId: t.projectId,
      }))
    ),
  })

  // Provide project context
  useCopilotReadable({
    description: 'The user projects',
    value: JSON.stringify(
      projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
      }))
    ),
  })

  // ============================================================================
  // Action: Show Tasks - Renders TaskItem components
  // ============================================================================
  useCopilotAction({
    name: 'showTasks',
    description: 'Display a list of tasks with rich interactive cards. Use this when showing tasks to the user.',
    parameters: [
      {
        name: 'tasks',
        type: 'object[]',
        description: 'Array of tasks to display',
        required: true,
      },
      {
        name: 'title',
        type: 'string',
        description: 'Title for the task list section',
      },
      {
        name: 'subtitle',
        type: 'string',
        description: 'Subtitle or description',
      },
    ],
    render: ({ status, args }) => {
      const taskList = args.tasks as Array<{
        id: string
        title: string
        scheduledFor?: string
        localTime?: string
        context?: 'work' | 'family' | 'personal'
        completed?: boolean
        projectName?: string
        assignedTo?: string
      }>

      return (
        <ScheduleList
          title={args.title as string}
          subtitle={args.subtitle as string}
          status={status === 'complete' ? 'complete' : 'loading'}
        >
          {taskList?.map((task) => (
            <TaskItem
              key={task.id}
              id={task.id}
              title={task.title}
              localTime={task.localTime}
              context={task.context}
              completed={task.completed}
              projectName={task.projectName}
              assignedTo={task.assignedTo}
              onComplete={(id) => toggleTask(id)}
              onNavigate={onNavigateToTask}
            />
          ))}
        </ScheduleList>
      )
    },
    handler: async () => {
      // No-op - just for rendering
      return 'Tasks displayed'
    },
  })

  // ============================================================================
  // Action: Show Events - Renders EventItem components
  // ============================================================================
  useCopilotAction({
    name: 'showEvents',
    description: 'Display calendar events with rich cards. Use this when showing calendar events.',
    parameters: [
      {
        name: 'events',
        type: 'object[]',
        description: 'Array of events to display',
        required: true,
      },
      {
        name: 'title',
        type: 'string',
        description: 'Title for the events section',
      },
    ],
    render: ({ status, args }) => {
      const eventList = args.events as Array<{
        id: string
        title: string
        localStartTime: string
        localEndTime?: string
        allDay?: boolean
      }>

      return (
        <ScheduleList
          title={args.title as string}
          status={status === 'complete' ? 'complete' : 'loading'}
        >
          {eventList?.map((event) => (
            <EventItem
              key={event.id}
              id={event.id}
              title={event.title}
              localStartTime={event.localStartTime}
              localEndTime={event.localEndTime}
              allDay={event.allDay}
            />
          ))}
        </ScheduleList>
      )
    },
    handler: async () => {
      return 'Events displayed'
    },
  })

  // ============================================================================
  // Action: Show Routines - Renders RoutineItem components
  // ============================================================================
  useCopilotAction({
    name: 'showRoutines',
    description: 'Display routines with completion status. Use this when showing routines.',
    parameters: [
      {
        name: 'routines',
        type: 'object[]',
        description: 'Array of routines to display',
        required: true,
      },
      {
        name: 'title',
        type: 'string',
        description: 'Title for the routines section',
      },
    ],
    render: ({ status, args }) => {
      const routineList = args.routines as Array<{
        id: string
        name: string
        timeOfDay?: string
        status: 'pending' | 'completed' | 'skipped'
      }>

      return (
        <ScheduleList
          title={args.title as string}
          status={status === 'complete' ? 'complete' : 'loading'}
        >
          {routineList?.map((routine) => (
            <RoutineItem
              key={routine.id}
              id={routine.id}
              name={routine.name}
              timeOfDay={routine.timeOfDay}
              status={routine.status}
            />
          ))}
        </ScheduleList>
      )
    },
    handler: async () => {
      return 'Routines displayed'
    },
  })

  // ============================================================================
  // Action: Complete Task
  // ============================================================================
  useCopilotAction({
    name: 'completeTask',
    description: 'Mark a task as complete',
    parameters: [
      {
        name: 'taskId',
        type: 'string',
        description: 'The ID of the task to complete',
        required: true,
      },
      {
        name: 'taskTitle',
        type: 'string',
        description: 'The title of the task (for confirmation)',
        required: true,
      },
    ],
    render: ({ status, args }) => (
      <ActionConfirmation
        action="Task completed"
        description={args.taskTitle as string}
        status={status === 'complete' ? 'success' : 'pending'}
        onUndo={() => toggleTask(args.taskId as string)}
      />
    ),
    handler: async ({ taskId }) => {
      toggleTask(taskId)
      return `Task ${taskId} marked as complete`
    },
  })

  // ============================================================================
  // Action: Reschedule Task
  // ============================================================================
  useCopilotAction({
    name: 'rescheduleTask',
    description: 'Reschedule a task to a new date/time',
    parameters: [
      {
        name: 'taskId',
        type: 'string',
        description: 'The ID of the task',
        required: true,
      },
      {
        name: 'taskTitle',
        type: 'string',
        description: 'The title of the task',
        required: true,
      },
      {
        name: 'newDate',
        type: 'string',
        description: 'The new scheduled date (ISO format)',
        required: true,
      },
      {
        name: 'displayDate',
        type: 'string',
        description: 'Human-readable date for display',
        required: true,
      },
    ],
    render: ({ status, args }) => (
      <ActionConfirmation
        action={`Rescheduled to ${args.displayDate}`}
        description={args.taskTitle as string}
        status={status === 'complete' ? 'success' : 'pending'}
      />
    ),
    handler: async ({ taskId, newDate }) => {
      updateTask(taskId, { scheduledFor: new Date(newDate) })
      return `Task rescheduled to ${newDate}`
    },
  })

  // ============================================================================
  // Action: Show Day Overview - Combined schedule view
  // ============================================================================
  useCopilotAction({
    name: 'showDayOverview',
    description: 'Display a complete day overview with tasks, events, and routines grouped by time',
    parameters: [
      {
        name: 'date',
        type: 'string',
        description: 'The date being shown (e.g., "Today", "Tomorrow", "Monday, Dec 18")',
        required: true,
      },
      {
        name: 'morning',
        type: 'object',
        description: 'Morning items (tasks, events, routines)',
      },
      {
        name: 'afternoon',
        type: 'object',
        description: 'Afternoon items',
      },
      {
        name: 'evening',
        type: 'object',
        description: 'Evening items',
      },
    ],
    render: ({ status, args }) => {
      const sections = ['morning', 'afternoon', 'evening'] as const
      const sectionLabels = {
        morning: 'Morning',
        afternoon: 'Afternoon',
        evening: 'Evening',
      }

      return (
        <div className="space-y-3 my-2">
          <div className="flex items-center gap-2 px-1">
            <h2 className="text-lg font-semibold text-neutral-800">{args.date}</h2>
            {status !== 'complete' && (
              <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {sections.map((section) => {
            const data = args[section] as {
              tasks?: Array<{ id: string; title: string; localTime?: string; context?: string; completed?: boolean }>
              events?: Array<{ id: string; title: string; localStartTime: string; localEndTime?: string }>
              routines?: Array<{ id: string; name: string; timeOfDay?: string; status: string }>
            }

            if (!data) return null

            const hasItems = (data.tasks?.length || 0) + (data.events?.length || 0) + (data.routines?.length || 0) > 0
            if (!hasItems) return null

            return (
              <ScheduleList
                key={section}
                title={sectionLabels[section]}
                status={status === 'complete' ? 'complete' : 'loading'}
              >
                {data.events?.map((event) => (
                  <EventItem
                    key={event.id}
                    id={event.id}
                    title={event.title}
                    localStartTime={event.localStartTime}
                    localEndTime={event.localEndTime}
                  />
                ))}
                {data.routines?.map((routine) => (
                  <RoutineItem
                    key={routine.id}
                    id={routine.id}
                    name={routine.name}
                    timeOfDay={routine.timeOfDay}
                    status={routine.status as 'pending' | 'completed' | 'skipped'}
                  />
                ))}
                {data.tasks?.map((task) => (
                  <TaskItem
                    key={task.id}
                    id={task.id}
                    title={task.title}
                    localTime={task.localTime}
                    context={task.context as 'work' | 'family' | 'personal'}
                    completed={task.completed}
                    onComplete={(id) => toggleTask(id)}
                    onNavigate={onNavigateToTask}
                  />
                ))}
              </ScheduleList>
            )
          })}
        </div>
      )
    },
    handler: async () => {
      return 'Day overview displayed'
    },
  })

  return (
    <div className="h-full flex flex-col">
      <CopilotChatUI
        className="h-full"
        labels={{
          title: 'Symphony',
          initial: "Hi! I'm Symphony, your AI assistant. Ask me about your tasks, schedule, or tell me what to do.",
          placeholder: 'Ask me anything about your tasks...',
        }}
        icons={{
          sendIcon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          ),
        }}
      />
    </div>
  )
}

export default CopilotChat
