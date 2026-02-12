import { useState } from 'react'
import type { Entry, DiscussionContent } from '@/types/entry'

interface Props {
  entry: Entry
  onUpdate?: (updates: Partial<Entry>) => void
  mode?: 'card' | 'full'
}

const AUDIENCE_LABELS = {
  family: 'Whole Family',
  couple: 'Couple',
  'parent-child': 'Parent & Child',
}

export function DiscussionRenderer({ entry, onUpdate, mode = 'card' }: Props) {
  const c = entry.content as DiscussionContent
  const [showScript, setShowScript] = useState(false)

  return (
    <div className="space-y-3">
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-500">
        {AUDIENCE_LABELS[c.targetAudience] || c.targetAudience}
      </span>

      <p className={`text-sm text-stone-600 ${mode === 'card' ? 'line-clamp-2' : ''}`}>
        {c.prompt}
      </p>

      {c.suggestedScript && (
        <div>
          <button
            onClick={() => setShowScript(!showScript)}
            className="text-xs text-indigo-500 hover:text-indigo-600 flex items-center gap-1"
          >
            <svg className={`w-3 h-3 transition-transform ${showScript ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {showScript ? 'Hide' : 'Show'} suggested script
          </button>
          {showScript && (
            <div className="mt-2 bg-indigo-50/50 rounded-lg p-3 border border-indigo-100">
              <p className="text-sm text-stone-600 italic">&ldquo;{c.suggestedScript}&rdquo;</p>
            </div>
          )}
        </div>
      )}

      {c.responses && c.responses.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-stone-500">Responses</p>
          {c.responses.map((r, i) => (
            <div key={i} className="bg-stone-50 rounded-lg p-2.5">
              <p className="text-xs font-medium text-stone-500 mb-0.5">{r.personName}</p>
              <p className="text-sm text-stone-600">{r.response}</p>
            </div>
          ))}
        </div>
      )}

      {onUpdate && mode === 'full' && (!c.responses || c.responses.length === 0) && (
        <p className="text-xs text-stone-400 italic">No responses yet. Start the discussion with your family!</p>
      )}
    </div>
  )
}
