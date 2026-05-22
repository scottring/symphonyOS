import { useState, useEffect, useRef } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import type { List, ListCategory } from '@/types/list'
import { SchedulePopover, DeferPicker, type ScheduleContextItem } from '@/components/triage'
import { ListPicker } from '@/components/triage/ListPicker'
import { MultiAssigneeDropdown } from '@/components/family'
import { AgeIndicator } from '@/components/health'

interface TriageCardProps {
  task: Task
  onUpdate: (updates: Partial<Task>) => void
  onDefer: (target: 'week' | 'month' | 'quarter') => void
  onCollapse: () => void
  projects?: Project[]
  familyMembers?: FamilyMember[]
  autoCollapseMs?: number
  // Schedule context for the schedule popover
  getScheduleItemsForDate?: (date: Date) => ScheduleContextItem[]
  // List picker props
  lists?: List[]
  listsByCategory?: Record<ListCategory, List[]>
  onSendToList?: (listId: string) => void
  onCreateList?: (title: string, category: ListCategory) => Promise<string | null>
}

export function TriageCard({
  task,
  onUpdate,
  onDefer,
  onCollapse,
  projects = [],
  familyMembers = [],
  autoCollapseMs = 4000,
  getScheduleItemsForDate,
  lists = [],
  listsByCategory,
  onSendToList,
  onCreateList,
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
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-lg font-medium text-neutral-800">
            {task.title}
          </span>
          {project && (
            <span className="text-sm text-blue-600">
              #{project.name}
            </span>
          )}
          {/* Age indicator - shows for tasks > 3 days old */}
          <AgeIndicator createdAt={task.createdAt} size="sm" />
        </div>
      </div>

      {/* Triage actions row - matches InboxTaskCard hover layout */}
      <div className="flex items-center gap-2">
        {/* Schedule button */}
        <SchedulePopover
          value={task.scheduledFor}
          isAllDay={task.isAllDay}
          onSchedule={(date, isAllDay) => {
            onUpdate({ scheduledFor: date, isAllDay, deferredUntil: undefined, isSomeday: false })
            // Collapse after scheduling
            setTimeout(onCollapse, 200)
          }}
          onClear={() => onUpdate({ scheduledFor: undefined, isAllDay: undefined })}
          getItemsForDate={getScheduleItemsForDate}
          itemTitle={task.title}
        />

        {/* Defer/Later button */}
        <DeferPicker
          onDefer={(target) => {
            onDefer(target)
            setTimeout(onCollapse, 200)
          }}
        />

        {/* Send to List button */}
        {onSendToList && listsByCategory && (
          <ListPicker
            lists={lists}
            listsByCategory={listsByCategory}
            onSendToList={(listId) => {
              onSendToList(listId)
              // Collapse after sending to list
              setTimeout(onCollapse, 200)
            }}
            onCreateList={onCreateList}
          />
        )}

        {/* Someday button */}
        <button
          onClick={() => {
            onUpdate({ isSomeday: true, scheduledFor: undefined, deferredUntil: undefined })
            setTimeout(onCollapse, 200)
          }}
          className="p-2 rounded-lg text-neutral-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
          title="Move to Someday/Maybe"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>

        <div className="flex-1" />

        {/* Assignee avatar */}
        {familyMembers.length > 0 && (
          <MultiAssigneeDropdown
            members={familyMembers}
            selectedIds={task.assignedToAll ?? (task.assignedTo ? [task.assignedTo] : [])}
            onSelect={(memberIds) => onUpdate({ assignedToAll: memberIds, assignedTo: memberIds[0] ?? undefined })}
            size="sm"
            label="Who's responsible?"
          />
        )}
      </div>
    </div>
  )
}
