import { useState } from 'react'
import symphonyLogo from '@/assets/symphony-logo.jpg'
import { PinnedSection } from '@/components/pins'
import type { PinnedItem } from '@/types/pin'
import type { PinnableEntityType } from '@/types/pin'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { Routine } from '@/types/routine'

// Feature flags for in-progress features
const FEATURES = {
  notes: false, // Notes feature is built but not production-ready yet
  lists: false, // Lists feature is not feature-complete yet
}

export type ViewType = 'home' | 'projects' | 'routines' | 'lists' | 'notes' | 'history' | 'task-detail' | 'contact-detail' | 'settings' | 'kids'

interface EntityData {
  tasks: Task[]
  projects: Project[]
  contacts: Contact[]
  routines: Routine[]
  lists: Array<{ id: string; name: string }>
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  userEmail?: string
  onSignOut?: () => void
  activeView: ViewType
  onViewChange: (view: ViewType) => void
  onOpenSearch?: () => void
  // Pinned items props
  pins?: PinnedItem[]
  entities?: EntityData
  onPinNavigate?: (entityType: PinnableEntityType, entityId: string) => void
  onPinMarkAccessed?: (entityType: PinnableEntityType, entityId: string) => void
  onPinRefreshStale?: (id: string) => void
}

// Navigation items configuration
const navItems = [
  {
    id: 'home' as const,
    label: 'Today',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    id: 'projects' as const,
    label: 'Projects',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h7l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M10 10h4" />
        <path d="M10 14h2" />
      </svg>
    ),
  },
  {
    id: 'routines' as const,
    label: 'Routines',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
      </svg>
    ),
  },
  {
    id: 'history' as const,
    label: 'History',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8v4l3 3" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
  {
    id: 'kids' as const,
    label: 'Kids Zone',
    icon: (
      <span className="text-lg">🌟</span>
    ),
  },
]

export function Sidebar({
  collapsed,
  onToggle,
  userEmail,
  onSignOut,
  activeView,
  onViewChange,
  onOpenSearch,
  pins = [],
  entities,
  onPinNavigate,
  onPinMarkAccessed,
  onPinRefreshStale,
}: SidebarProps) {
  const [isHovering, setIsHovering] = useState(false)

  // Expand on hover when collapsed
  const isExpanded = !collapsed || isHovering

  return (
    <aside
      onMouseEnter={() => collapsed && setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={`
        h-full relative
        flex flex-col
        transition-all duration-300 ease-out
        ${isExpanded ? 'w-64' : 'w-[72px]'}
      `}
    >
      {/* Background with subtle gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-neutral-50/90 via-neutral-50/70 to-neutral-100/50 backdrop-blur-xl border-r border-neutral-200/40" />

      {/* Decorative accent line */}
      <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-primary-200/30 to-transparent" />

      {/* Content */}
      <div className="relative flex flex-col h-full">
        {/* Header with logo */}
        <div className={`p-5 flex items-center ${isExpanded ? 'justify-between' : 'justify-center'}`}>
          <div className={`flex items-center gap-3 ${!isExpanded ? 'justify-center' : ''}`}>
            <div className="relative">
              <img
                src={symphonyLogo}
                alt="Symphony"
                className="w-10 h-10 rounded-xl object-cover shadow-sm ring-1 ring-neutral-200/50"
              />
              {/* Status dot */}
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-primary-500 rounded-full border-2 border-neutral-50" />
            </div>
            {isExpanded && (
              <div className="animate-fade-in-up" style={{ animationDuration: '200ms' }}>
                <span className="font-display text-xl text-neutral-900 tracking-tight">Symphony</span>
                <p className="text-[10px] text-neutral-400 -mt-0.5 font-medium tracking-wide">PERSONAL OS</p>
              </div>
            )}
          </div>
          {isExpanded && !collapsed && (
            <button
              onClick={onToggle}
              className="p-2 rounded-lg text-neutral-300 hover:text-neutral-500 hover:bg-neutral-100 transition-all duration-200"
              aria-label="Collapse sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        {/* Expand button when collapsed and not hovering */}
        {collapsed && !isHovering && (
          <button
            onClick={onToggle}
            className="mx-auto p-2 rounded-lg text-neutral-300 hover:text-neutral-500 hover:bg-neutral-100 transition-all duration-200"
            aria-label="Expand sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        )}

        {/* Search button */}
        {onOpenSearch && (
          <div className={`px-4 mt-2 ${!isExpanded ? 'flex justify-center' : ''}`}>
            <button
              onClick={onOpenSearch}
              className={`
                flex items-center gap-3 rounded-xl
                text-neutral-400 hover:text-neutral-600
                transition-all duration-200 group
                ${isExpanded
                  ? 'w-full px-4 py-3 bg-white/60 border border-neutral-200/60 hover:border-neutral-300 hover:bg-white hover:shadow-sm'
                  : 'p-3 hover:bg-neutral-100'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 transition-transform group-hover:scale-105" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              {isExpanded && (
                <>
                  <span className="flex-1 text-left text-sm">Quick search...</span>
                  <kbd className="hidden lg:inline px-1.5 py-0.5 text-[10px] font-medium bg-neutral-100 text-neutral-400 rounded border border-neutral-200">⌘J</kbd>
                </>
              )}
            </button>
          </div>
        )}

        {/* Pinned Section */}
        {pins.length > 0 && entities && onPinNavigate && onPinMarkAccessed && onPinRefreshStale && (
          <PinnedSection
            pins={pins}
            entities={entities}
            collapsed={!isExpanded}
            onNavigate={onPinNavigate}
            onMarkAccessed={onPinMarkAccessed}
            onRefreshStale={onPinRefreshStale}
          />
        )}

        {/* Navigation */}
        <nav className={`flex-1 mt-6 ${isExpanded ? 'px-3' : 'px-2'}`}>
          {/* Section label */}
          {isExpanded && (
            <p className="px-3 mb-3 text-[10px] font-bold text-neutral-400 uppercase tracking-[0.15em]">
              Navigate
            </p>
          )}

          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeView === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id)}
                  className={`
                    w-full flex items-center gap-3 rounded-xl transition-all duration-200
                    ${isExpanded ? 'px-4 py-3' : 'p-3 justify-center'}
                    ${isActive
                      ? 'bg-primary-50 text-primary-700 shadow-sm'
                      : 'text-neutral-500 hover:bg-white/80 hover:text-neutral-700 hover:shadow-sm'
                    }
                  `}
                >
                  <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}>
                    {item.icon}
                  </span>
                  {isExpanded && (
                    <span className={`text-sm ${isActive ? 'font-semibold' : 'font-medium'}`}>
                      {item.label}
                    </span>
                  )}
                  {isActive && isExpanded && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Feature-flagged items */}
          {FEATURES.lists && (
            <button
              onClick={() => onViewChange('lists')}
              className={`
                w-full flex items-center gap-3 rounded-xl transition-all duration-200 mt-1
                ${isExpanded ? 'px-4 py-3' : 'p-3 justify-center'}
                ${activeView === 'lists'
                  ? 'bg-purple-50 text-purple-700 shadow-sm'
                  : 'text-neutral-500 hover:bg-white/80 hover:text-neutral-700 hover:shadow-sm'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
              </svg>
              {isExpanded && <span className="text-sm font-medium">Lists</span>}
            </button>
          )}

          {FEATURES.notes && (
            <button
              onClick={() => onViewChange('notes')}
              className={`
                w-full flex items-center gap-3 rounded-xl transition-all duration-200 mt-1
                ${isExpanded ? 'px-4 py-3' : 'p-3 justify-center'}
                ${activeView === 'notes'
                  ? 'bg-teal-50 text-teal-700 shadow-sm'
                  : 'text-neutral-500 hover:bg-white/80 hover:text-neutral-700 hover:shadow-sm'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
              </svg>
              {isExpanded && <span className="text-sm font-medium">Notes</span>}
            </button>
          )}
        </nav>

        {/* User section */}
        {(userEmail || onSignOut) && (
          <div className={`p-4 border-t border-neutral-100/60 ${!isExpanded ? 'flex flex-col items-center gap-2' : ''}`}>
            {isExpanded && userEmail && (
              <div className="px-3 py-2 mb-2 rounded-lg bg-white/50">
                <p className="text-xs text-neutral-400 mb-0.5">Signed in as</p>
                <p className="text-sm text-neutral-600 truncate font-medium">{userEmail}</p>
              </div>
            )}

            <button
              onClick={() => onViewChange('settings')}
              className={`
                flex items-center gap-3 rounded-xl w-full
                transition-all duration-200
                ${isExpanded ? 'px-4 py-3' : 'p-3 justify-center'}
                ${activeView === 'settings'
                  ? 'bg-neutral-100 text-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-600 hover:bg-white/80'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              {isExpanded && <span className="text-sm font-medium">Settings</span>}
            </button>

            {onSignOut && (
              <button
                onClick={onSignOut}
                className={`
                  flex items-center gap-3 rounded-xl w-full
                  text-neutral-400 hover:text-red-500 hover:bg-red-50
                  transition-all duration-200
                  ${isExpanded ? 'px-4 py-3' : 'p-3 justify-center'}
                `}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                {isExpanded && <span className="text-sm font-medium">Sign out</span>}
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
