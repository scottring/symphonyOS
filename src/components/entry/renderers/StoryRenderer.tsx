import { useState } from 'react'
import type { Entry, StoryContent } from '@/types/entry'

interface Props {
  entry: Entry
  onUpdate?: (updates: Partial<Entry>) => void
  mode?: 'card' | 'full'
}

export function StoryRenderer({ entry, mode = 'card' }: Props) {
  const c = entry.content as StoryContent
  const [expanded, setExpanded] = useState(mode === 'full')
  const isLong = c.body.length > 200

  return (
    <div className="space-y-2">
      {c.theme && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-500">
          {c.theme}
        </span>
      )}
      {c.characterName && (
        <p className="text-xs text-stone-400">Featuring: {c.characterName}</p>
      )}
      <div className={`text-sm text-stone-600 whitespace-pre-line ${!expanded && isLong ? 'line-clamp-3' : ''}`}>
        {c.body}
      </div>
      {isLong && mode === 'card' && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
        >
          {expanded ? 'Show less' : 'Read more...'}
        </button>
      )}
      {c.readAloud && (
        <div className="flex items-center gap-1.5 text-xs text-stone-400">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M6 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h2l4-4v14l-4-4z" />
          </svg>
          Read aloud
        </div>
      )}
    </div>
  )
}
