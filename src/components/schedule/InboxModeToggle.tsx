import { List, Layers } from 'lucide-react'
import type { InboxMode } from '@/hooks/useInboxMode'

interface InboxModeToggleProps {
  mode: InboxMode
  onChange: (mode: InboxMode) => void
}

export function InboxModeToggle({ mode, onChange }: InboxModeToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg border border-neutral-200 bg-white p-0.5">
      <button
        type="button"
        aria-pressed={mode === 'dense'}
        aria-label="List view"
        onClick={() => mode !== 'dense' && onChange('dense')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          mode === 'dense' ? 'bg-primary-50 text-primary-700' : 'text-neutral-500 hover:text-neutral-700'
        }`}
      >
        <List className="w-3.5 h-3.5" />
        List
      </button>
      <button
        type="button"
        aria-pressed={mode === 'focus'}
        aria-label="Focus mode"
        onClick={() => mode !== 'focus' && onChange('focus')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          mode === 'focus' ? 'bg-primary-50 text-primary-700' : 'text-neutral-500 hover:text-neutral-700'
        }`}
      >
        <Layers className="w-3.5 h-3.5" />
        Focus
      </button>
    </div>
  )
}
