// YearbookEntryCard — Type-specific card wrappers for yearbook presentation
// Each entry type gets a distinctive visual treatment

import type { Entry } from '@/types/entry'
import { EntryRenderer } from '@/components/entry/renderers/EntryRenderer'
import { DOMAIN_NAMES } from '@/types/manual'

interface YearbookEntryCardProps {
  entry: Entry
  onUpdate?: (updates: Partial<Entry>) => void
  compact?: boolean
}

// Type-specific background + border styles
const TYPE_CARD_STYLES: Record<string, string> = {
  story: 'bg-gradient-to-br from-rose-50 to-white border-rose-200/60',
  activity: 'bg-white border-emerald-300 border-dashed',
  reflection: 'bg-gradient-to-br from-amber-50 to-white border-amber-200/60',
  discussion: 'bg-gradient-to-br from-indigo-50 to-white border-indigo-200/60',
  goal: 'bg-gradient-to-br from-purple-50 to-white border-purple-200/60',
  checklist: 'bg-white border-teal-200/60',
  milestone: 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-300/60',
  insight: 'bg-white border-stone-200',
  task: 'bg-transparent border-none',
}

// Type-specific title styles
const TYPE_TITLE_STYLES: Record<string, string> = {
  story: 'font-display text-xl text-stone-900',
  activity: 'text-sm font-medium uppercase tracking-wider text-emerald-700',
  reflection: 'font-display text-lg italic text-stone-700',
  discussion: 'text-base font-medium text-indigo-900',
  goal: 'text-base font-medium text-purple-900',
  checklist: 'text-base font-medium text-teal-900',
  milestone: 'font-display text-lg font-semibold text-yellow-900',
  insight: 'text-base text-stone-700',
  task: 'text-sm text-stone-600',
}

export function YearbookEntryCard({ entry, onUpdate, compact }: YearbookEntryCardProps) {
  const cardStyle = TYPE_CARD_STYLES[entry.type] || 'bg-white border-stone-200'
  const titleStyle = TYPE_TITLE_STYLES[entry.type] || 'text-base font-medium text-stone-800'

  // Task entries in compact mode: minimal wrapper
  if (compact || entry.type === 'task') {
    return (
      <div className="py-1">
        <EntryRenderer entry={entry} onUpdate={onUpdate} mode="yearbook" />
      </div>
    )
  }

  return (
    <div className={`rounded-xl border p-5 md:p-6 ${cardStyle} transition-shadow hover:shadow-sm`}>
      {/* Title */}
      <div className="mb-3">
        <h3 className={titleStyle}>{entry.title}</h3>

        {/* Domain badge — subtle, not the type badge from regular cards */}
        <span className="text-[10px] text-stone-400 mt-1 block">
          {DOMAIN_NAMES[entry.domain]}
        </span>
      </div>

      {/* Milestone decoration */}
      {entry.type === 'milestone' && (
        <div className="flex justify-center mb-3">
          <svg className="w-8 h-8 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </div>
      )}

      {/* Insight decoration — large open quote */}
      {entry.type === 'insight' && (
        <div className="text-4xl text-stone-200 font-display leading-none mb-1">&ldquo;</div>
      )}

      {/* Renderer content */}
      <EntryRenderer entry={entry} onUpdate={onUpdate} mode="yearbook" />

      {/* Insight attribution */}
      {entry.type === 'insight' && (
        <div className="text-right text-4xl text-stone-200 font-display leading-none mt-1">&rdquo;</div>
      )}
    </div>
  )
}
