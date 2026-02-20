import type { PlaybookItem } from '@/types/playbook'

interface PlaybookItemRowProps {
  item: PlaybookItem
  checked: boolean
  onToggle: () => void
  categoryColor?: string // Tailwind bg class for the accent
  showCoaching?: boolean // parent-controlled coaching visibility
}

// Who initial colors
const WHO_COLORS: Record<string, { bg: string; text: string }> = {
  kaleb: { bg: 'bg-blue-100', text: 'text-blue-700' },
  liam: { bg: 'bg-blue-100', text: 'text-blue-700' },
  ella: { bg: 'bg-purple-100', text: 'text-purple-700' },
  mia: { bg: 'bg-purple-100', text: 'text-purple-700' },
  both: { bg: 'bg-teal-100', text: 'text-teal-700' },
  partner: { bg: 'bg-pink-100', text: 'text-pink-700' },
  iris: { bg: 'bg-pink-100', text: 'text-pink-700' },
  self: { bg: 'bg-stone-100', text: 'text-stone-600' },
}

export function PlaybookItemRow({ item, checked, onToggle, categoryColor, showCoaching }: PlaybookItemRowProps) {
  const colors = WHO_COLORS[item.who.toLowerCase()] || { bg: 'bg-neutral-100', text: 'text-neutral-600' }
  const initial = item.who.charAt(0).toUpperCase()

  return (
    <div>
      <div className="flex items-center gap-2 py-1">
        {/* Compact checkbox */}
        <button
          onClick={onToggle}
          style={{ width: 16, height: 16, minWidth: 16, minHeight: 16, padding: 0 }}
          className={`rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all duration-200 ${
            checked
              ? `${categoryColor || 'bg-sage-500'} border-transparent`
              : 'border-neutral-300 hover:border-neutral-400'
          }`}
        >
          {checked && (
            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Per-item time (if present) */}
        {item.time && (
          <span className="text-[10px] text-neutral-400 tabular-nums flex-shrink-0">
            {item.time}
          </span>
        )}

        {/* Who initial */}
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${colors.bg} ${colors.text}`}>
          {initial}
        </span>

        {/* Action */}
        <span className={`text-sm flex-1 min-w-0 ${checked ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>
          {item.action}
        </span>
      </div>

      {/* Coaching text (parent-controlled) */}
      {showCoaching && (item.context || item.coaching) && (
        <div className="ml-6 pl-5 text-xs text-neutral-500 leading-relaxed pb-0.5">
          {item.context && <p>{item.context}</p>}
          {item.coaching && <p className="italic mt-0.5">{item.coaching}</p>}
        </div>
      )}
    </div>
  )
}
