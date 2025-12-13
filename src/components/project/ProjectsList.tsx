import { useState, useRef, useEffect } from 'react'
import type { Project, ProjectStatus } from '@/types/project'

interface ProjectsListProps {
  projects: Project[]
  onSelectProject: (projectId: string) => void
  onAddProject?: (project: { name: string }) => Promise<Project | null>
}

export function ProjectsList({ projects, onSelectProject, onAddProject }: ProjectsListProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus()
    }
  }, [isCreating])

  const handleCreateProject = async () => {
    if (!onAddProject || !newProjectName.trim()) return

    setIsSaving(true)
    const result = await onAddProject({ name: newProjectName.trim() })
    setIsSaving(false)

    if (result) {
      setIsCreating(false)
      setNewProjectName('')
    }
  }

  const handleCancel = () => {
    setIsCreating(false)
    setNewProjectName('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCreateProject()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  const statusConfig: Record<ProjectStatus, { label: string; color: string; bg: string }> = {
    not_started: {
      label: 'Not Started',
      color: 'text-neutral-600',
      bg: 'bg-neutral-100',
    },
    in_progress: {
      label: 'In Progress',
      color: 'text-primary-700',
      bg: 'bg-primary-50',
    },
    on_hold: {
      label: 'On Hold',
      color: 'text-amber-700',
      bg: 'bg-amber-50',
    },
    completed: {
      label: 'Completed',
      color: 'text-sage-600',
      bg: 'bg-sage-50',
    },
  }

  // Sort: in_progress first, then not_started, then on_hold, then completed
  const sortedProjects = [...projects].sort((a, b) => {
    const order: Record<ProjectStatus, number> = { in_progress: 0, not_started: 1, on_hold: 2, completed: 3 }
    return order[a.status] - order[b.status]
  })

  return (
    <div className="h-full overflow-auto bg-bg-base">
      <div className="px-6 py-8 md:px-10 md:py-10 max-w-3xl mx-auto">
        {/* Header - Editorial style */}
        <header className="mb-10 animate-fade-in-up">
          <div className="flex items-end justify-between mb-2">
            <h1 className="font-display text-4xl md:text-5xl text-neutral-900 tracking-tight leading-none">
              Projects
            </h1>
            {onAddProject && !isCreating && (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary-500
                           hover:bg-primary-600 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                New Project
              </button>
            )}
          </div>
          <p className="text-neutral-500 mt-2">
            <span className="font-semibold text-neutral-700">{projects.length}</span> project{projects.length !== 1 ? 's' : ''}
          </p>
        </header>

        {/* Inline project creation form */}
        {isCreating && (
          <div className="mb-8 p-6 rounded-2xl bg-white/90 backdrop-blur-sm border border-primary-200/40 shadow-lg animate-fade-in-scale">
            <input
              ref={inputRef}
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's the project?"
              className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white
                         text-neutral-800 placeholder:text-neutral-400 text-xl font-display
                         focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all duration-200"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={handleCancel}
                className="px-5 py-2.5 text-sm font-semibold text-neutral-600 bg-neutral-100
                           hover:bg-neutral-200 rounded-xl transition-all duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || isSaving}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-primary-500
                           hover:bg-primary-600 rounded-xl transition-all duration-200
                           disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
              >
                {isSaving ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        )}

        {/* Projects list */}
        {sortedProjects.length === 0 ? (
          <div className="text-center py-16 animate-fade-in-up">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary-50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3h7l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
              </svg>
            </div>
            <p className="font-display text-xl text-neutral-700 mb-2">No projects yet</p>
            <p className="text-neutral-500">Create a project to organize your tasks</p>
          </div>
        ) : (
          <div className="space-y-2 stagger-in">
            {sortedProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className="group w-full flex items-center gap-4 p-5 rounded-2xl bg-white/60 backdrop-blur-sm
                           hover:bg-white hover:shadow-md transition-all duration-200 ease-out text-left"
              >
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 flex-shrink-0
                                group-hover:bg-primary-100 transition-colors duration-200">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3h7l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                  </svg>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-neutral-800 truncate group-hover:text-neutral-900 transition-colors duration-200">
                    {project.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-lg ${statusConfig[project.status].bg} ${statusConfig[project.status].color}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {statusConfig[project.status].label}
                    </span>
                    {project.notes && (
                      <span className="text-xs text-neutral-400 truncate max-w-[200px]">{project.notes}</span>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5 text-neutral-300 shrink-0 transition-all duration-200 group-hover:text-neutral-500 group-hover:translate-x-0.5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
