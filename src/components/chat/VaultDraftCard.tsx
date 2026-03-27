import { useState } from 'react'

interface VaultDraftCardProps {
  title: string
  content: string
  onSave: (title: string, content: string) => Promise<boolean>
  onDismiss: () => void
}

export function VaultDraftCard({ title, content, onSave, onDismiss }: VaultDraftCardProps) {
  const [state, setState] = useState<'preview' | 'editing' | 'saving' | 'saved'>('preview')
  const [editTitle, setEditTitle] = useState(title)
  const [editContent, setEditContent] = useState(content)

  const handleSave = async () => {
    setState('saving')
    const ok = await onSave(editTitle, editContent)
    setState(ok ? 'saved' : 'preview')
  }

  if (state === 'saved') {
    return (
      <div className="mx-2 mb-3 rounded-xl border border-primary-200 bg-primary-50/50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-primary-700">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          <span className="font-medium">Saved to Vault</span>
          <span className="text-primary-500 text-xs">"{editTitle}"</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-2 mb-3 rounded-xl border border-violet-200 bg-violet-50/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-violet-100">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-violet-500" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
          </svg>
          <span className="text-xs font-medium text-violet-700">Draft Note</span>
        </div>
        <div className="flex items-center gap-1">
          {state === 'preview' && (
            <button
              onClick={() => setState('editing')}
              className="text-[10px] px-2 py-1 rounded-md text-violet-600 hover:bg-violet-100 transition-colors"
            >
              Edit
            </button>
          )}
          {state === 'editing' && (
            <button
              onClick={() => setState('preview')}
              className="text-[10px] px-2 py-1 rounded-md text-violet-600 hover:bg-violet-100 transition-colors"
            >
              Preview
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {state === 'editing' ? (
          <div className="space-y-2">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full text-sm font-medium text-neutral-800 bg-white border border-violet-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300"
              placeholder="Note title"
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={8}
              className="w-full text-xs text-neutral-700 leading-relaxed bg-white border border-violet-200 rounded-md px-2.5 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-violet-300"
            />
          </div>
        ) : (
          <div>
            <h4 className="text-sm font-medium text-neutral-800 mb-1.5">{editTitle}</h4>
            <div className="text-xs text-neutral-600 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
              {editContent}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-violet-100 bg-violet-50/50">
        <button
          onClick={onDismiss}
          disabled={state === 'saving'}
          className="text-xs px-3 py-1.5 rounded-md text-neutral-500 hover:text-neutral-700 hover:bg-white transition-colors disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          onClick={handleSave}
          disabled={state === 'saving' || !editTitle.trim()}
          className="text-xs px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50 font-medium"
        >
          {state === 'saving' ? 'Saving...' : 'Save to Vault'}
        </button>
      </div>
    </div>
  )
}
