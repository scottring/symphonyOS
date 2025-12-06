import symphonyLogo from '@/assets/symphony-logo.jpg'

export type ViewType = 'home' | 'projects' | 'routines' | 'task-detail' | 'contact-detail' | 'settings'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  userEmail?: string
  onSignOut?: () => void
  activeView: ViewType
  onViewChange: (view: ViewType) => void
  onOpenSearch?: () => void
}

export function Sidebar({ collapsed, onToggle, userEmail, onSignOut, activeView, onViewChange, onOpenSearch }: SidebarProps) {
  return (
    <aside
      className={`
        h-full bg-bg-elevated border-r border-neutral-200/80
        flex flex-col
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-[72px]' : 'w-64'}
      `}
    >
      {/* Header with logo */}
      <div className="p-4 flex items-center justify-between">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center w-full' : ''}`}>
          <img
            src={symphonyLogo}
            alt="Symphony"
            className="w-10 h-10 rounded-xl object-cover"
          />
          {!collapsed && (
            <span className="font-display text-lg font-semibold text-neutral-900">Symphony</span>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={onToggle}
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
            aria-label="Collapse sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={onToggle}
          className="mx-4 mt-2 p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all flex justify-center"
          aria-label="Expand sidebar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {/* Search button */}
      {onOpenSearch && (
        <div className="px-3 mt-4">
          <button
            onClick={onOpenSearch}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
              bg-neutral-100 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200
              transition-all duration-200
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            {!collapsed && (
              <>
                <span className="flex-1 text-left text-sm">Search...</span>
                <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-xs font-medium text-neutral-400 bg-neutral-200/50 rounded">
                  ⌘J
                </kbd>
              </>
            )}
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 mt-4 space-y-1">
        <button
          onClick={() => onViewChange('home')}
          className={`
            w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200
            ${activeView === 'home'
              ? 'bg-primary-50 text-primary-700 font-medium shadow-sm'
              : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800'
            }
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 ${activeView === 'home' ? 'text-primary-600' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
          {!collapsed && <span>Home</span>}
        </button>

        <button
          onClick={() => onViewChange('projects')}
          className={`
            w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200
            ${activeView === 'projects'
              ? 'bg-blue-50 text-blue-700 font-medium shadow-sm'
              : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800'
            }
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 ${activeView === 'projects' ? 'text-blue-600' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          {!collapsed && <span>Projects</span>}
        </button>

        <button
          onClick={() => onViewChange('routines')}
          className={`
            w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200
            ${activeView === 'routines'
              ? 'bg-amber-50 text-amber-700 font-medium shadow-sm'
              : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800'
            }
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 ${activeView === 'routines' ? 'text-amber-600' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          {!collapsed && <span>Routines</span>}
        </button>
      </nav>

      {/* User section */}
      {(userEmail || onSignOut) && (
        <div className={`p-3 border-t border-neutral-100 ${collapsed ? 'text-center' : ''}`}>
          {!collapsed && userEmail && (
            <p className="text-sm text-neutral-500 truncate mb-2 px-3">{userEmail}</p>
          )}
          <button
            onClick={() => onViewChange('settings')}
            className={`
              flex items-center gap-2 px-3 py-2.5 rounded-xl w-full
              text-sm transition-all
              ${activeView === 'settings'
                ? 'bg-neutral-100 text-neutral-700 font-medium'
                : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            {!collapsed && <span>Settings</span>}
          </button>
          {onSignOut && (
            <button
              onClick={onSignOut}
              className={`
                flex items-center gap-2 px-3 py-2.5 rounded-xl w-full
                text-sm text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100
                transition-all
                ${collapsed ? 'justify-center' : ''}
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7z" clipRule="evenodd" />
                <path d="M7 10a1 1 0 011-1h2a1 1 0 110 2H8a1 1 0 01-1-1z" />
              </svg>
              {!collapsed && <span>Sign out</span>}
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
