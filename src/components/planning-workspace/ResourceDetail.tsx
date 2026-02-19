import { useState, useEffect, useCallback } from 'react'
import type { PlanningResource, UpdatePlanningResourceInput } from '@/types/planning'

interface ResourceDetailProps {
  resource: PlanningResource
  onUpdate: (id: string, updates: UpdatePlanningResourceInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onOpenFile?: (filePath: string) => Promise<void>
}

export function ResourceDetail({ resource, onUpdate, onDelete, onOpenFile }: ResourceDetailProps) {
  const [title, setTitle] = useState(resource.title)
  const [content, setContent] = useState(resource.content || '')
  const [sourceUrl, setSourceUrl] = useState(resource.sourceUrl || '')
  const [deleting, setDeleting] = useState(false)

  // Reset when resource changes
  useEffect(() => {
    setTitle(resource.title)
    setContent(resource.content || '')
    setSourceUrl(resource.sourceUrl || '')
  }, [resource.id, resource.title, resource.content, resource.sourceUrl])

  // Debounced auto-save
  const saveTimeout = useCallback(() => {
    let timer: ReturnType<typeof setTimeout>
    return (updates: UpdatePlanningResourceInput) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        onUpdate(resource.id, updates)
      }, 800)
    }
  }, [resource.id, onUpdate])

  const [debouncedSave] = useState(saveTimeout)

  const handleTitleChange = (value: string) => {
    setTitle(value)
    if (value.trim()) debouncedSave({ title: value.trim() })
  }

  const handleContentChange = (value: string) => {
    setContent(value)
    debouncedSave({ content: value })
  }

  const handleSourceUrlBlur = () => {
    if (sourceUrl !== (resource.sourceUrl || '')) {
      onUpdate(resource.id, { sourceUrl: sourceUrl.trim() || null })
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    await onDelete(resource.id)
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
            {resource.resourceType === 'paste' ? 'Pasted Text' : resource.resourceType === 'upload' ? 'Document' : 'Note'}
          </span>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 rounded-lg text-neutral-300 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Editable content */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={e => handleTitleChange(e.target.value)}
          className="w-full text-lg font-semibold text-neutral-800 bg-transparent border-none outline-none placeholder:text-neutral-300"
          placeholder="Title"
        />

        {/* File info for uploads */}
        {resource.resourceType === 'upload' && resource.fileName && (
          <button
            onClick={() => resource.filePath && onOpenFile?.(resource.filePath)}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-200 hover:bg-neutral-100 transition-colors text-left"
          >
            <svg className="w-5 h-5 text-primary-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-700 font-medium truncate">{resource.fileName}</p>
              {resource.fileSize && (
                <p className="text-xs text-neutral-400">{formatFileSize(resource.fileSize)}</p>
              )}
            </div>
            <svg className="w-4 h-4 text-neutral-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        )}

        {/* Content */}
        <textarea
          value={content}
          onChange={e => handleContentChange(e.target.value)}
          placeholder={resource.resourceType === 'upload' ? 'Notes about this document...' : 'Content...'}
          className="w-full min-h-[200px] text-sm text-neutral-600 bg-transparent border-none outline-none resize-none leading-relaxed placeholder:text-neutral-300"
        />

        {/* Source URL */}
        {(resource.resourceType === 'paste' || sourceUrl) && (
          <div>
            <label className="block text-[11px] font-medium text-neutral-400 mb-1">Source</label>
            <input
              type="url"
              value={sourceUrl}
              onChange={e => setSourceUrl(e.target.value)}
              onBlur={handleSourceUrlBlur}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-200 text-sm text-neutral-600 placeholder:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-300/50"
            />
          </div>
        )}
      </div>
    </div>
  )
}
