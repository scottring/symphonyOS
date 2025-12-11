import { useCallback, useEffect, useRef, useState } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { AssignPicker, PushDropdown, SchedulePopover, type ScheduleContextItem } from '@/components/triage'

interface WeeklyReviewProps {
  tasks: Task[]
  projects: Project[]
  contacts: Contact[]
  calendarEvents?: CalendarEvent[]
  allTasks?: Task[] // All tasks for timeline display
  onSearchContacts: (query: string) => Contact[]
  onAddContact?: (name: string) => Promise<Contact | null>
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onPushTask: (id: string, date: Date) => void
  onDeleteTask: (id: string) => void
  onClose: () => void
}

export function WeeklyReview({
  tasks,
  projects,
  contacts,
  calendarEvents = [],
  allTasks = [],
  onSearchContacts,
  onAddContact,
  onUpdateTask,
  onPushTask,
  onDeleteTask,
  onClose,
}: WeeklyReviewProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set())

  // Track which tasks get processed for animation
  const markProcessed = (id: string) => {
    setProcessedIds(prev => new Set(prev).add(id))
  }

  // Graceful close with animation
  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(onClose, 200)
  }, [onClose])

  // Close on escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleClose])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        handleClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [handleClose])

  // Wrapped handlers that track processed state
  const handleSchedule = (taskId: string, date: Date | undefined, isAllDay?: boolean) => {
    markProcessed(taskId)
    onUpdateTask(taskId, { scheduledFor: date, isAllDay, deferredUntil: undefined })
  }

  const handlePush = (taskId: string, date: Date) => {
    markProcessed(taskId)
    onPushTask(taskId, date)
  }

  const handleDelete = (taskId: string) => {
    markProcessed(taskId)
    onDeleteTask(taskId)
  }

  const isEmpty = tasks.length === 0
  const processedCount = processedIds.size
  const totalCount = tasks.length + processedCount
  const progressPercent = totalCount > 0 ? (processedCount / totalCount) * 100 : 0

  // Build schedule context for SchedulePopover
  const getScheduleItemsForDate = useCallback((date: Date): ScheduleContextItem[] => {
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    const items: ScheduleContextItem[] = []

    // Add tasks scheduled for this date
    allTasks.forEach(task => {
      if (!task.scheduledFor) return
      const taskDate = new Date(task.scheduledFor)
      if (taskDate >= startOfDay && taskDate <= endOfDay) {
        items.push({
          id: task.id,
          title: task.title,
          startTime: taskDate,
          endTime: task.isAllDay ? undefined : new Date(taskDate.getTime() + 3600000), // Assume 1 hour
          allDay: task.isAllDay,
          type: 'task',
          completed: task.completed,
        })
      }
    })

    // Add events for this date
    calendarEvents.forEach(event => {
      const startTimeStr = event.start_time || event.startTime
      if (!startTimeStr) return
      const eventStart = new Date(startTimeStr)
      if (eventStart >= startOfDay && eventStart <= endOfDay) {
        const endTimeStr = event.end_time || event.endTime
        items.push({
          id: event.id,
          title: event.title,
          startTime: eventStart,
          endTime: endTimeStr ? new Date(endTimeStr) : undefined,
          allDay: event.all_day || event.allDay,
          type: 'event',
        })
      }
    })

    // Sort by start time
    items.sort((a, b) => (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0))

    return items
  }, [allTasks, calendarEvents])

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center p-4
        ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
      style={{ 
        background: 'linear-gradient(180deg, hsl(32 20% 20% / 0.2) 0%, hsl(32 20% 20% / 0.4) 100%)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div
        ref={modalRef}
        className={`bg-bg-overlay rounded-3xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-visible
          ${isClosing ? 'animate-scale-down' : 'animate-scale-up'}`}
        style={{
          boxShadow: '0 8px 32px hsl(32 30% 20% / 0.15), 0 0 0 1px hsl(38 25% 88% / 0.5)',
        }}
      >
        {/* Header */}
        <div className="p-5 pb-4 border-b border-neutral-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold text-neutral-800">
                  Weekly Review
                </h2>
                {!isEmpty && (
                  <p className="text-sm text-neutral-500 mt-0.5">
                    Give each item a home
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2.5 rounded-xl text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress indicator */}
          {!isEmpty && processedCount > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs font-medium text-neutral-500 tabular-nums">
                {processedCount} done
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-visible p-5">
          {isEmpty ? (
            <div className="text-center py-12 animate-fade-in-scale">
              {/* Celebration illustration */}
              <div className="relative w-20 h-20 mx-auto mb-5">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary-100 to-primary-50 animate-pulse-soft" />
                <div className="absolute inset-2 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-primary">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                {/* Decorative sparkles */}
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-warning-500 animate-float" style={{ animationDelay: '0ms' }} />
                <div className="absolute -bottom-2 -left-1 w-2 h-2 rounded-full bg-primary-300 animate-float" style={{ animationDelay: '150ms' }} />
                <div className="absolute top-1/2 -right-3 w-2 h-2 rounded-full bg-sage-300 animate-float" style={{ animationDelay: '300ms' }} />
              </div>
              
              <h3 className="font-display text-2xl font-semibold text-neutral-800 mb-2">
                All Clear
              </h3>
              <p className="text-neutral-500 mb-8 max-w-xs mx-auto leading-relaxed">
                Every item has a temporal home. You're ready to focus.
              </p>
              <button
                onClick={handleClose}
                className="btn-primary px-8 py-3 text-base"
              >
                Back to Today
              </button>
            </div>
          ) : (
            <div className="space-y-3 stagger-in">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-neutral-600">
                  {tasks.length} {tasks.length === 1 ? 'item' : 'items'} to process
                </span>
              </div>

              {tasks.map((task) => {
                const project = projects.find((p) => p.id === task.projectId)
                const showDeferBadge = (task.deferCount ?? 0) >= 2

                return (
                  <div
                    key={task.id}
                    className="group card p-4 transition-all duration-200 hover:shadow-lg"
                  >
                    {/* Title row */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-neutral-800 leading-snug">
                            {task.title}
                          </span>
                          {showDeferBadge && (
                            <span 
                              className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-warning-50 text-warning-600"
                              title={`Deferred ${task.deferCount} times`}
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              {task.deferCount}
                            </span>
                          )}
                        </div>
                        {project && (
                          <span className="inline-flex items-center gap-1 text-xs text-primary-600 mt-1.5 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />
                            {project.name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center gap-1.5">
                      {/* Schedule - with schedule context */}
                      <div className="action-button" title="Schedule">
                        <SchedulePopover
                          value={task.scheduledFor}
                          isAllDay={task.isAllDay}
                          onSchedule={(date, isAllDay) => handleSchedule(task.id, date, isAllDay)}
                          onClear={() => handleSchedule(task.id, undefined, false)}
                          getItemsForDate={getScheduleItemsForDate}
                        />
                      </div>
                      
                      {/* Push */}
                      <div className="action-button" title="Push to later">
                        <PushDropdown onPush={(date) => handlePush(task.id, date)} />
                      </div>
                      
                      {/* Assign */}
                      <div className="action-button" title="Assign to someone">
                        <AssignPicker
                          value={task.assignedTo}
                          contacts={contacts}
                          onSearchContacts={onSearchContacts}
                          onAddContact={onAddContact}
                          onChange={(assignedTo) => onUpdateTask(task.id, { assignedTo })}
                        />
                      </div>
                      
                      <div className="flex-1" />
                      
                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="p-2 rounded-lg text-neutral-300 hover:text-danger-500 hover:bg-danger-50 
                          transition-all duration-200 opacity-0 group-hover:opacity-100"
                        title="Delete task"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Inline styles for modal-specific animations */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fade-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes scale-up {
          from { 
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to { 
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes scale-down {
          from { 
            opacity: 1;
            transform: scale(1) translateY(0);
          }
          to { 
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out forwards;
        }
        .animate-fade-out {
          animation: fade-out 0.2s ease-out forwards;
        }
        .animate-scale-up {
          animation: scale-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-scale-down {
          animation: scale-down 0.2s ease-out forwards;
        }
        .action-button {
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  )
}
