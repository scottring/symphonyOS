import { useEffect, useRef } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import { WhenPicker, AssignPicker, PushDropdown } from '@/components/triage'

interface WeeklyReviewProps {
  tasks: Task[]
  projects: Project[]
  contacts: Contact[]
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
  onSearchContacts,
  onAddContact,
  onUpdateTask,
  onPushTask,
  onDeleteTask,
  onClose,
}: WeeklyReviewProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  // Close on escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const isEmpty = tasks.length === 0

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-100">
          <h2 className="text-lg font-semibold text-neutral-800">Weekly Review</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isEmpty ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-neutral-800 mb-2">Review Complete</h3>
              <p className="text-neutral-500 mb-6">All items have temporal homes.</p>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-neutral-500 mb-4">
                {tasks.length} {tasks.length === 1 ? 'item' : 'items'} to process
              </p>
              {tasks.map((task) => {
                const project = projects.find((p) => p.id === task.projectId)
                const showDeferBadge = (task.deferCount ?? 0) >= 2

                return (
                  <div
                    key={task.id}
                    className="bg-neutral-50 rounded-xl p-4 border border-neutral-100"
                  >
                    {/* Title row */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-neutral-800 truncate">
                            {task.title}
                          </span>
                          {showDeferBadge && (
                            <span className="flex-shrink-0 text-xs text-amber-600 font-medium">
                              ↻{task.deferCount}
                            </span>
                          )}
                        </div>
                        {project && (
                          <span className="text-xs text-blue-600 mt-1 inline-block">
                            #{project.name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center gap-2">
                      <span title="Schedule">
                        <WhenPicker
                          value={task.scheduledFor}
                          isAllDay={task.isAllDay}
                          onChange={(date, isAllDay) =>
                            onUpdateTask(task.id, { scheduledFor: date, isAllDay, deferredUntil: undefined })
                          }
                        />
                      </span>
                      <span title="Push">
                        <PushDropdown onPush={(date) => onPushTask(task.id, date)} />
                      </span>
                      <span title="Assign">
                        <AssignPicker
                          value={task.assignedTo}
                          contacts={contacts}
                          onSearchContacts={onSearchContacts}
                          onAddContact={onAddContact}
                          onChange={(assignedTo) => onUpdateTask(task.id, { assignedTo })}
                        />
                      </span>
                      <div className="flex-1" />
                      <button
                        onClick={() => onDeleteTask(task.id)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete task"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
    </div>
  )
}
