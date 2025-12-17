import { useEffect, useRef, useState, useCallback } from 'react'
import type { Note, NoteTopic, NoteEntityLink, NoteEntityType, UpdateNoteInput } from '@/types/note'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import { formatRelativeTime } from '@/lib/timeUtils'
import { noteTypeLabels, noteTypeDotColors } from '@/types/note'
import { TiptapEditor } from './TiptapEditor'
import { TopicPicker } from './TopicPicker'
import { EntityLinkPicker } from './EntityLinkPicker'

interface NoteModalProps {
  isOpen: boolean
  note: Note | null
  topics: NoteTopic[]
  entityLinks?: NoteEntityLink[]
  // Entity data for resolving names
  tasks?: Task[]
  projects?: Project[]
  contacts?: Contact[]
  onClose: () => void
  onUpdate: (id: string, updates: UpdateNoteInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddTopic?: (name: string) => Promise<NoteTopic | null>
  onAddEntityLink?: (noteId: string, entityType: NoteEntityType, entityId: string) => Promise<void>
  onRemoveEntityLink?: (linkId: string) => Promise<void>
}

export function NoteModal({
  isOpen,
  note,
  topics,
  entityLinks = [],
  tasks = [],
  projects = [],
  contacts = [],
  onClose,
  onUpdate,
  onDelete,
  onAddTopic,
  onAddEntityLink,
  onRemoveEntityLink,
}: NoteModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [editContent, setEditContent] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showEntityPicker, setShowEntityPicker] = useState(false)
  const [removingLinkId, setRemovingLinkId] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Initialize content when note changes
  useEffect(() => {
    if (note) {
      setEditContent(note.content)
      setHasUnsavedChanges(false)
    }
    setShowDeleteConfirm(false)
    setShowEntityPicker(false)
  }, [note?.id])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, hasUnsavedChanges])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleContentChange = useCallback((newContent: string) => {
    setEditContent(newContent)
    setHasUnsavedChanges(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!note || !editContent.trim() || isSaving) return
    setIsSaving(true)
    try {
      await onUpdate(note.id, { content: editContent.trim() })
      setHasUnsavedChanges(false)
    } finally {
      setIsSaving(false)
    }
  }, [note, editContent, onUpdate, isSaving])

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      // Auto-save on close
      handleSave().then(() => onClose())
    } else {
      onClose()
    }
  }, [hasUnsavedChanges, handleSave, onClose])

  const handleDelete = useCallback(async () => {
    if (!note || isDeleting) return
    setIsDeleting(true)
    try {
      await onDelete(note.id)
      onClose()
    } finally {
      setIsDeleting(false)
    }
  }, [note, onDelete, onClose, isDeleting])

  const handleTopicChange = useCallback(
    async (topicId: string | null) => {
      if (!note) return
      await onUpdate(note.id, { topicId })
    },
    [note, onUpdate]
  )

  const handleAddEntityLink = useCallback(
    async (entityType: NoteEntityType, entityId: string) => {
      if (!note || !onAddEntityLink) return
      await onAddEntityLink(note.id, entityType, entityId)
      setShowEntityPicker(false)
    },
    [note, onAddEntityLink]
  )

  const handleRemoveEntityLink = useCallback(
    async (linkId: string) => {
      if (!onRemoveEntityLink) return
      setRemovingLinkId(linkId)
      try {
        await onRemoveEntityLink(linkId)
      } finally {
        setRemovingLinkId(null)
      }
    },
    [onRemoveEntityLink]
  )

  // Create lookup map for entity names
  const getEntityInfo = useCallback((entityType: NoteEntityType, entityId: string) => {
    switch (entityType) {
      case 'task': {
        const task = tasks.find((t) => t.id === entityId)
        return task ? { name: task.title, icon: '📋' } : null
      }
      case 'project': {
        const project = projects.find((p) => p.id === entityId)
        return project ? { name: project.name, icon: '📁' } : null
      }
      case 'contact': {
        const contact = contacts.find((c) => c.id === entityId)
        return contact ? { name: contact.name, icon: '👤' } : null
      }
      default:
        return null
    }
  }, [tasks, projects, contacts])

  if (!isOpen || !note) return null

  const topic = note.topicId ? topics.find((t) => t.id === note.topicId) : undefined
  const displayTitle = note.title || note.content.split('\n')[0] || 'Untitled'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleClose}
    >
      {/* Modal - Full screen on mobile, large modal on desktop */}
      <div
        ref={modalRef}
        className="bg-white w-full max-w-4xl h-[90vh] md:h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit note"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-neutral-100 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <h1 className="text-2xl font-display leading-tight text-neutral-800 mb-2 truncate">
              {displayTitle}
            </h1>
            <div className="flex items-center gap-3 text-sm text-neutral-500 flex-wrap">
              <time>{formatRelativeTime(note.createdAt)}</time>
              {note.type !== 'general' && noteTypeLabels[note.type] && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${noteTypeDotColors[note.type]}`} />
                    {noteTypeLabels[note.type]}
                  </span>
                </>
              )}
              {hasUnsavedChanges && (
                <>
                  <span>•</span>
                  <span className="text-amber-600">Unsaved changes</span>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving}
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              aria-label="Delete note"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              onClick={handleClose}
              className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        {/* Topic picker */}
        <div className="px-6 py-3 border-b border-neutral-100 flex-shrink-0">
          <TopicPicker
            topics={topics}
            selectedTopicId={topic?.id}
            onSelect={handleTopicChange}
            onCreate={onAddTopic}
          />
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Rich text editor */}
          <TiptapEditor
            content={editContent}
            onChange={handleContentChange}
            placeholder="Start writing your note..."
            autoFocus
          />

          {/* Entity links */}
          <div className="mt-8 pt-6 border-t border-neutral-100">
            <h3 className="text-xs uppercase tracking-wide text-neutral-400 mb-3 font-medium">
              Linked to
            </h3>
            {entityLinks.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-3">
                {entityLinks.map((link) => {
                  const entityInfo = getEntityInfo(link.entityType, link.entityId)
                  const isRemoving = removingLinkId === link.id
                  return (
                    <div
                      key={link.id}
                      className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-100
                        ${isRemoving ? 'opacity-50' : ''}
                      `}
                    >
                      <span className="text-sm">{entityInfo?.icon || '📄'}</span>
                      <span className="text-sm text-neutral-700">
                        {entityInfo?.name || `${link.entityType}: ${link.entityId.substring(0, 8)}...`}
                      </span>
                      {onRemoveEntityLink && (
                        <button
                          onClick={() => handleRemoveEntityLink(link.id)}
                          disabled={isRemoving}
                          className="p-0.5 text-neutral-400 hover:text-red-500 transition-colors disabled:cursor-not-allowed"
                          aria-label={`Remove ${entityInfo?.name || 'link'}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-neutral-400 mb-3">No linked items yet</p>
            )}

            {/* Add link button */}
            {onAddEntityLink && (
              <div className="relative inline-block">
                <button
                  onClick={() => setShowEntityPicker(!showEntityPicker)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 rounded-lg transition-colors border border-dashed border-neutral-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Link to task, project, or contact
                </button>

                {showEntityPicker && (
                  <div className="absolute bottom-full left-0 mb-2 z-10">
                    <EntityLinkPicker
                      tasks={tasks}
                      projects={projects}
                      contacts={contacts}
                      onSelect={handleAddEntityLink}
                      onClose={() => setShowEntityPicker(false)}
                      excludeLinks={entityLinks.map((l) => ({ entityType: l.entityType, entityId: l.entityId }))}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer with keyboard hints */}
        <div className="hidden md:flex items-center gap-4 px-6 py-3 border-t border-neutral-100 text-xs text-neutral-400 flex-shrink-0">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-neutral-100 rounded text-neutral-500">⌘S</kbd>
            to save
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-neutral-100 rounded text-neutral-500">Esc</kbd>
            to close
          </span>
        </div>

        {/* Delete confirmation overlay */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-white/95 flex items-center justify-center rounded-2xl">
            <div className="bg-white p-6 rounded-xl shadow-lg border border-neutral-100 max-w-sm text-center">
              <h3 className="font-display text-lg mb-2 text-neutral-800">Delete this note?</h3>
              <p className="text-neutral-500 text-sm mb-4">This action cannot be undone.</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
