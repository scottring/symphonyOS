import { useState, useRef } from 'react'
import type { PlanningResourceType, CreatePlanningResourceInput } from '@/types/planning'

interface AddResourceModalProps {
  mode: PlanningResourceType
  onAdd: (input: CreatePlanningResourceInput) => Promise<unknown>
  onUploadFile?: (resourceId: string, file: File) => Promise<string | null>
  onClose: () => void
}

const ALLOWED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv,.txt'

export function AddResourceModal({ mode, onAdd, onUploadFile, onClose }: AddResourceModalProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const modeLabels: Record<PlanningResourceType, { heading: string; titlePlaceholder: string; contentPlaceholder: string }> = {
    paste: {
      heading: 'Paste Research',
      titlePlaceholder: 'Article title or description',
      contentPlaceholder: 'Paste article text, excerpts, or research notes here...',
    },
    upload: {
      heading: 'Upload Document',
      titlePlaceholder: 'Document title',
      contentPlaceholder: 'Optional notes about this document...',
    },
    note: {
      heading: 'Add Note',
      titlePlaceholder: 'Note title',
      contentPlaceholder: 'Your thoughts, insights, or observations...',
    },
  }

  const labels = modeLabels[mode]

  const handleSubmit = async () => {
    if (!title.trim()) return
    if (mode === 'upload' && !file) return

    setSaving(true)
    try {
      const resource = await onAdd({
        title: title.trim(),
        content: content.trim() || undefined,
        resourceType: mode,
        sourceUrl: sourceUrl.trim() || undefined,
      })

      // If uploading a file, attach it to the resource
      if (mode === 'upload' && file && resource && onUploadFile) {
        await onUploadFile((resource as { id: string }).id, file)
      }

      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col animate-scale-up">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-800">{labels.heading}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={labels.titlePlaceholder}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-300/50 focus:border-primary-300"
              autoFocus
            />

            {mode === 'upload' && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_EXTENSIONS}
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                {file ? (
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary-50 border border-primary-200">
                    <svg className="w-5 h-5 text-primary-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-primary-700 font-medium truncate">{file.name}</p>
                      <p className="text-xs text-primary-500">{(file.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button onClick={() => setFile(null)} className="text-primary-400 hover:text-primary-600">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-8 rounded-xl border-2 border-dashed border-neutral-200 text-neutral-400 hover:border-neutral-300 hover:text-neutral-500 transition-colors flex flex-col items-center gap-2"
                  >
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className="text-sm">Choose file (PDF, Word, text, images)</span>
                  </button>
                )}
              </div>
            )}

            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={labels.contentPlaceholder}
              rows={mode === 'paste' ? 12 : mode === 'upload' ? 3 : 8}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-300/50 focus:border-primary-300 resize-none leading-relaxed"
            />

            {mode === 'paste' && (
              <input
                type="url"
                value={sourceUrl}
                onChange={e => setSourceUrl(e.target.value)}
                placeholder="Source URL (optional)"
                className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-300/50 focus:border-primary-300"
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-5 py-4 border-t border-neutral-100">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-neutral-500 hover:bg-neutral-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!title.trim() || (mode === 'upload' && !file) || saving}
              className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
