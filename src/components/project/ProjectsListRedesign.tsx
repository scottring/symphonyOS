import { useState, useRef, useEffect, useMemo } from 'react'
import type { Project } from '@/types/project'
import type { Task } from '@/types/task'

interface ProjectsListProps {
  projects: Project[]
  tasks?: Task[]
  onSelectProject: (projectId: string) => void
  onAddProject?: (project: { name: string }) => Promise<Project | null>
}

interface ProjectWithStats extends Project {
  taskCount: number
  completedCount: number
}

interface SectionHeaderProps {
  title: string
  count: number
  collapsed?: boolean
  onToggle?: () => void
}

function SectionHeader({ title, count, collapsed, onToggle }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-4">
      {onToggle ? (
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider
                     hover:text-neutral-600 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-4 h-4 transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          {title}
          <span className="text-neutral-300">({count})</span>
        </button>
      ) : (
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
          {title} <span className="text-neutral-300">({count})</span>
        </span>
      )}
    </div>
  )
}

export function ProjectsListRedesign({ projects, tasks = [], onSelectProject, onAddProject }: ProjectsListProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [completedExpanded, setCompletedExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus()
    }
  }, [isCreating])

  // Compute task stats per project
  const projectsWithStats: ProjectWithStats[] = useMemo(() => {
    return projects.map(project => {
      const projectTasks = tasks.filter(t => t.projectId === project.id && !t.parentTaskId)
      const completedCount = projectTasks.filter(t => t.completed).length
      return {
        ...project,
        taskCount: projectTasks.length,
        completedCount,
      }
    })
  }, [projects, tasks])

  // Group by status
  const inProgressProjects = projectsWithStats.filter(p => p.status === 'in_progress')
  const onHoldProjects = projectsWithStats.filter(p => p.status === 'on_hold')
  const notStartedProjects = projectsWithStats.filter(p => p.status === 'not_started')
  const completedProjects = projectsWithStats.filter(p => p.status === 'completed')

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

  // Progress bar component
  const ProgressBar = ({ completed, total }: { completed: number; total: number }) => {
    const percent = total > 0 ? (completed / total) * 100 : 0
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-xs text-neutral-400 font-medium tabular-nums">
          {completed}/{total}
        </span>
      </div>
    )
  }

  // Render a project card
  const renderProjectCard = (project: ProjectWithStats, index: number) => {
    const remainingTasks = project.taskCount - project.completedCount

    return (
      <button
        key={project.id}
        onClick={() => onSelectProject(project.id)}
        className="w-full flex items-center gap-4 p-5 rounded-2xl bg-white border border-neutral-100
                   hover:border-blue-200 hover:shadow-md transition-all duration-200 text-left group"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        {/* Folder icon in circle */}
        <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0
                        group-hover:bg-blue-200 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-neutral-800 text-base truncate group-hover:text-blue-700 transition-colors">
            {project.name}
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm text-neutral-500">
            {project.taskCount > 0 ? (
              <span>
                {remainingTasks === 0
                  ? 'All tasks complete'
                  : `${remainingTasks} task${remainingTasks !== 1 ? 's' : ''} remaining`
                }
              </span>
            ) : (
              <span className="text-neutral-400">No tasks yet</span>
            )}
          </div>
        </div>

        {/* Progress indicator */}
        {project.taskCount > 0 && (
          <div className="flex-shrink-0">
            <ProgressBar completed={project.completedCount} total={project.taskCount} />
          </div>
        )}

        {/* Chevron */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5 text-neutral-300 group-hover:text-blue-400 group-hover:translate-x-1 transition-all flex-shrink-0"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </button>
    )
  }

  const hasProjects = projects.length > 0

  return (
    <div className="h-full overflow-auto bg-[var(--color-bg-base)]">
      {/* Subtle blue gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-blue-50/50 to-transparent pointer-events-none" />

      <div className="relative max-w-3xl mx-auto px-6 md:px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-semibold text-neutral-800 tracking-tight">
              Projects
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              {projects.length} project{projects.length !== 1 ? 's' : ''}
            </p>
          </div>

          {onAddProject && !isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-xl font-medium
                         hover:bg-blue-600 active:bg-blue-700 transition-colors shadow-sm
                         hover:shadow-md"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              New Project
            </button>
          )}
        </div>

        {/* Inline project creation form */}
        {isCreating && (
          <div className="mb-8 p-6 rounded-2xl bg-white border border-blue-200 shadow-lg animate-fade-in-scale">
            <input
              ref={inputRef}
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's the project?"
              className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50
                         text-neutral-800 placeholder:text-neutral-400 text-2xl font-display
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         transition-all"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || isSaving}
                className="px-5 py-2.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!hasProjects && (
          <div className="text-center py-16 animate-fade-in-up">
            <div className="w-20 h-20 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-5">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
            </div>
            <h2 className="font-display text-xl font-semibold text-neutral-700 mb-2">No projects yet</h2>
            <p className="text-neutral-500 mb-6 max-w-sm mx-auto">
              Projects help you organize related tasks together. Create your first project to get started.
            </p>
            {onAddProject && (
              <button
                onClick={() => setIsCreating(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-xl font-medium
                           hover:bg-blue-600 transition-colors shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Create your first project
              </button>
            )}
          </div>
        )}

        {/* Project sections */}
        {hasProjects && (
          <div className="space-y-10">
            {/* In Progress projects */}
            {inProgressProjects.length > 0 && (
              <section>
                <SectionHeader title="In Progress" count={inProgressProjects.length} />
                <div className="space-y-3 stagger-in">
                  {inProgressProjects.map((project, index) => renderProjectCard(project, index))}
                </div>
              </section>
            )}

            {/* Not started projects */}
            {notStartedProjects.length > 0 && (
              <section>
                <SectionHeader title="Not Started" count={notStartedProjects.length} />
                <div className="space-y-3 stagger-in">
                  {notStartedProjects.map((project, index) => renderProjectCard(project, index))}
                </div>
              </section>
            )}

            {/* On Hold projects */}
            {onHoldProjects.length > 0 && (
              <section>
                <SectionHeader title="On Hold" count={onHoldProjects.length} />
                <div className="space-y-3 stagger-in opacity-80">
                  {onHoldProjects.map((project, index) => renderProjectCard(project, index))}
                </div>
              </section>
            )}

            {/* Completed projects - collapsible */}
            {completedProjects.length > 0 && (
              <section>
                <SectionHeader
                  title="Completed"
                  count={completedProjects.length}
                  collapsed={!completedExpanded}
                  onToggle={() => setCompletedExpanded(!completedExpanded)}
                />
                {completedExpanded && (
                  <div className="space-y-3 stagger-in opacity-70">
                    {completedProjects.map((project, index) => renderProjectCard(project, index))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
