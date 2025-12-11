import { useState, useEffect, useRef } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import { SchedulePopover, DeferPicker } from '@/components/triage'
import { AssigneeDropdown } from '@/components/family'

interface TriageCardProps {
  task: Task
  onUpdate: (updates: Partial<Task>) => void
  onDefer: (date: Date | undefined) => void
  onCollapse: () => void
  projects?: Project[]
  familyMembers?: FamilyMember[]
  onAssignTask?: (memberId: string | null) => void
  autoCollapseMs?: number
}

export function TriageCard({
  task,
  onUpdate,
  onDefer,
  onCollapse,
  projects = [],
  familyMembers = [],
  onAssignTask,
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

      {/* Triage actions row - matches InboxTaskCard hover layout */}
      <div className="flex items-center gap-2">
        {/* Schedule button */}
        <SchedulePopover
          value={task.scheduledFor}
          isAllDay={task.isAllDay}
          onSchedule={(date, isAllDay) => {
            onUpdate({ scheduledFor: date, isAllDay, deferredUntil: undefined })
            // Collapse after scheduling
            setTimeout(onCollapse, 200)
          }}
          onClear={() => onUpdate({ scheduledFor: undefined, isAllDay: undefined })}
        />

        {/* Defer/Later button */}
        <DeferPicker
          deferredUntil={task.deferredUntil}
          deferCount={task.deferCount}
          onDefer={(date) => {
            onDefer(date)
            // Collapse after deferring
            if (date) setTimeout(onCollapse, 200)
          }}
        />

        <div className="flex-1" />

        {/* Assignee avatar */}
        {familyMembers.length > 0 && onAssignTask && (
          <AssigneeDropdown
            members={familyMembers}
            selectedId={task.assignedTo}
            onSelect={onAssignTask}
            size="sm"
          />
        )}
      </div>
    </div>
  )
}
