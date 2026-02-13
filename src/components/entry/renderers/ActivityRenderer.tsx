import type { Entry, ActivityContent } from '@/types/entry'

interface Props {
  entry: Entry
  onUpdate?: (updates: Partial<Entry>) => void
  mode?: 'card' | 'full' | 'yearbook'
}

export function ActivityRenderer({ entry, onUpdate, mode = 'card' }: Props) {
  const c = entry.content as ActivityContent

  const handleToggleComplete = () => {
    if (!onUpdate) return
    onUpdate({ content: { ...c, completed: !c.completed } })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {c.ageRange && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">
            Ages {c.ageRange.min}-{c.ageRange.max}
          </span>
        )}
        {c.duration && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">
            {c.duration}
          </span>
        )}
      </div>

      <p className={`text-sm text-stone-600 ${mode === 'card' ? 'line-clamp-3' : 'whitespace-pre-line'}`}>
        {c.instructions}
      </p>

      {c.materials && c.materials.length > 0 && (mode === 'full' || c.materials.length <= 3) && (
        <div>
          <p className="text-xs font-medium text-stone-500 mb-1">Materials</p>
          <div className="flex flex-wrap gap-1">
            {c.materials.map((m, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-stone-50 text-stone-500 border border-stone-100">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {onUpdate && (
        <button
          onClick={handleToggleComplete}
          className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
            c.completed
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
          }`}
        >
          {c.completed ? 'Completed' : 'Mark complete'}
        </button>
      )}
    </div>
  )
}
