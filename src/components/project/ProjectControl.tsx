import { useState, useEffect, useRef } from 'react'
import { X, FolderPlus } from 'lucide-react'
import type { Project } from '@/types/project'

interface ProjectControlProps {
  project?: Project
  projects?: Project[]
  onOpenProject?: (projectId: string) => void
  onAssign: (projectId: string) => void
  onClear: () => void
}

function ProjectControl({ project, projects, onOpenProject, onAssign, onClear }: ProjectControlProps) {
  const [open, setOpen] = useState(false)
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

  if (activeProjects.length === 0) return null

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
        </div>
      )}
    </div>
  )
}

export { ProjectControl }
export type { ProjectControlProps }
