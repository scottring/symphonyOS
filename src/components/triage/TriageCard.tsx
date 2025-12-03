import { useState, useEffect, useRef } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import { WhenPicker, ContextPicker, AssignPicker, DeferDropdown } from '@/components/triage'

interface TriageCardProps {
  task: Task
  onUpdate: (updates: Partial<Task>) => void
  onDefer: (date: Date) => void
  onCollapse: () => void
  projects?: Project[]
  contacts?: Contact[]
  onSearchContacts?: (query: string) => Contact[]
  autoCollapseMs?: number
}

export function TriageCard({
  task,
  onUpdate,
  onDefer,
  onCollapse,
  projects = [],
  contacts = [],
  onSearchContacts,
  autoCollapseMs = 4000,
}: TriageCardProps) {
  const [isInteracting, setIsInteracting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-collapse timer
  useEffect(() => {
    if (isInteracting) {
      // Clear timer when user is interacting
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return
    }

    // Start collapse timer
    timerRef.current = setTimeout(() => {
      onCollapse()
    }, autoCollapseMs)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [isInteracting, autoCollapseMs, onCollapse])

  // Handle any interaction that should pause the timer
  const handleInteractionStart = () => setIsInteracting(true)
  const handleInteractionEnd = () => setIsInteracting(false)

  const project = projects.find(p => p.id === task.projectId)

  return (
    <div
      className="bg-white rounded-xl border-2 border-primary-200 shadow-lg px-4 py-3 animate-fade-in-up"
      onMouseEnter={handleInteractionStart}
      onMouseLeave={handleInteractionEnd}
      onFocus={handleInteractionStart}
      onBlur={handleInteractionEnd}
    >
      {/* Task title row */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <span className="text-lg font-medium text-neutral-800">
            {task.title}
          </span>
          {project && (
            <span className="ml-2 text-sm text-blue-600">
              #{project.name}
            </span>
          )}
        </div>
      </div>

      {/* Triage actions row */}
      <div className="flex items-center gap-2">
        <span title="Schedule">
          <WhenPicker
            value={task.scheduledFor}
            isAllDay={task.isAllDay}
            onChange={(date, isAllDay) => {
              onUpdate({ scheduledFor: date, isAllDay, deferredUntil: undefined })
              // Collapse after scheduling
              setTimeout(onCollapse, 200)
            }}
          />
        </span>
        <span title="Defer">
          <DeferDropdown
            onDefer={(date) => {
              onDefer(date)
              // Collapse after deferring
              setTimeout(onCollapse, 200)
            }}
          />
        </span>
        <span title="Context">
          <ContextPicker
            value={task.context}
            onChange={(context) => onUpdate({ context })}
          />
        </span>
        <span title="Assign">
          <AssignPicker
            value={task.assignedTo}
            contacts={contacts}
            onSearchContacts={onSearchContacts}
            onChange={(assignedTo) => onUpdate({ assignedTo })}
          />
        </span>
        <div className="flex-1" />
        <span className="text-xs text-neutral-400">
          Collapses automatically
        </span>
      </div>
    </div>
  )
}
