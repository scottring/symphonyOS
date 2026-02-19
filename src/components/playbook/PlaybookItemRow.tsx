import { useState } from 'react'
import type { PlaybookItem } from '@/types/playbook'

interface PlaybookItemRowProps {
  item: PlaybookItem
  checked: boolean
  onToggle: () => void
  categoryColor?: string // Tailwind bg class for the accent
}

export function PlaybookItemRow({ item, checked, onToggle, categoryColor }: PlaybookItemRowProps) {
  const [showCoaching, setShowCoaching] = useState(false)

  // Who pill colors
  const whoColors: Record<string, { bg: string; text: string }> = {
    kaleb: { bg: 'bg-blue-100', text: 'text-blue-700' },
    ella: { bg: 'bg-purple-100', text: 'text-purple-700' },
    both: { bg: 'bg-teal-100', text: 'text-teal-700' },
    partner: { bg: 'bg-pink-100', text: 'text-pink-700' },
    iris: { bg: 'bg-pink-100', text: 'text-pink-700' },
    self: { bg: 'bg-stone-100', text: 'text-stone-600' },
  }

  const colors = whoColors[item.who.toLowerCase()] || { bg: 'bg-neutral-100', text: 'text-neutral-600' }

  return (
    <div className="group">
      <div className="flex items-start gap-3 py-1.5">
        {/* Round checkbox */}
        <button
          onClick={onToggle}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all duration-200 ${
            checked
              ? `${categoryColor || 'bg-sage-500'} border-transparent`
              : 'border-neutral-300 hover:border-neutral-400'
          }`}
        >
          {checked && (
            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Who pill */}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${colors.bg} ${colors.text}`}>
              {item.who}
            </span>
            {/* Action */}
            <span className={`text-sm ${checked ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>
              {item.action}
            </span>
          </div>

          {/* Context / coaching expandable */}
          {(item.context || item.coaching) && (
            <button
              onClick={() => setShowCoaching(!showCoaching)}
              className="text-[11px] text-neutral-400 hover:text-neutral-500 mt-0.5 transition-colors"
            >
              {showCoaching ? 'hide context' : 'why this matters'}
            </button>
          )}

          {showCoaching && (
            <div className="mt-1 text-xs text-neutral-500 leading-relaxed">
              {item.context && <p>{item.context}</p>}
              {item.coaching && <p className="italic mt-0.5">{item.coaching}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
