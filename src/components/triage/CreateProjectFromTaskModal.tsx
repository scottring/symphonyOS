import { useState, useRef, useEffect } from 'react'

interface TaskItem {
  title: string
}

interface CreateProjectFromTaskModalProps {
  isOpen: boolean
  onClose: () => void
  taskTitle: string
  onConfirm: (projectName: string, tasks: TaskItem[]) => void
}

export function CreateProjectFromTaskModal({
  isOpen,
  onClose,
  taskTitle,
  onConfirm,
}: CreateProjectFromTaskModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [projectName, setProjectName] = useState(taskTitle)
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [newTaskTitle, setNewTaskTitle] = useState('')

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset form on open
      setProjectName(taskTitle)
      setTasks([])
      setNewTaskTitle('')
      // Focus the first task input after a short delay
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, taskTitle])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  // Close on escape
  useEffect(() => {
    if (!isOpen) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return
    setTasks([...tasks, { title: newTaskTitle.trim() }])
    setNewTaskTitle('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTask()
    }
  }

  const handleRemoveTask = (index: number) => {
    setTasks(tasks.filter((_, i) => i !== index))
  }

  const handleConfirm = () => {
    if (!projectName.trim() || tasks.length === 0) return
    onConfirm(projectName.trim(), tasks)
  }

  const canCreate = projectName.trim() && tasks.length > 0

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div
        ref={modalRef}
        className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-slide-in-up"
        role="dialog"
        aria-modal="true"
        aria-label="Create project from task"
      >
        {/* Header */}
        <div className="bg-primary-50 border-b border-primary-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-neutral-800">
                Create Project
              </h2>
              <p className="text-sm text-neutral-500">from this inbox item</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Project Name */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full px-4 py-3 text-lg font-display rounded-xl border border-neutral-200
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Project name"
            />
          </div>

          {/* Tasks */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              Add at least one task to get started
            </label>

            {/* Task list */}
            {tasks.length > 0 && (
              <div className="space-y-2 mb-3">
                {tasks.map((task, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-3 py-2 bg-neutral-50 rounded-lg"
                  >
                    <span className="w-4 h-4 rounded border-2 border-neutral-300 flex-shrink-0" />
                    <span className="flex-1 text-sm text-neutral-700">{task.title}</span>
                    <button
                      onClick={() => handleRemoveTask(index)}
                      className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors"
                      aria-label="Remove task"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* New task input */}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-neutral-200
                           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Type a task and press Enter"
              />
              <button
                onClick={handleAddTask}
                disabled={!newTaskTitle.trim()}
                className="px-3 py-2 rounded-lg text-sm font-medium transition-colors
                           bg-neutral-100 text-neutral-600 hover:bg-neutral-200
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>

            {/* Help text */}
            {tasks.length === 0 && (
              <p className="mt-2 text-xs text-neutral-400">
                Projects need at least one task to be actionable
              </p>
            )}
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
            onClick={handleConfirm}
            disabled={!canCreate}
            className="flex-1 btn-primary flex items-center justify-center gap-2
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Project
          </button>
        </div>
      </div>
    </div>
  )
}
