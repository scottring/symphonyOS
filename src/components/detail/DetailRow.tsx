/**
 * DetailRow component for consistent field styling in Details zone
 */

interface DetailRowProps {
  icon: React.ReactNode
  label: string
  value: string | null | undefined
  onClick: () => void
  actions?: React.ReactNode
}

export function DetailRow({ icon, label, value, onClick, actions }: DetailRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 -mx-3 rounded-lg
                 hover:bg-neutral-50 text-left group transition-colors"
    >
      <span className="text-neutral-400">{icon}</span>
      <span className="text-sm text-neutral-500 w-20">{label}</span>
      <span className={`flex-1 text-sm ${value ? 'text-neutral-900' : 'text-neutral-400'}`}>
        {value || 'None'}
      </span>
      {actions}
      <svg
        className="w-4 h-4 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
      </svg>
    </button>
  )
}
