import type { TaskContext } from '@/types/task'

// The one Work/Family/Personal vocabulary — colors match the domain switcher.
// Extracted from ContextPicker so every surface that asks the domain question
// (the triage picker, the planning grids' after-drop prompt) renders the SAME
// menu and cannot drift.
export const CONTEXTS: { value: TaskContext; label: string; color: string }[] = [
  { value: 'work', label: 'Work', color: 'rgb(37 99 235)' },      // Blue-600
  { value: 'family', label: 'Family', color: 'rgb(217 119 6)' },  // Amber-600
  { value: 'personal', label: 'Personal', color: 'rgb(147 51 234)' }, // Purple-600
]

interface ContextMenuPanelProps {
  value?: TaskContext | null
  onSelect: (context: TaskContext | undefined) => void
  /** Offer the Clear row (only meaningful when a value is set). */
  allowClear?: boolean
}

export function ContextMenuPanel({ value, onSelect, allowClear = true }: ContextMenuPanelProps) {
  const hasValue = value != null
  return (
    <div className="space-y-1">
      {CONTEXTS.map(({ value: ctxValue, label, color }) => (
        <button
          key={ctxValue}
          onClick={() => onSelect(ctxValue)}
          className={`w-full px-3 py-1.5 text-sm text-left rounded-lg flex items-center gap-2 ${
            value === ctxValue
              ? 'bg-primary-50 text-primary-700'
              : 'hover:bg-neutral-50 text-neutral-700'
          }`}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </button>
      ))}
      {allowClear && hasValue && (
        <>
          <div className="border-t border-neutral-100 my-1" />
          <button
            onClick={() => onSelect(undefined)}
            className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-red-50 text-red-600"
          >
            Clear
          </button>
        </>
      )}
    </div>
  )
}
