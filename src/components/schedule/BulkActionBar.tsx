import { Check, RotateCcw, Trash2, X } from 'lucide-react'

interface BulkActionBarProps {
  selectedCount: number
  onComplete: () => void
  onUncomplete: () => void
  onDelete: () => void
  onCancel: () => void
  hasCompletedTasks: boolean
  hasIncompleteTasks: boolean
}

export function BulkActionBar({
  selectedCount,
  onComplete,
  onUncomplete,
  onDelete,
  onCancel,
  hasCompletedTasks,
  hasIncompleteTasks,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-neutral-800 text-white shadow-lg">
        {/* Selection count */}
        <span className="text-sm font-medium mr-2 text-neutral-300">
          {selectedCount} selected
        </span>

        {/* Complete button (only if some incomplete) */}
        {hasIncompleteTasks && (
          <button
            onClick={onComplete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 transition-colors text-sm font-medium"
          >
            <Check className="w-4 h-4" />
            Complete
          </button>
        )}

        {/* Uncomplete button (only if some completed) */}
        {hasCompletedTasks && (
          <button
            onClick={onUncomplete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-600 hover:bg-neutral-500 transition-colors text-sm font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            Uncomplete
          </button>
        )}

        {/* Delete button */}
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 transition-colors text-sm font-medium"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>

        {/* Cancel/Exit button */}
        <button
          onClick={onCancel}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-neutral-400 hover:text-white ml-1"
          aria-label="Exit selection mode"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
