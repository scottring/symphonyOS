// MoreSheet — Mobile slide-up menu for secondary nav items
// Opens from the "More" tab in the bottom nav

import type { ReactElement } from 'react'
import type { ViewType } from './Sidebar'

interface MoreSheetProps {
  isOpen: boolean
  onClose: () => void
  onNavigate: (view: ViewType) => void
  activeView: ViewType
}

interface NavItem {
  view: ViewType
  label: string
  icon: ReactElement
}

export function MoreSheet({ isOpen, onClose, onNavigate, activeView }: MoreSheetProps) {
  const items: NavItem[] = [
    {
      view: 'routines',
      label: 'Routines',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      view: 'goals',
      label: 'Goals',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
        </svg>
      ),
    },
    // Coaching nav hidden — feature paused
    {
      view: 'notes',
      label: 'Notes',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
        </svg>
      ),
    },
    {
      view: 'lists',
      label: 'Lists',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
          <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      view: 'history',
      label: 'History',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      view: 'settings',
      label: 'Settings',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
      ),
    },
  ]

  const handleNavigate = (view: ViewType) => {
    onNavigate(view)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-bg-elevated rounded-t-2xl
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-y-0' : 'translate-y-full'}
        `}
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-neutral-300" />
        </div>

        {/* Grid of items */}
        <div className="grid grid-cols-3 gap-1 px-4 pb-4">
          {items.map(item => (
            <button
              key={item.view}
              onClick={() => handleNavigate(item.view)}
              className={`relative flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl transition-colors
                ${activeView === item.view
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-neutral-500 hover:bg-neutral-100'
                }
              `}
            >
              {item.icon}
              <span className="text-[11px] font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
