import { useState, useEffect, useRef } from 'react'
import { X, FolderPlus } from 'lucide-react'
import type { Project } from '@/types/project'
import type { TaskContext } from '@/types/task'

interface ProjectControlProps {
  project?: Project
  projects?: Project[]
  onOpenProject?: (projectId: string) => void
  onAssign: (projectId: string) => void
  onClear: () => void
  /** When provided, the dropdown shows a "+ Create new project…" entry. */
  onCreate?: (name: string, context: TaskContext | null) => void
  /** Prefilled value for the create-new name input (e.g., the inbox task's title). */
  defaultNewName?: string
}

function ProjectControl({ project, projects, onOpenProject, onAssign, onClear, onCreate, defaultNewName }: ProjectControlProps) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState(defaultNewName ?? '')
  const [newContext, setNewContext] = useState<TaskContext | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function handleEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  useEffect(() => {
    // Reset the form whenever the dropdown closes
    if (!open) {
      setCreating(false)
      setNewName(defaultNewName ?? '')
      setNewContext(null)
    }
  }, [open, defaultNewName])

  const handleCreateSubmit = () => {
    const trimmed = newName.trim()
    if (!trimmed || !onCreate) return
    onCreate(trimmed, newContext)
    setOpen(false)
  }

  if (project) {
    return (
      <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs max-w-[220px] shrink-0 mt-0.5">
        {onOpenProject ? (
          <button type="button" onClick={() => onOpenProject(project.id)} className="truncate hover:underline">
            {project.name}
          </button>
        ) : (
          <span className="truncate">{project.name}</span>
        )}
        <button
          type="button"
          aria-label="Remove project"
          onClick={onClear}
          className="ml-0.5 hover:text-blue-900 shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </span>
    )
  }

  const activeProjects = (projects ?? []).filter(
    (p) => p.status !== 'completed' && p.status !== 'on_hold',
  )

  // Only render the button if there are projects to show OR if onCreate is provided
  if (activeProjects.length === 0 && !onCreate) return null

  return (
    <div ref={containerRef} className="relative hidden md:block shrink-0">
      <button
        type="button"
        aria-label="Assign project"
        onClick={() => setOpen((v) => !v)}
        className="opacity-0 group-hover:opacity-100 aria-expanded:opacity-100 transition-opacity p-1 rounded-md text-neutral-400 hover:text-blue-600 hover:bg-blue-50"
        aria-expanded={open}
        title="Assign project"
      >
        <FolderPlus className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute z-30 top-full right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[180px] max-h-64 overflow-y-auto">
          {activeProjects.map((p) => (
            <button
              key={p.id}
              type="button"
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-700 truncate"
              onClick={() => { onAssign(p.id); setOpen(false) }}
            >
              {p.name}
            </button>
          ))}
          {onCreate && (
            <>
              <div className="border-t border-neutral-100 my-1" />
              {!creating ? (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="block w-full text-left px-3 py-1.5 text-sm text-primary-700 hover:bg-primary-50"
                >
                  + Create new project…
                </button>
              ) : (
                <div className="px-3 py-2 space-y-2">
                  <label className="block text-xs text-neutral-500" htmlFor="new-project-name">
                    Project name
                  </label>
                  <input
                    id="new-project-name"
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Project name"
                    className="w-full px-2 py-1 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                    autoFocus
                  />
                  <div className="flex gap-1 flex-wrap">
                    {([
                      { value: 'work', label: 'Work' },
                      { value: 'family', label: 'Family' },
                      { value: 'personal', label: 'Personal' },
                      { value: null, label: 'None' },
                    ] as const).map(({ value, label }) => (
                      <button
                        key={label}
                        type="button"
                        aria-label={`Context: ${label}`}
                        onClick={() => setNewContext(value)}
                        className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                          newContext === value
                            ? 'bg-primary-100 text-primary-700'
                            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateSubmit}
                    disabled={!newName.trim()}
                    className="w-full px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:bg-neutral-300 disabled:cursor-not-allowed"
                  >
                    Create
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export { ProjectControl }
export type { ProjectControlProps }
