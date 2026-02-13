import type { Entry, TaskContent } from '@/types/entry'

interface Props {
  entry: Entry
  onUpdate?: (updates: Partial<Entry>) => void
  mode?: 'card' | 'full' | 'yearbook'
}

export function TaskRenderer({ entry, onUpdate }: Props) {
  const c = entry.content as TaskContent

  const handleToggle = () => {
    if (!onUpdate) return
    onUpdate({
      content: { ...c, completed: !c.completed },
      ...(c.completed ? { completed_at: null } : { completed_at: new Date().toISOString() }),
    })
  }

  return (
    <div className="flex items-start gap-3">
      <button
        onClick={handleToggle}
        disabled={!onUpdate}
        className={`mt-0.5 w-4.5 h-4.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
          c.completed
            ? 'bg-stone-900 border-stone-900'
            : 'border-stone-300 hover:border-stone-400'
        } ${!onUpdate ? 'cursor-default' : 'cursor-pointer'}`}
      >
        {c.completed && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${c.completed ? 'text-stone-400 line-through' : 'text-stone-600'}`}>
          {c.description}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {c.assignee && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">
              {c.assignee}
            </span>
          )}
          {c.dueDate && (
            <span className="text-[10px] text-stone-400">
              Due {new Date(c.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
