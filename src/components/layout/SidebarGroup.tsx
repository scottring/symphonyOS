import type { ReactNode } from 'react'

interface Props {
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
  forceOpen?: boolean
  collapsed?: boolean
}

export function SidebarGroup({ label, open, onToggle, children, forceOpen, collapsed }: Props) {
  if (collapsed) {
    return <>{children}</>
  }

  const isOpen = open || forceOpen === true

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-2 px-3.5 pt-4 pb-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wider hover:text-neutral-600 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
        <span>{label}</span>
      </button>
      {isOpen && <div>{children}</div>}
    </div>
  )
}
