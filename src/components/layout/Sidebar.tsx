import symphonyLogo from '@/assets/symphony-logo.jpg'
import { PinnedSection } from '@/components/pins'
import { useDomain } from '@/hooks/useDomain'
import type { PinnedItem } from '@/types/pin'
import type { PinnableEntityType } from '@/types/pin'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { Routine } from '@/types/routine'

// Feature flags for in-progress features
const FEATURES = {
  notes: true, // Notes feature enabled - entity linking in progress
  lists: false, // Lists feature is not feature-complete yet
}

export type ViewType = 'home' | 'projects' | 'routines' | 'lists' | 'notes' | 'history' | 'task-detail' | 'contact-detail' | 'packing-templates' | 'settings'

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
  userName?: string
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

export function Sidebar({
  collapsed,
  onToggle,
  userEmail,
  userName,
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
  const { currentDomain } = useDomain()

  // Define subtle domain theming
  const domainTheme = {
    universal: {
      bg: 'bg-bg-elevated/80',
      border: '',
      glow: '',
    },
    work: {
      bg: 'bg-bg-elevated/80',
      border: 'border-l-2 border-blue-200/30',
      glow: 'shadow-[inset_4px_0_12px_-8px_rgba(59,130,246,0.15)]',
    },
    family: {
      bg: 'bg-bg-elevated/80',
      border: 'border-l-2 border-amber-200/30',
      glow: 'shadow-[inset_4px_0_12px_-8px_rgba(251,191,36,0.15)]',
    },
    personal: {
      bg: 'bg-bg-elevated/80',
      border: 'border-l-2 border-purple-200/30',
      glow: 'shadow-[inset_4px_0_12px_-8px_rgba(168,85,247,0.15)]',
    },
  }

  const theme = domainTheme[currentDomain]

  return (
    <aside
      className={`
        h-full ${theme.bg} ${theme.border} ${theme.glow} backdrop-blur-sm
        flex flex-col
        transition-all duration-500
        ${collapsed ? 'w-[68px]' : 'w-60'}
      `}
    >
      {/* Header with logo */}
      <div className="p-4 flex items-center justify-between">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center w-full' : ''}`}>
          <img
            src={symphonyLogo}
            alt="Symphony"
            className="w-12 h-12 rounded-lg object-cover"
          />
          {!collapsed && (
            <span className="font-display text-2xl font-semibold tracking-wide text-neutral-800">Symphony</span>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={onToggle}
            className="p-1.5 rounded-md text-neutral-300 hover:text-neutral-500 transition-colors"
            aria-label="Collapse sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={onToggle}
          className="mx-auto mt-1 p-1.5 rounded-md text-neutral-300 hover:text-neutral-500 transition-colors"
          aria-label="Expand sidebar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {/* Search button */}
      {onOpenSearch && (
        <div className="px-3 mt-3">
          <button
            onClick={onOpenSearch}
            className={`
              w-full flex items-center gap-2.5 px-3 py-2 rounded-lg
              text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100/80
              transition-colors duration-150
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            {!collapsed && (
              <>
                <span className="flex-1 text-left text-sm">Search</span>
                <kbd className="hidden lg:inline text-[10px] text-neutral-300">⌘J</kbd>
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
          collapsed={collapsed}
          onNavigate={onPinNavigate}
          onMarkAccessed={onPinMarkAccessed}
          onRefreshStale={onPinRefreshStale}
        />
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 mt-5 space-y-0.5">
        <button
          onClick={() => onViewChange('home')}
          className={`
            w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors duration-150
            ${activeView === 'home'
              ? 'text-primary-700 bg-primary-50/80'
              : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700'
            }
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
          {!collapsed && <span className="text-sm">Home</span>}
        </button>

        <button
          onClick={() => onViewChange('projects')}
          className={`
            w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors duration-150
            ${activeView === 'projects'
              ? 'text-primary-700 bg-primary-50/80'
              : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700'
            }
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          {!collapsed && <span className="text-sm">Projects</span>}
        </button>

        <button
          onClick={() => onViewChange('routines')}
          className={`
            w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors duration-150
            ${activeView === 'routines'
              ? 'text-primary-700 bg-primary-50/80'
              : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700'
            }
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          {!collapsed && <span className="text-sm">Routines</span>}
        </button>

        <button
          onClick={() => onViewChange('history')}
          className={`
            w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors duration-150
            ${activeView === 'history'
              ? 'text-primary-700 bg-primary-50/80'
              : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700'
            }
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
          {!collapsed && <span className="text-sm">History</span>}
        </button>

        {FEATURES.lists && (
          <button
            onClick={() => onViewChange('lists')}
            className={`
              w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200
              ${activeView === 'lists'
                ? 'bg-purple-50 text-purple-700 font-medium shadow-sm'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 ${activeView === 'lists' ? 'text-purple-600' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
            </svg>
            {!collapsed && <span>Lists</span>}
          </button>
        )}

        {FEATURES.notes && (
          <button
            onClick={() => onViewChange('notes')}
            className={`
              w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors duration-150
              ${activeView === 'notes'
                ? 'text-primary-700 bg-primary-50/80'
                : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
            {!collapsed && <span className="text-sm">Notes</span>}
          </button>
        )}
      </nav>

      {/* User section */}
      {(userEmail || userName || onSignOut) && (
        <div className={`p-3 border-t border-neutral-100 ${collapsed ? 'text-center' : ''}`}>
          <button
            onClick={() => onViewChange('settings')}
            className={`
              flex items-center gap-2.5 px-3 py-2.5 rounded-lg w-full
              text-sm transition-colors duration-150
              ${activeView === 'settings'
                ? 'text-primary-700 bg-primary-50/80'
                : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100/60'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            {!collapsed && <span>Settings</span>}
          </button>
          {onSignOut && (
            <button
              onClick={onSignOut}
              className={`
                flex items-center gap-2.5 px-3 py-2.5 rounded-lg w-full
                text-sm text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100/60
                transition-colors duration-150
                ${collapsed ? 'justify-center' : ''}
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7z" clipRule="evenodd" />
                <path d="M7 10a1 1 0 011-1h2a1 1 0 110 2H8a1 1 0 01-1-1z" />
              </svg>
              {!collapsed && <span>Sign out</span>}
            </button>
          )}
          {!collapsed && (userName || userEmail) && (
            <div className="mt-3 px-3 pt-3 border-t border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div className="w-[18px] h-[18px] rounded-full bg-primary-500 flex items-center justify-center text-white text-[10px] font-medium shrink-0">
                  {(userName || userEmail || 'U').charAt(0).toUpperCase()}
                </div>
                <p className="text-sm text-neutral-500 truncate">
                  {(() => {
                    const hour = new Date().getHours()
                    const firstName = (userName || userEmail || '').split(' ')[0]
                    if (hour < 12) return `Good morning, ${firstName}`
                    if (hour < 18) return `Good afternoon, ${firstName}`
                    return `Good evening, ${firstName}`
                  })()}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
