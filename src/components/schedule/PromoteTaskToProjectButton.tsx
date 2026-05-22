import { useState, useRef, useEffect, useCallback } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { TaskContext } from '@/types/task'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { FolderPlus, FolderOpen } from 'lucide-react'

interface PromoteTaskToProjectButtonProps {
  item: TimelineItem
}

/**
 * Button shown on task rows to convert the task into a project.
 * If the task is already linked to a project, shows "View Project" instead.
 */
export function PromoteTaskToProjectButton({ item }: PromoteTaskToProjectButtonProps) {
  const ctx = useScheduleActionsContext()
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Already linked to a project → open it (mirror the event affordance)
  if (item.projectId) {
    const project = ctx.projectsMap?.get(item.projectId)
    if (!project) return null
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          ctx.onOpenProject?.(item.projectId!)
        }}
        className="shrink-0 p-1.5 rounded-lg text-primary-500 hover:text-primary-700 hover:bg-primary-50 transition-all opacity-0 group-hover:opacity-100"
        title={`View project: ${project.name}`}
        aria-label={`View project: ${project.name}`}
      >
        <FolderOpen className="w-4 h-4" />
      </button>
    )
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsModalOpen(true)
        }}
        className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-all opacity-0 group-hover:opacity-100"
        title="Convert task to project"
        aria-label="Convert task to project"
      >
        <FolderPlus className="w-4 h-4" />
      </button>

      {isModalOpen && (
        <ConvertTaskModal item={item} onClose={() => setIsModalOpen(false)} />
      )}
    </>
  )
}

// ── Modal ───────────────────────────────────────────────────────────

interface ConvertTaskModalProps {
  item: TimelineItem
  onClose: () => void
}

function ConvertTaskModal({ item, onClose }: ConvertTaskModalProps) {
  const ctx = useScheduleActionsContext()
  const modalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const taskId = item.originalTask?.id ?? item.id.replace('task-', '')
  const [projectName, setProjectName] = useState(item.title)
  const [context, setContext] = useState<TaskContext | undefined>(item.context ?? 'work')
  const [notes, setNotes] = useState(item.notes ?? '')
  const [submitting, setSubmitting] = useState(false)

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handleSubmit = useCallback(async () => {
    if (!projectName.trim() || submitting) return
    setSubmitting(true)
    const project = await ctx.onConvertTaskToProject?.(taskId, {
      name: projectName.trim(),
      notes: notes.trim() || undefined,
      context,
    }) ?? null
    setSubmitting(false)
    if (project) onClose()
  }, [projectName, notes, context, submitting, ctx, taskId, onClose])

  const contextOptions: Array<{ value: TaskContext; label: string; color: string }> = [
    { value: 'work', label: 'Work', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { value: 'family', label: 'Family', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    { value: 'personal', label: 'Personal', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  ]

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div
        ref={modalRef}
        className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-slide-in-up"
        role="dialog"
        aria-modal="true"
        aria-label="Convert task to project"
      >
        {/* Header */}
        <div className="bg-primary-50 border-b border-primary-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <FolderPlus className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-neutral-800">
                Create Project
              </h2>
              <p className="text-sm text-neutral-500">from task</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Project Name */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              Project Name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              className="w-full px-4 py-3 text-lg font-display rounded-xl border border-neutral-200
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Project name"
            />
          </div>

          {/* Context */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              Domain
            </label>
            <div className="flex gap-2">
              {contextOptions.map(({ value, label, color }) => (
                <button
                  key={value}
                  onClick={() => setContext(value)}
                  className={`
                    px-3 py-1.5 rounded-lg text-sm font-medium border transition-all
                    ${context === value ? color : 'bg-neutral-50 text-neutral-400 border-neutral-200 hover:bg-neutral-100'}
                  `}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 text-sm rounded-xl border border-neutral-200 resize-none
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Notes carry over from the task"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-100 px-5 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-medium text-neutral-600
                       hover:bg-neutral-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!projectName.trim() || submitting}
            className="flex-1 btn-primary flex items-center justify-center gap-2
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FolderPlus className="w-4 h-4" />
            {submitting ? 'Converting...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
