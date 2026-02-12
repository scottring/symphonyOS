import { useState } from 'react'
import type { Entry, ReflectionContent } from '@/types/entry'

interface Props {
  entry: Entry
  onUpdate?: (updates: Partial<Entry>) => void
  mode?: 'card' | 'full'
}

const SENTIMENT_STYLES = {
  positive: 'bg-emerald-50 text-emerald-600',
  neutral: 'bg-stone-100 text-stone-500',
  difficult: 'bg-amber-50 text-amber-600',
}

export function ReflectionRenderer({ entry, onUpdate, mode = 'card' }: Props) {
  const c = entry.content as ReflectionContent
  const [draft, setDraft] = useState(c.response || '')
  const [editing, setEditing] = useState(false)

  const handleSave = () => {
    if (!onUpdate) return
    onUpdate({ content: { ...c, response: draft } })
    setEditing(false)
  }

  return (
    <div className="space-y-3">
      <div className="bg-stone-50 rounded-lg p-3">
        <p className="text-sm text-stone-500 italic">{c.prompt}</p>
      </div>

      {c.sentiment && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${SENTIMENT_STYLES[c.sentiment]}`}>
          {c.sentiment}
        </span>
      )}

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            className="w-full text-sm text-stone-600 border border-stone-200 rounded-lg p-3 focus:outline-none focus:border-stone-400 resize-none"
            placeholder="Write your reflection..."
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="text-xs text-stone-400 hover:text-stone-600 px-3 py-1.5">
              Cancel
            </button>
            <button onClick={handleSave} className="text-xs bg-stone-900 text-white px-3 py-1.5 rounded-lg hover:bg-stone-800">
              Save
            </button>
          </div>
        </div>
      ) : c.response ? (
        <div>
          <p className={`text-sm text-stone-600 ${mode === 'card' ? 'line-clamp-3' : ''}`}>{c.response}</p>
          {onUpdate && (
            <button onClick={() => setEditing(true)} className="text-xs text-stone-400 hover:text-stone-600 mt-1">
              Edit response
            </button>
          )}
        </div>
      ) : onUpdate ? (
        <button
          onClick={() => setEditing(true)}
          className="text-sm text-stone-400 hover:text-stone-600 border border-dashed border-stone-200 rounded-lg p-3 w-full text-left"
        >
          Write your reflection...
        </button>
      ) : (
        <p className="text-sm text-stone-400 italic">No response yet</p>
      )}
    </div>
  )
}
