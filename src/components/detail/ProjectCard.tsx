import { useState } from 'react'
import type { Project, ProjectStatus } from '@/types/project'

interface ProjectCardProps {
  project: Project
  onUnlink?: () => void
  onUpdate?: (projectId: string, updates: Partial<Project>) => void
  onOpen?: () => void
}

export function ProjectCard({ project, onUnlink, onUpdate, onOpen }: ProjectCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editStatus, setEditStatus] = useState<ProjectStatus>('not_started')
  const [editNotes, setEditNotes] = useState('')

  const handleEdit = () => {
    setEditName(project.name)
    setEditStatus(project.status)
    setEditNotes(project.notes || '')
    setIsEditing(true)
  }

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(project.id, {
        name: editName.trim(),
        status: editStatus,
        notes: editNotes.trim() || undefined,
      })
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditName('')
    setEditStatus('not_started')
    setEditNotes('')
  }

  const statusLabel = (status: ProjectStatus) => {
    switch (status) {
      case 'not_started':
        return 'Not Started'
      case 'in_progress':
        return 'In Progress'
      case 'on_hold':
        return 'On Hold'
      case 'completed':
        return 'Completed'
    }
  }

  const statusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'not_started':
        return 'bg-neutral-100 text-neutral-600'
      case 'in_progress':
        return 'bg-blue-100 text-blue-700'
      case 'on_hold':
        return 'bg-amber-100 text-amber-700'
      case 'completed':
        return 'bg-green-100 text-green-700'
    }
  }

  if (isEditing) {
    return (
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Status</label>
            <div className="flex rounded-lg border border-neutral-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setEditStatus('not_started')}
                className={`flex-1 py-2 px-2 text-sm font-medium transition-colors
                  ${editStatus === 'not_started'
                    ? 'bg-neutral-100 text-neutral-700'
                    : 'bg-white text-neutral-500 hover:bg-neutral-50'
                  }`}
              >
                Not Started
              </button>
              <button
                type="button"
                onClick={() => setEditStatus('in_progress')}
                className={`flex-1 py-2 px-2 text-sm font-medium border-l border-neutral-200 transition-colors
                  ${editStatus === 'in_progress'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-white text-neutral-500 hover:bg-neutral-50'
                  }`}
              >
                In Progress
              </button>
              <button
                type="button"
                onClick={() => setEditStatus('on_hold')}
                className={`flex-1 py-2 px-2 text-sm font-medium border-l border-neutral-200 transition-colors
                  ${editStatus === 'on_hold'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-white text-neutral-500 hover:bg-neutral-50'
                  }`}
              >
                On Hold
              </button>
              <button
                type="button"
                onClick={() => setEditStatus('completed')}
                className={`flex-1 py-2 px-2 text-sm font-medium border-l border-neutral-200 transition-colors
                  ${editStatus === 'completed'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-white text-neutral-500 hover:bg-neutral-50'
                  }`}
              >
                Completed
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Notes (optional)</label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Add notes about this project..."
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         resize-none"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCancel}
              className="flex-1 py-2 px-3 text-sm font-medium text-neutral-600 bg-white rounded-lg hover:bg-neutral-50 transition-colors border border-neutral-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!editName.trim()}
              className="flex-1 py-2 px-3 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-neutral-800">{project.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${statusColor(project.status)}`}>
              {statusLabel(project.status)}
            </span>
          </div>
          {project.notes && (
            <p className="text-sm text-neutral-600 mt-2 line-clamp-2">{project.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onOpen && (
            <button
              onClick={onOpen}
              className="p-1.5 text-neutral-400 hover:text-blue-600 hover:bg-white rounded-lg transition-colors"
              aria-label="Open project"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          {onUpdate && (
            <button
              onClick={handleEdit}
              className="p-1.5 text-neutral-400 hover:text-blue-600 hover:bg-white rounded-lg transition-colors"
              aria-label="Edit project"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
          )}
          {onUnlink && (
            <button
              onClick={onUnlink}
              className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-white rounded-lg transition-colors"
              aria-label="Unlink project"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
