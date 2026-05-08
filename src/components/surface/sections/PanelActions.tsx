interface PanelActionsProps {
  completed: boolean
  phoneNumber?: string
  onToggleComplete: () => void
  onSchedule: () => void
  onMore: () => void
}

export function PanelActions({ completed, phoneNumber, onToggleComplete, onSchedule, onMore }: PanelActionsProps) {
  return (
    <div className="flex flex-wrap gap-2 pb-4 mb-4 border-b border-neutral-200">
      <button
        onClick={onToggleComplete}
        className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
      >
        {completed ? '↺ Reopen' : '✓ Done'}
      </button>
      {phoneNumber && (
        <a
          href={`tel:${phoneNumber}`}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          📞 {phoneNumber}
        </a>
      )}
      <button
        onClick={onSchedule}
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
      >
        📅 Schedule
      </button>
      <button
        onClick={onMore}
        aria-label="More actions"
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
      >
        ···
      </button>
    </div>
  )
}
