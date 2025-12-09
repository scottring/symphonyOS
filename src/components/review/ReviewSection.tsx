import { useState, useRef } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import { SchedulePopover, DeferPicker } from '@/components/triage'
import { AssigneeDropdown } from '@/components/family'

interface ReviewSectionProps {
  incompleteTasks: Task[]      // Scheduled for today, not done
  overdueTasks: Task[]         // Overdue > 1 day
  staleDeferredTasks: Task[]   // deferCount >= 3
  tomorrowTasks: Task[]        // Tomorrow preview
  onReschedule: (id: string, date: Date, isAllDay: boolean) => void
  onComplete: (id: string) => void
  onDrop: (id: string) => void
  onCapture: (text: string) => void
  onSelectTask: (id: string) => void
  projects?: Project[]
  familyMembers?: FamilyMember[]
  onAssignTask?: (taskId: string, memberId: string | null) => void
  onDefer?: (id: string, date: Date | undefined) => void
}

interface ReviewTaskCardProps {
  task: Task
  urgency: 'warning' | 'danger' | 'muted'
  onReschedule: (date: Date, isAllDay: boolean) => void
  onComplete: () => void
  onDrop: () => void
  onSelect: () => void
  project?: Project
  familyMembers?: FamilyMember[]
  onAssign?: (memberId: string | null) => void
  onDefer?: (date: Date | undefined) => void
  showDefer?: boolean
}

function ReviewTaskCard({
  task,
  urgency,
  onReschedule,
  onComplete,
  onDrop,
  onSelect,
  project,
  familyMembers = [],
  onAssign,
  onDefer,
  showDefer = false,
}: ReviewTaskCardProps) {
  const urgencyStyles = {
    warning: {
      border: 'border-warning-500/30',
      bg: 'bg-warning-50/50',
      accent: 'bg-warning-500',
      badge: 'bg-warning-100 text-warning-700',
    },
    danger: {
      border: 'border-danger-500/30',
      bg: 'bg-danger-50/30',
      accent: 'bg-danger-500',
      badge: 'bg-danger-100 text-danger-700',
    },
    muted: {
      border: 'border-neutral-200',
      bg: 'bg-neutral-50/50',
      accent: 'bg-neutral-400',
      badge: 'bg-neutral-100 text-neutral-600',
    },
  }

  const styles = urgencyStyles[urgency]

  return (
    <div
      onClick={onSelect}
      className={`
        relative rounded-xl border px-4 py-3 cursor-pointer
        transition-all duration-200 hover:shadow-md group
        ${styles.border} ${styles.bg}
      `}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full ${styles.accent}`} />

      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onComplete()
          }}
          className="mt-0.5 w-5 h-5 rounded-md border-2 border-neutral-300 hover:border-primary-400 transition-colors flex-shrink-0"
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-neutral-800 line-clamp-2">{task.title}</span>
            {(task.deferCount ?? 0) >= 3 && (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${styles.badge}`}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {task.deferCount}x
              </span>
            )}
          </div>

          {project && (
            <span className="inline-flex items-center gap-1 text-xs text-primary-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />
              {project.name}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Schedule */}
          <SchedulePopover
            value={task.scheduledFor}
            isAllDay={task.isAllDay}
            onSchedule={onReschedule}
          />

          {/* Defer - only shown for stale tasks */}
          {showDefer && onDefer && (
            <DeferPicker
              deferredUntil={task.deferredUntil}
              deferCount={task.deferCount}
              onDefer={onDefer}
            />
          )}

          {/* Drop/Delete - always visible */}
          <button
            onClick={onDrop}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-danger-500 hover:bg-danger-50 transition-colors"
            title="Drop task"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>

          {/* Assignee */}
          {familyMembers.length > 0 && onAssign && (
            <AssigneeDropdown
              members={familyMembers}
              selectedId={task.assignedTo}
              onSelect={onAssign}
              size="sm"
            />
          )}
        </div>
      </div>
    </div>
  )
}

interface CollapsibleSectionProps {
  title: string
  count: number
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  urgency?: 'warning' | 'danger' | 'muted'
  subtitle?: string
}

function CollapsibleSection({
  title,
  count,
  icon,
  children,
  defaultOpen = true,
  urgency,
  subtitle,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const urgencyColors = {
    warning: 'text-warning-600',
    danger: 'text-danger-600',
    muted: 'text-neutral-500',
  }

  return (
    <div className="mb-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 mb-3 group"
      >
        <span className={`${urgency ? urgencyColors[urgency] : 'text-neutral-500'}`}>
          {icon}
        </span>
        <span className="font-display text-sm font-medium tracking-wide text-neutral-700">
          {title}
        </span>
        <span className={`
          min-w-[1.5rem] h-5 px-1.5 rounded-full text-xs font-semibold
          flex items-center justify-center
          ${urgency === 'danger' ? 'bg-danger-100 text-danger-700' :
            urgency === 'warning' ? 'bg-warning-100 text-warning-700' :
            'bg-neutral-100 text-neutral-600'}
        `}>
          {count}
        </span>
        <svg
          className={`w-4 h-4 ml-auto text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {subtitle && isOpen && (
        <p className="text-sm text-neutral-500 mb-3 ml-7 italic">{subtitle}</p>
      )}

      {isOpen && (
        <div className="space-y-2 animate-fade-in-up">
          {children}
        </div>
      )}
    </div>
  )
}

export function ReviewSection({
  incompleteTasks,
  overdueTasks,
  staleDeferredTasks,
  tomorrowTasks,
  onReschedule,
  onComplete,
  onDrop,
  onCapture,
  onSelectTask,
  projects = [],
  familyMembers = [],
  onAssignTask,
  onDefer,
}: ReviewSectionProps) {
  const [captureText, setCaptureText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleCapture = () => {
    if (captureText.trim()) {
      onCapture(captureText.trim())
      setCaptureText('')
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCapture()
    }
  }

  const getProject = (projectId?: string) => projects.find(p => p.id === projectId)

  const hasItems = incompleteTasks.length > 0 || overdueTasks.length > 0 || staleDeferredTasks.length > 0

  return (
    <div className="animate-fade-in-up">
      {/* Review header */}
      <div className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-review-50 to-review-100/50 border border-review-200/50">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-review-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-review-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-review-600">Evening Review</h2>
            <p className="text-sm text-review-500">Reflect and prepare for tomorrow</p>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {!hasItems && (
        <div className="text-center py-12 px-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-display text-xl font-semibold text-neutral-800 mb-2">Well done!</h3>
          <p className="text-neutral-500">You've addressed everything. Enjoy your evening.</p>
        </div>
      )}

      {/* Didn't Get Done - incomplete from today */}
      {incompleteTasks.length > 0 && (
        <CollapsibleSection
          title="Didn't Get Done"
          count={incompleteTasks.length}
          urgency="warning"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          subtitle="Move to tomorrow or reschedule"
        >
          {incompleteTasks.map(task => (
            <ReviewTaskCard
              key={task.id}
              task={task}
              urgency="warning"
              onReschedule={(date, isAllDay) => onReschedule(task.id, date, isAllDay)}
              onComplete={() => onComplete(task.id)}
              onDrop={() => onDrop(task.id)}
              onSelect={() => onSelectTask(task.id)}
              project={getProject(task.projectId)}
              familyMembers={familyMembers}
              onAssign={onAssignTask ? (memberId) => onAssignTask(task.id, memberId) : undefined}
            />
          ))}
        </CollapsibleSection>
      )}

      {/* Overdue */}
      {overdueTasks.length > 0 && (
        <CollapsibleSection
          title="Overdue"
          count={overdueTasks.length}
          urgency="danger"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          }
          subtitle="Be honest with yourself — reschedule or let go"
        >
          {overdueTasks.map(task => (
            <ReviewTaskCard
              key={task.id}
              task={task}
              urgency="danger"
              onReschedule={(date, isAllDay) => onReschedule(task.id, date, isAllDay)}
              onComplete={() => onComplete(task.id)}
              onDrop={() => onDrop(task.id)}
              onSelect={() => onSelectTask(task.id)}
              project={getProject(task.projectId)}
              familyMembers={familyMembers}
              onAssign={onAssignTask ? (memberId) => onAssignTask(task.id, memberId) : undefined}
            />
          ))}
        </CollapsibleSection>
      )}

      {/* Keeps Getting Pushed */}
      {staleDeferredTasks.length > 0 && (
        <CollapsibleSection
          title="Keeps Getting Pushed"
          count={staleDeferredTasks.length}
          urgency="muted"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          }
          subtitle="Maybe it's time to commit or let go"
        >
          {staleDeferredTasks.map(task => (
            <ReviewTaskCard
              key={task.id}
              task={task}
              urgency="muted"
              onReschedule={(date, isAllDay) => onReschedule(task.id, date, isAllDay)}
              onComplete={() => onComplete(task.id)}
              onDrop={() => onDrop(task.id)}
              onSelect={() => onSelectTask(task.id)}
              project={getProject(task.projectId)}
              familyMembers={familyMembers}
              onAssign={onAssignTask ? (memberId) => onAssignTask(task.id, memberId) : undefined}
              showDefer={true}
              onDefer={onDefer ? (date) => onDefer(task.id, date) : undefined}
            />
          ))}
        </CollapsibleSection>
      )}

      {/* Quick Capture */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="font-display text-sm font-medium tracking-wide text-neutral-700">
            Quick Capture
          </span>
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Capture a thought for tomorrow..."
            className="flex-1 px-4 py-3 rounded-xl border border-neutral-200 bg-white text-base
              placeholder:text-neutral-400
              focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400
              transition-all duration-150"
          />
          <button
            onClick={handleCapture}
            disabled={!captureText.trim()}
            className="px-4 py-3 rounded-xl bg-primary-500 text-white font-medium
              hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-150"
          >
            Add
          </button>
        </div>
      </div>

      {/* Tomorrow Preview */}
      {tomorrowTasks.length > 0 && (
        <CollapsibleSection
          title="Tomorrow Preview"
          count={tomorrowTasks.length}
          defaultOpen={false}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
          }
        >
          {tomorrowTasks.map(task => (
            <div
              key={task.id}
              onClick={() => onSelectTask(task.id)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-neutral-50/50 border border-neutral-100 cursor-pointer hover:bg-neutral-100/50 transition-colors"
            >
              <div className="w-4 h-4 rounded border border-neutral-300" />
              <span className="flex-1 text-sm text-neutral-700">{task.title}</span>
              {task.scheduledFor && (
                <span className="text-xs text-neutral-400">
                  {new Date(task.scheduledFor).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}
    </div>
  )
}
