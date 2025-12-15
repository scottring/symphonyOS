import { useState, useCallback, useEffect, useRef } from 'react'
import type { Note, NoteTopic, NoteEntityLink, UpdateNoteInput } from '@/types/note'
import { noteTypeLabels, noteTypeDotColors } from '@/types/note'
import { formatRelativeTime } from '@/lib/timeUtils'
import { TopicPicker } from './TopicPicker'

interface NoteDetailProps {
  note: Note | null
  topics: NoteTopic[]
  entityLinks?: NoteEntityLink[]
  onUpdate: (id: string, updates: UpdateNoteInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddTopic?: (name: string) => Promise<NoteTopic | null>
  onClose?: () => void
}

export function NoteDetail({
  note,
  topics,
  entityLinks = [],
  onUpdate,
  onDelete,
  onAddTopic,
  onClose,
}: NoteDetailProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Reset editing state when note changes
  // Using note?.id and note?.content as dependencies to avoid unnecessary re-runs when other note properties change
  useEffect(() => {
    setIsEditing(false)
    setShowDeleteConfirm(false)
    if (note) {
      setEditContent(note.content)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, note?.content])

  const handleSave = useCallback(async () => {
    if (!note || !editContent.trim()) return
    await onUpdate(note.id, { content: editContent.trim() })
    setIsEditing(false)
  }, [note, editContent, onUpdate])

  const handleDelete = useCallback(async () => {
    if (!note || isDeleting) return
    setIsDeleting(true)
    try {
      await onDelete(note.id)
      onClose?.()
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

  // Auto-resize textarea
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [isEditing, editContent])

  if (!note) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-8 h-8 text-neutral-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <p className="text-neutral-500 text-sm">Select a note to view</p>
      </div>
    )
  }

  const topic = note.topicId ? topics.find((t) => t.id === note.topicId) : undefined
  const lines = note.content.split('\n')
  const displayTitle = note.title || lines[0] || 'Untitled'

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-6 pb-0 gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-display leading-tight text-neutral-800 mb-2">
            {displayTitle}
          </h1>
          <div className="flex items-center gap-3 text-sm text-neutral-500">
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
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={() => {
                  setIsEditing(false)
                  setEditContent(note.content)
                }}
                className="px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Save
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                aria-label="Edit note"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
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
            </>
          )}
        </div>
      </div>

      {/* Topic picker */}
      <div className="px-6 py-3">
        <TopicPicker
          topics={topics}
          selectedTopicId={topic?.id}
          onSelect={handleTopicChange}
          onCreate={onAddTopic}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full min-h-[200px] text-neutral-700 bg-transparent border-none resize-none focus:outline-none leading-relaxed"
            autoFocus
          />
        ) : (
          <div className="prose prose-neutral max-w-none">
            {note.content.split('\n').map((line, i) => (
              <p key={i} className="text-neutral-700 leading-relaxed">
                {line || '\u00A0'}
              </p>
            ))}
          </div>
        )}

        {/* Entity links */}
        {entityLinks.length > 0 && (
          <div className="mt-8 pt-6 border-t border-neutral-100">
            <h3 className="text-xs uppercase tracking-wide text-neutral-400 mb-3 font-medium">
              Linked to
            </h3>
            <div className="flex flex-wrap gap-2">
              {entityLinks.map((link) => (
                <span
                  key={link.id}
                  className="px-3 py-1.5 rounded-full text-sm bg-neutral-100 text-neutral-600"
                >
                  {link.entityType}: {link.entityId.substring(0, 8)}...
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-white/90 flex items-center justify-center">
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
  )
}
