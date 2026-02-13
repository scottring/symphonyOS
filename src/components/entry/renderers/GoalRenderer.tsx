import type { Entry, GoalContent } from '@/types/entry'

interface Props {
  entry: Entry
  onUpdate?: (updates: Partial<Entry>) => void
  mode?: 'card' | 'full' | 'yearbook'
}

export function GoalRenderer({ entry, onUpdate, mode = 'card' }: Props) {
  const c = entry.content as GoalContent

  const handleProgressChange = (newProgress: number) => {
    if (!onUpdate) return
    onUpdate({ content: { ...c, progress: newProgress } })
  }

  return (
    <div className="space-y-3">
      <p className={`text-sm text-stone-600 ${mode === 'card' ? 'line-clamp-2' : ''}`}>
        {c.description}
      </p>

      {c.targetDate && (
        <p className="text-xs text-stone-400">
          Target: {new Date(c.targetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-stone-400">Progress</span>
          <span className="text-xs font-medium text-stone-600">{c.progress}%</span>
        </div>
        <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 rounded-full transition-all duration-300"
            style={{ width: `${c.progress}%` }}
          />
        </div>
        {onUpdate && mode === 'full' && (
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={c.progress}
            onChange={e => handleProgressChange(Number(e.target.value))}
            className="w-full mt-1 accent-purple-500"
          />
        )}
      </div>

      {c.milestoneIds && c.milestoneIds.length > 0 && (
        <p className="text-xs text-stone-400">{c.milestoneIds.length} linked milestone{c.milestoneIds.length > 1 ? 's' : ''}</p>
      )}
    </div>
  )
}
