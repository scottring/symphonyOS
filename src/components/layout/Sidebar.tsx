import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { PinnedSection } from '@/components/pins'
import { useDomain } from '@/hooks/useDomain'
import { appRegistry } from '@/shell/appRegistry'
import { SidebarGroup } from './SidebarGroup'
import { useSidebarGroupState } from '@/hooks/useSidebarGroupState'
import type { PinnedItem } from '@/types/pin'
import type { PinnableEntityType } from '@/types/pin'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import type { Routine } from '@/types/routine'

// Feature flags for in-progress features
const FEATURES = {
  notes: true, // Notes feature enabled - entity linking in progress
  lists: true, // Lists feature enabled - reference lists for books, movies, ideas, etc.
}

// Subtle domain theming (module-level to avoid re-creation each render)
const DOMAIN_THEME = {
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
} as const

export type ViewType = 'agent' | 'home' | 'home-app' | 'today' | 'inbox' | 'goals' | 'projects' | 'routines' | 'lists' | 'notes' | 'contacts' | 'history' | 'task-detail' | 'contact-detail' | 'settings' | 'meals' | 'morning' | 'bedtime'

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
  onOpenChat?: () => void
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
  onOpenChat,
  pins = [],
  entities,
  onPinNavigate,
  onPinMarkAccessed,
  onPinRefreshStale,
}: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentDomain } = useDomain()
  const theme = DOMAIN_THEME[currentDomain]

  const { state: groupState, toggle: toggleGroup, setOpen: openGroup } = useSidebarGroupState()

  // Force a group open when the user is viewing one of its children.
  const planActive = activeView === 'projects' || activeView === 'routines' || activeView === 'goals'
  const libraryActive =
    activeView === 'notes' || activeView === 'lists' ||
    activeView === 'contacts' || activeView === 'contact-detail' || activeView === 'history'
  const spacesActive = activeView === 'home-app' || activeView === 'meals'

  // When the user lands on a child via URL, persist that group as open
  // so it stays open after they navigate elsewhere.
  useEffect(() => {
    if (planActive) openGroup('plan')
    if (libraryActive) openGroup('library')
    if (spacesActive) openGroup('spaces')
  }, [planActive, libraryActive, spacesActive, openGroup])

  return (
    <aside
      className={`
        h-full ${theme.bg} ${theme.border} ${theme.glow} backdrop-blur-sm
        flex flex-col
        transition-all duration-500
        ${collapsed ? 'w-[68px]' : 'w-60'}
      `}
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center w-full' : ''}`}>
          <img src="/symphony-logo.jpg" alt="Symphony" className="w-8 h-8 rounded-full object-cover" />
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
        <div className="px-3 mt-4">
          <button
            onClick={onOpenSearch}
            className={`
              w-full flex items-center gap-3 px-3.5 py-3 rounded-lg
              text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100/80
              transition-all duration-200
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            {!collapsed && (
              <>
                <span className="flex-1 text-left text-[15px]">Search</span>
                <kbd className="hidden lg:inline text-[11px] text-neutral-400 font-medium">⌘/</kbd>
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
      <nav className="flex-1 px-3 mt-6 space-y-1 overflow-y-auto">
        {/* Do — always visible (no group header) */}
        <button
          onClick={() => onViewChange('today')}
          className={`
            w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
            ${activeView === 'today'
              ? 'text-primary-700 bg-primary-50/80 font-medium'
              : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
            }
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
          {!collapsed && <span className="text-[15px]">Today</span>}
        </button>

        <button
          onClick={() => onViewChange('inbox')}
          className={`
            w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
            ${activeView === 'inbox'
              ? 'text-primary-700 bg-primary-50/80 font-medium'
              : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
            }
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
          </svg>
          {!collapsed && <span className="text-[15px]">Inbox</span>}
        </button>

        {/* Plan group */}
        <SidebarGroup
          label="Plan"
          open={groupState.plan}
          forceOpen={planActive}
          onToggle={() => toggleGroup('plan')}
          collapsed={collapsed}
        >
          <button
            onClick={() => onViewChange('projects')}
            className={`
              w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
              ${activeView === 'projects'
                ? 'text-primary-700 bg-primary-50/80 font-medium'
                : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            {!collapsed && <span className="text-[15px]">Projects</span>}
          </button>

          <button
            onClick={() => onViewChange('routines')}
            className={`
              w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
              ${activeView === 'routines'
                ? 'text-primary-700 bg-primary-50/80 font-medium'
                : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            {!collapsed && <span className="text-[15px]">Routines</span>}
          </button>

          <button
            onClick={() => onViewChange('goals')}
            className={`
              w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
              ${activeView === 'goals'
                ? 'text-primary-700 bg-primary-50/80 font-medium'
                : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
            </svg>
            {!collapsed && <span className="text-[15px]">Goals</span>}
          </button>
        </SidebarGroup>

        {/* Library group */}
        <SidebarGroup
          label="Library"
          open={groupState.library}
          forceOpen={libraryActive}
          onToggle={() => toggleGroup('library')}
          collapsed={collapsed}
        >
          {FEATURES.notes && (
            <button
              onClick={() => onViewChange('notes')}
              className={`
                w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
                ${activeView === 'notes'
                  ? 'text-primary-700 bg-primary-50/80 font-medium'
                  : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
                }
                ${collapsed ? 'justify-center' : ''}
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V6.414A2 2 0 0016.414 5L14 2.586A2 2 0 0012.586 2H9z" />
                <path d="M3 8a1 1 0 011-1h1v10H4a1 1 0 01-1-1V8z" />
              </svg>
              {!collapsed && <span className="text-[15px]">Notes</span>}
            </button>
          )}

          {FEATURES.lists && (
            <button
              onClick={() => onViewChange('lists')}
              className={`
                w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
                ${activeView === 'lists'
                  ? 'text-primary-700 bg-primary-50/80 font-medium'
                  : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
                }
                ${collapsed ? 'justify-center' : ''}
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              {!collapsed && <span className="text-[15px]">Lists</span>}
            </button>
          )}

          <button
            onClick={() => onViewChange('contacts')}
            className={`
              w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
              ${activeView === 'contacts' || activeView === 'contact-detail'
                ? 'text-primary-700 bg-primary-50/80 font-medium'
                : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
            </svg>
            {!collapsed && <span className="text-[15px]">Contacts</span>}
          </button>

          <button
            onClick={() => onViewChange('history')}
            className={`
              w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
              ${activeView === 'history'
                ? 'text-primary-700 bg-primary-50/80 font-medium'
                : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
            {!collapsed && <span className="text-[15px]">History</span>}
          </button>
        </SidebarGroup>

        {/* Spaces group */}
        <SidebarGroup
          label="Spaces"
          open={groupState.spaces}
          forceOpen={spacesActive}
          onToggle={() => toggleGroup('spaces')}
          collapsed={collapsed}
        >
          {/* Home (Phase 1A — physical home registry) */}
          <button
            onClick={() => onViewChange('home-app')}
            className={`
              w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
              ${activeView === 'home-app'
                ? 'text-primary-700 bg-primary-50/80 font-medium'
                : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
            aria-label="Home"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
            {!collapsed && <span className="text-[15px]">Home</span>}
          </button>

          <button
            onClick={() => onViewChange('meals')}
            className={`
              w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
              ${activeView === 'meals'
                ? 'text-primary-700 bg-primary-50/80 font-medium'
                : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 2a1 1 0 011 1v5a2 2 0 002 2h.5a.5.5 0 01.5.5V17a1 1 0 11-2 0v-6H5a4 4 0 01-4-4V3a1 1 0 011-1h1zm6 0a1 1 0 011 1v4a3 3 0 01-2 2.83V17a1 1 0 11-2 0V9.83A3 3 0 015 7V3a1 1 0 112 0v4a1 1 0 102 0V3a1 1 0 011-1zm6 0a3 3 0 013 3v6.5a.5.5 0 01-.5.5H16v5a1 1 0 11-2 0V3a1 1 0 011-1z" />
            </svg>
            {!collapsed && <span className="text-[15px]">Meals</span>}
          </button>

          {!collapsed && activeView === 'meals' && (
            <>
              <button
                onClick={() => navigate('/meals/shelf')}
                className={`
                  w-full flex items-center gap-3 pl-9 pr-3.5 py-2 rounded-lg transition-all duration-200
                  ${location.pathname.startsWith('/meals/shelf')
                    ? 'text-primary-700 bg-primary-50/60 font-medium'
                    : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700'
                  }
                `}
              >
                <span className="text-[14px]">Shelf</span>
              </button>
              <button
                onClick={() => navigate('/meals/habits')}
                className={`
                  w-full flex items-center gap-3 pl-9 pr-3.5 py-2 rounded-lg transition-all duration-200
                  ${location.pathname.startsWith('/meals/habits')
                    ? 'text-primary-700 bg-primary-50/60 font-medium'
                    : 'text-neutral-500 hover:bg-neutral-100/60 hover:text-neutral-700'
                  }
                `}
              >
                <span className="text-[14px]">Habits</span>
              </button>
            </>
          )}
        </SidebarGroup>

        {/* Apps group (registry-driven) */}
        {(() => {
          const registryEntries = appRegistry
            .filter((a) => a.sidebar)
            .sort((a, b) => a.sidebar!.order - b.sidebar!.order)
          if (registryEntries.length === 0) return null
          return (
            <SidebarGroup
              label="Apps"
              open={groupState.apps}
              onToggle={() => toggleGroup('apps')}
              collapsed={collapsed}
            >
              {registryEntries.map((app) => {
                const Icon = app.sidebar!.icon
                const isActive = location.pathname === app.route || location.pathname.startsWith(`${app.route}/`)
                return (
                  <button
                    key={app.id}
                    onClick={() => navigate(app.route)}
                    className={`
                      w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all duration-200
                      ${isActive
                        ? 'text-primary-700 bg-primary-50/80 font-medium'
                        : 'text-neutral-600 hover:bg-neutral-100/60 hover:text-neutral-800'
                      }
                      ${collapsed ? 'justify-center' : ''}
                    `}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {!collapsed && <span className="text-[15px]">{app.sidebar!.label}</span>}
                  </button>
                )
              })}
            </SidebarGroup>
          )
        })()}
      </nav>

      {/* User section */}
      {(userEmail || userName || onSignOut) && (
        <div className={`p-3 border-t border-neutral-100 ${collapsed ? 'text-center' : ''}`}>
          <button
            onClick={() => onViewChange('settings')}
            className={`
              flex items-center gap-3 px-3.5 py-3 rounded-lg w-full transition-all duration-200
              ${activeView === 'settings'
                ? 'text-primary-700 bg-primary-50/80 font-medium'
                : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100/60'
              }
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            {!collapsed && <span className="text-[15px]">Settings</span>}
          </button>
          {onSignOut && (
            <button
              onClick={onSignOut}
              className={`
                flex items-center gap-3 px-3.5 py-3 rounded-lg w-full
                text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100/60
                transition-all duration-200
                ${collapsed ? 'justify-center' : ''}
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7z" clipRule="evenodd" />
                <path d="M7 10a1 1 0 011-1h2a1 1 0 110 2H8a1 1 0 01-1-1z" />
              </svg>
              {!collapsed && <span className="text-[15px]">Sign out</span>}
            </button>
          )}
          {!collapsed && (userName || userEmail) && (
            <div className="mt-3 px-3 pt-3 border-t border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center text-white text-[10px] font-medium shrink-0">
                  {(userName || userEmail || 'U').charAt(0).toUpperCase()}
                </div>
                <p className="text-[13px] text-neutral-500 truncate">
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
