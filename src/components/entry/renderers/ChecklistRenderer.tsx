import type { Entry, ChecklistContent, ChecklistItem } from '@/types/entry'

interface Props {
  entry: Entry
  onUpdate?: (updates: Partial<Entry>) => void
  mode?: 'card' | 'full'
}

export function ChecklistRenderer({ entry, onUpdate, mode = 'card' }: Props) {
  const c = entry.content as ChecklistContent
  const checked = c.items.filter(i => i.checked).length
  const total = c.items.length
  const progress = total > 0 ? Math.round((checked / total) * 100) : 0
  const displayItems = mode === 'card' ? c.items.slice(0, 6) : c.items

  const handleToggle = (itemId: string) => {
    if (!onUpdate) return
    const updated: ChecklistItem[] = c.items.map(item =>
      item.id === itemId ? { ...item, checked: !item.checked } : item
    )
    onUpdate({ content: { ...c, items: updated } })
  }

  return (
    <div className="space-y-3">
      {c.frequency && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-500">
          {c.frequency}
        </span>
      )}

      {total > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-stone-400 shrink-0">{checked}/{total}</span>
        </div>
      )}

      <ul className="space-y-1.5">
        {displayItems.map(item => (
          <li key={item.id} className="flex items-start gap-2">
            <button
              onClick={() => handleToggle(item.id)}
              disabled={!onUpdate}
              className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                item.checked
                  ? 'bg-stone-900 border-stone-900'
                  : 'border-stone-300 hover:border-stone-400'
              } ${!onUpdate ? 'cursor-default' : 'cursor-pointer'}`}
            >
              {item.checked && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <span className={`text-sm ${item.checked ? 'text-stone-400 line-through' : 'text-stone-600'}`}>
              {item.label}
              {item.time && <span className="text-xs text-stone-400 ml-1">({item.time})</span>}
            </span>
          </li>
        ))}
      </ul>

      {mode === 'card' && c.items.length > 6 && (
        <p className="text-xs text-stone-400">+{c.items.length - 6} more items</p>
      )}
    </div>
  )
}
