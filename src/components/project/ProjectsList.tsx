import type { Project, ProjectStatus } from '@/types/project'

interface ProjectsListProps {
  projects: Project[]
  onSelectProject: (projectId: string) => void
  onAddProject?: () => void
}

export function ProjectsList({ projects, onSelectProject, onAddProject }: ProjectsListProps) {
  const statusLabel = (status: ProjectStatus) => {
    switch (status) {
      case 'not_started':
        return 'Not Started'
      case 'active':
        return 'Active'
      case 'completed':
        return 'Completed'
    }
  }

  const statusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'not_started':
        return 'bg-neutral-100 text-neutral-600'
      case 'active':
        return 'bg-blue-100 text-blue-700'
      case 'completed':
        return 'bg-green-100 text-green-700'
    }
  }

  // Sort: active first, then not_started, then completed
  const sortedProjects = [...projects].sort((a, b) => {
    const order: Record<ProjectStatus, number> = { active: 0, not_started: 1, completed: 2 }
    return order[a.status] - order[b.status]
  })

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-neutral-800">Projects</h1>
            {onAddProject && (
              <button
                onClick={onAddProject}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                New
              </button>
            )}
          </div>
          <p className="text-sm text-neutral-500 mt-1">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Projects list */}
        {sortedProjects.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
            </div>
            <p className="text-neutral-500 mb-2">No projects yet</p>
            <p className="text-sm text-neutral-400">Create a project to organize your tasks</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-white border border-neutral-100 hover:border-neutral-200 hover:shadow-sm transition-all text-left"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-neutral-800 truncate">{project.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${statusColor(project.status)}`}>
                      {statusLabel(project.status)}
                    </span>
                    {project.notes && (
                      <span className="text-xs text-neutral-400 truncate">{project.notes}</span>
                    )}
                  </div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
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
