import type { Entry, InsightContent } from '@/types/entry'

interface Props {
  entry: Entry
  onUpdate?: (updates: Partial<Entry>) => void
  mode?: 'card' | 'full'
}

export function InsightRenderer({ entry, mode = 'card' }: Props) {
  const c = entry.content as InsightContent

  return (
    <div className="space-y-2">
      <p className={`text-sm text-stone-600 ${mode === 'card' ? 'line-clamp-3' : ''}`}>
        {c.body}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-stone-400">Source: {c.source}</span>
        {c.actionable && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500">
            Actionable
          </span>
        )}
      </div>
    </div>
  )
}
